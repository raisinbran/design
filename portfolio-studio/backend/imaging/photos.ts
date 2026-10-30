import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import Store from "electron-store";
import { z } from "zod";
import type { ImageRef, PortfolioApi, Recipe, Result, SavedSource } from "../api/api";
import { readSettings } from "../settings";
import { addPhoto } from "../storage/add";
import { cancelJob, runJob } from "./jobs";
import type { Rendered } from "./render";

type PhotoMethods = {
  [M in keyof PortfolioApi as M extends `photos.${string}` ? M : never]: PortfolioApi[M];
};

const FILTERS = [
  {
    name: "Photographs",
    extensions: ["jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif", "avif"],
  },
];
const DEFAULT_RECIPE: Recipe = { rotation: 0, straighten: 0 };
// Electron's asar archive is invisible to native code, so fontconfig reads the unpacked copy.
const FONT_FILE = path
  .join(__dirname, "../../assets/fonts/LiberationSans-Bold.ttf")
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

const RecipeSchema = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  straighten: z.number().min(-45).max(45),
  crop: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
}) satisfies z.ZodType<Recipe>;
const Original = z.object({ file: z.string(), recipe: RecipeSchema });
// Drafts are keyed by the original's path; saved originals by photo key.
const PhotoStore = z.object({
  drafts: z.array(Original).catch([]),
  originals: z.record(z.string(), Original).catch({}),
});
type PhotoStore = z.infer<typeof PhotoStore>;

let store: Store | undefined;
const photoStore = () => (store ??= new Store({ name: "photos", clearInvalidConfig: true }));
const readStore = (): PhotoStore => PhotoStore.parse(photoStore().store);
const writeStore = (change: (data: PhotoStore) => PhotoStore) =>
  (photoStore().store = change(readStore()));

/** The originals the UI may name, by source id. */
const sources = new Map<string, string>();
/** The latest proxy and render of each source, served at `portfolio://preview/<id>/<kind>`. */
const previews = new Map<string, Rendered & { recipe?: Recipe }>();
let version = 0;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const failure = (code: "source-missing" | "cancelled" | "internal", message: string) =>
  ({ ok: false, error: { code, message } }) as const;

function register(file: string): SavedSource["source"] {
  let id = [...sources].find(([, known]) => known === file)?.[0];
  if (!id) sources.set((id = randomUUID()), file);
  return { id, name: path.basename(file) };
}

async function chooseOriginal(window: BrowserWindow | null): Promise<string | null> {
  const choice = await dialog.showOpenDialog(window!, {
    properties: ["openFile"],
    filters: FILTERS,
  });
  return choice.canceled ? null : choice.filePaths[0];
}

async function preview(
  sourceId: string,
  kind: "proxy" | "render",
  job: (file: string) => Parameters<typeof runJob>[0],
  recipe?: Recipe,
): Promise<Result<ImageRef>> {
  const file = sources.get(sourceId);
  if (!file) return failure("source-missing", "Import the original again");
  // Keep only the source being edited, since each preview holds an image in memory.
  for (const key of previews.keys()) if (!key.startsWith(`${sourceId}/`)) previews.delete(key);
  previews.delete(`${sourceId}/${kind}`);
  const image = await runJob(job(file));
  if (!image) return failure("cancelled", "Cancelled");
  previews.set(`${sourceId}/${kind}`, { ...image, recipe });
  return ok({
    url: `portfolio://preview/${sourceId}/${kind}?v=${++version}`,
    width: image.width,
    height: image.height,
    bytes: image.bytes.byteLength,
  });
}

/** Answers a `portfolio://preview/<source id>/<proxy or render>` request from memory. */
export function previewResponse(url: URL): Response {
  const image = previews.get(url.pathname.slice(1));
  return image
    ? new Response(Buffer.from(image.bytes), { headers: { "content-type": "image/webp" } })
    : new Response("Not found", { status: 404 });
}

export function photoHandlers(
  window: () => BrowserWindow | null,
  folder: () => string,
): PhotoMethods {
  return {
    async "photos.import"() {
      const file = await chooseOriginal(window());
      if (!file) return ok(null);
      writeStore((data) => ({
        ...data,
        drafts: [
          ...data.drafts.filter((draft) => draft.file !== file),
          { file, recipe: DEFAULT_RECIPE },
        ],
      }));
      return ok(register(file));
    },
    async "photos.openSaved"(photoKey) {
      const saved = readStore().originals[photoKey];
      if (!saved || !existsSync(saved.file))
        return failure("source-missing", `The original of ${photoKey} is not where it was saved`);
      return ok({ source: register(saved.file), recipe: saved.recipe });
    },
    async "photos.relink"(photoKey) {
      const file = await chooseOriginal(window());
      if (!file) return ok(null);
      const recipe = readStore().originals[photoKey]?.recipe ?? DEFAULT_RECIPE;
      writeStore((data) => ({
        ...data,
        originals: { ...data.originals, [photoKey]: { file, recipe } },
      }));
      return ok({ source: register(file), recipe });
    },
    async "photos.proxy"(sourceId, orientation) {
      return preview(sourceId, "proxy", (file) => ({ kind: "proxy", file, orientation }));
    },
    async "photos.render"(sourceId, recipe) {
      const settings = readSettings();
      return preview(
        sourceId,
        "render",
        (file) => ({ kind: "render", file, recipe, settings, fontFile: FONT_FILE }),
        recipe,
      );
    },
    async "photos.cancel"() {
      cancelJob();
      return ok(null);
    },
    async "photos.add"(request) {
      const file = sources.get(request.sourceId);
      const rendered = previews.get(`${request.sourceId}/render`);
      if (!file || !rendered?.recipe)
        return failure("internal", "Render the photo before adding it");
      const added = await addPhoto(folder(), request, rendered);
      if (!added.ok) return added;
      const { photoKey } = added.value;
      writeStore((data) => ({
        drafts: data.drafts.filter((draft) => draft.file !== file),
        originals: { ...data.originals, [photoKey]: { file, recipe: rendered.recipe! } },
      }));
      return added;
    },
    async "photos.drafts"() {
      // A draft whose original is missing, such as on an unmounted drive, stays saved but hidden.
      const drafts = readStore().drafts.filter((draft) => existsSync(draft.file));
      return ok(drafts.map((draft) => ({ source: register(draft.file), recipe: draft.recipe })));
    },
    async "photos.saveDraft"(sourceId, recipe) {
      const file = sources.get(sourceId);
      if (!file) return failure("source-missing", "Import the original again");
      writeStore((data) => ({
        ...data,
        drafts: data.drafts.map((draft) => (draft.file === file ? { file, recipe } : draft)),
      }));
      return ok(null);
    },
    async "photos.discardDraft"(sourceId) {
      const file = sources.get(sourceId);
      writeStore((data) => ({
        ...data,
        drafts: data.drafts.filter((draft) => draft.file !== file),
      }));
      return ok(null);
    },
  };
}
