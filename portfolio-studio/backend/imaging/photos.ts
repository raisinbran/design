import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { dialog, shell, type BrowserWindow } from "electron";
import Store from "electron-store";
import { z } from "zod";
import type { ImageRef, PortfolioApi, Recipe, Result, SavedSource } from "../api/api";
import { fileOutputFormat, isPhotoOutputFormat, photoMimeType } from "../../shared/photo-format";
import { readSettings } from "../settings";
import { resolveSiteImage } from "../storage/images";
import { loadPortfolio } from "../storage/portfolio";
import { deletePhoto, renamePhoto } from "../storage/manage";
import { addPhoto } from "../storage/add";
import { importMedia, MEDIA_EXTENSIONS } from "../storage/media";
import { photoSrc } from "../../shared/library";
import { MIN_CONFIDENCE } from "./autolevel";
import { cancelJob, runJob } from "./jobs";
import type { Job, Rendered } from "./render";

type PhotoMethods = {
  [
    M in keyof PortfolioApi as M extends `photos.${string}` | "media.import" ? M : never
  ]: PortfolioApi[M];
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
  straighten: z.number().min(-90).max(90),
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
const failure = (code: "source-missing" | "cancelled" | "internal" | "invalid", message: string) =>
  ({ ok: false, error: { code, message } }) as const;

function register(file: string): SavedSource["source"] {
  let id = [...sources].find(([, known]) => known === file)?.[0];
  if (!id) sources.set((id = randomUUID()), file);
  return { id, name: path.basename(file) };
}

async function chooseOriginals(window: BrowserWindow | null, many: boolean): Promise<string[]> {
  const choice = await dialog.showOpenDialog(window!, {
    properties: many ? ["openFile", "multiSelections"] : ["openFile"],
    filters: FILTERS,
  });
  return choice.canceled ? [] : choice.filePaths;
}

async function preview(
  sourceId: string,
  kind: "proxy" | "render" | "original",
  job: (file: string) => Exclude<Job, { kind: "appearance" | "level" | "measure" }>,
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
    ? new Response(Buffer.from(image.bytes), {
        headers: { "content-type": photoMimeType(image.format ?? "webp") },
      })
    : new Response("Not found", { status: 404 });
}

export function photoHandlers(
  window: () => BrowserWindow | null,
  folder: () => string,
): PhotoMethods {
  return {
    async "photos.import"() {
      const files = await chooseOriginals(window(), true);
      if (!files.length) return ok(null);
      writeStore((data) => ({
        ...data,
        drafts: [
          ...data.drafts,
          // A file that already has a draft keeps its edits.
          ...files
            .filter((file) => !data.drafts.some((draft) => draft.file === file))
            .map((file) => ({ file, recipe: DEFAULT_RECIPE })),
        ],
      }));
      return ok(files.map(register));
    },
    async "media.import"(section, ownerId) {
      const choice = await dialog.showOpenDialog(window()!, {
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Images and videos", extensions: MEDIA_EXTENSIONS[section] }],
      });
      if (choice.canceled) return ok(null);
      const settings = readSettings();
      const siteFolder = folder();
      try {
        // Images get the photo rules: upright, at most 800 px, WebP, the rights and the mark.
        return ok(
          await importMedia(siteFolder, section, ownerId, choice.filePaths, async (file) => {
            const image = await runJob({
              kind: "render",
              file,
              recipe: DEFAULT_RECIPE,
              format: "webp",
              settings,
              fontFile: FONT_FILE,
              siteFolder,
            });
            if (!image) throw new Error("Cancelled");
            return image.bytes;
          }),
        );
      } catch (error) {
        return failure("invalid", error instanceof Error ? error.message : String(error));
      }
    },
    async "photos.openSaved"(photoKey) {
      const saved = readStore().originals[photoKey];
      if (!saved || !existsSync(saved.file))
        return failure("source-missing", `The original of ${photoKey} is not where it was saved`);
      return ok({ source: register(saved.file), recipe: saved.recipe });
    },
    async "photos.relink"(photoKey) {
      const [file] = await chooseOriginals(window(), false);
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
    async "photos.autoLevel"(sourceId, orientation) {
      const file = sources.get(sourceId);
      if (!file) return failure("source-missing", "Import the original again");
      const found = await runJob({ kind: "level", file, orientation });
      if (!found) return failure("cancelled", "Cancelled");
      const { tilt } = found;
      if (!tilt || tilt.confidence < MIN_CONFIDENCE) return ok({ straighten: null });
      const straighten = Math.round((orientation.straighten - tilt.degrees) * 100) / 100;
      return ok({ straighten: Math.max(-90, Math.min(90, straighten)) });
    },
    async "photos.original"(sourceId) {
      return preview(sourceId, "original", (file) => ({
        kind: "proxy",
        file,
        orientation: { rotation: 0, straighten: 0 },
      }));
    },
    async "photos.render"(sourceId, recipe, format) {
      if (!isPhotoOutputFormat(format))
        return failure("invalid", "Choose a supported output format");
      const settings = readSettings();
      const siteFolder = folder();
      return preview(
        sourceId,
        "render",
        (file) => ({
          kind: "render",
          file,
          recipe,
          format,
          settings,
          fontFile: FONT_FILE,
          siteFolder,
        }),
        recipe,
      );
    },
    async "photos.appearance"() {
      const siteFolder = folder();
      const view = await loadPortfolio(siteFolder);
      const photos = await Promise.all(
        view.catalogs.photography.photos.map(async (photo) => {
          const file = photoSrc(photo);
          const url = `portfolio://site/${file.split("/").map(encodeURIComponent).join("/")}`;
          const resolved = await resolveSiteImage(siteFolder, url);
          return resolved ? { key: photo.file, file: resolved } : null;
        }),
      );
      const result = await runJob({
        kind: "appearance",
        photos: photos.filter((photo) => photo !== null),
      });
      return result ? ok(result) : failure("cancelled", "Photo analysis was cancelled");
    },
    async "photos.measure"(src) {
      const url = `portfolio://site/${src.split("/").map(encodeURIComponent).join("/")}`;
      const file = await resolveSiteImage(folder(), url);
      if (!file) return failure("invalid", `The image ${src} is missing from the website folder`);
      const measured = await runJob({ kind: "measure", file });
      return measured ? ok(measured) : failure("cancelled", "Measuring was cancelled");
    },
    async "photos.rename"(revision, oldName, newName) {
      const result = await renamePhoto(folder(), revision, oldName, newName, (file) =>
        shell.trashItem(file),
      );
      if (!result.ok) return result;
      writeStore((data) => {
        const originals = { ...data.originals };
        if (originals[oldName]) {
          originals[newName] = originals[oldName];
          delete originals[oldName];
        }
        return { ...data, originals };
      });
      return result;
    },
    async "photos.delete"(revision, photoName) {
      const result = await deletePhoto(folder(), revision, photoName, (file) =>
        shell.trashItem(file),
      );
      if (!result.ok) return result;
      writeStore((data) => {
        const originals = { ...data.originals };
        delete originals[photoName];
        return { ...data, originals };
      });
      return result;
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
      const expectedFormat =
        request.kind === "new"
          ? request.format
          : (fileOutputFormat(
              (await loadPortfolio(folder())).catalogs.photography.photos.find(
                (photo) => photo.file === request.photoKey,
              )?.thumbnail ?? "",
            ) ?? "webp");
      if (rendered.format !== expectedFormat) {
        return failure(
          "invalid",
          "The preview format changed. Render the selected format before saving.",
        );
      }
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
