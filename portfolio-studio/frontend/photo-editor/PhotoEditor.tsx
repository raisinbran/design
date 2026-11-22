// Coordinates persistent drafts, proxy previews and the final published render in one view.
import {
  Button,
  Group,
  Modal,
  NavLink,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type {
  AddRequest,
  Draft,
  ImageRef,
  PortfolioView,
  Recipe,
  Result,
} from "../../backend/api/api";
import { isDirty, useEditor } from "../app/editor";
import { call, runShowingErrors } from "../app/portfolio";
import { catalogNameWithSuffix, SUFFIX_OPTIONS, validSuffix } from "./naming";
import {
  DEFAULT_PHOTO_OUTPUT_FORMAT,
  fileOutputFormat,
  isPhotoOutputFormat,
  photoBaseNameProblem,
  publishedFilename,
  type PhotoOutputFormat,
} from "../../backend/api/photo-format";

/** The photo being edited; `photoKey` is set for Edit Image, which has no draft. */
interface Editing extends Draft {
  photoKey?: string;
}

const FORMAT_CHOICES = [
  { value: "webp", label: ".webp (recommended)" },
  { value: "jpg", label: ".jpg" },
  { value: "png", label: ".png" },
  { value: "heic", label: ".heic" },
];

const ASPECTS: Record<string, number | undefined> = {
  Free: undefined,
  "1:1": 1,
  "4:5": 0.8,
  "3:2": 1.5,
};

const toPercent = (crop: Recipe["crop"]): PercentCrop | undefined =>
  crop && {
    unit: "%",
    x: crop.x * 100,
    y: crop.y * 100,
    width: crop.width * 100,
    height: crop.height * 100,
  };

const kilobytes = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

interface PhotoEditorProps {
  /** Each Edit Image click passes a new object, so clicking the same photo again reopens it. */
  editImage: { photoKey: string } | null;
  onAdded: (view: PortfolioView) => void;
}

export function PhotoEditor({ editImage, onAdded }: PhotoEditorProps) {
  const view = useEditor((state) => state.view);
  const dirty = useEditor(isDirty);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [proxy, setProxy] = useState<ImageRef | null>(null);
  const [rendered, setRendered] = useState<{
    image: ImageRef;
    recipe: Recipe;
    format: PhotoOutputFormat;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [crop, setCrop] = useState<PercentCrop | undefined>();
  const [aspect, setAspect] = useState("Free");
  const [name, setName] = useState("");
  const [outputFormat, setOutputFormat] = useState<PhotoOutputFormat>(DEFAULT_PHOTO_OUTPUT_FORMAT);
  const [suffixChoice, setSuffixChoice] = useState("_crop");
  const [customSuffix, setCustomSuffix] = useState("_portfolio");
  const [alt, setAlt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proxyFor = useRef("");
  const generation = useRef(0);

  function open(next: Editing) {
    setEditing(next);
    setCrop(toPercent(next.recipe.crop));
    setSuffixChoice("_crop");
    setCustomSuffix("_portfolio");
    setName(next.photoKey ? next.photoKey : catalogNameWithSuffix(next.source.name, "_crop"));
    const savedPhoto = view?.catalogs.photography.photos.find(
      (photo) => photo.file === next.photoKey,
    );
    setOutputFormat(
      next.photoKey
        ? fileOutputFormat(savedPhoto?.thumbnail ?? "") ?? DEFAULT_PHOTO_OUTPUT_FORMAT
        : DEFAULT_PHOTO_OUTPUT_FORMAT,
    );
    setAlt("");
    setTags([]);
    setError(null);
  }

  useEffect(() => {
    void runShowingErrors(
      async () => setDrafts(await call(window.portfolio["photos.drafts"]())),
      setError,
    );
  }, []);

  useEffect(() => {
    setMissing(null);
    if (!editImage) return;
    const { photoKey } = editImage;
    void window.portfolio["photos.openSaved"](photoKey).then((saved) => {
      if (saved.ok) open({ ...saved.value, photoKey });
      else if (saved.error.code === "source-missing") setMissing(saved.error.message);
      else setError(saved.error.message);
    });
  }, [editImage]);

  // Each recipe change renders again after a short pause; the proxy is redrawn only when the
  // orientation changes. A newer job ends the running one, and its stale result is ignored.
  useEffect(() => {
    if (!editing) return;
    const run = ++generation.current;
    const { source, recipe, photoKey: key } = editing;
    const timer = setTimeout(async () => {
      // Returns null for a stale result or a failed job. A cancelled job shows no error.
      const settled = (result: Result<ImageRef>) => {
        if (run !== generation.current) return null;
        if (result.ok) return result.value;
        setBusy(false);
        if (result.error.code !== "cancelled") setError(result.error.message);
        return null;
      };
      setBusy(true);
      const orientation = `${source.id} ${recipe.rotation} ${recipe.straighten}`;
      if (proxyFor.current !== orientation) {
        const shown = settled(
          await window.portfolio["photos.proxy"](source.id, {
            rotation: recipe.rotation,
            straighten: recipe.straighten,
          }),
        );
        if (!shown) return;
        proxyFor.current = orientation;
        setProxy(shown);
      }
      const image = settled(
        await window.portfolio["photos.render"](source.id, recipe, outputFormat),
      );
      if (!image) return;
      setRendered({ image, recipe, format: outputFormat });
      setBusy(false);
      if (!key) void window.portfolio["photos.saveDraft"](source.id, recipe);
    }, 300);
    return () => clearTimeout(timer);
  }, [editing, outputFormat]);

  const changeRecipe = (recipe: Recipe) => editing && setEditing({ ...editing, recipe });

  // A quarter turn changes the shape of the safe rectangle, so the crop starts over.
  function rotate(degrees: number) {
    if (!editing) return;
    setCrop(undefined);
    const rotation = ((editing.recipe.rotation + degrees) % 360) as Recipe["rotation"];
    changeRecipe({ ...editing.recipe, rotation, crop: undefined });
  }

  async function importOriginal() {
    await runShowingErrors(async () => {
      const source = await call(window.portfolio["photos.import"]());
      if (!source) return;
      const draft = { source, recipe: { rotation: 0, straighten: 0 } as const };
      setDrafts([...drafts.filter((item) => item.source.id !== source.id), draft]);
      open(draft);
    }, setError);
  }

  async function relink() {
    await runShowingErrors(async () => {
      const saved = await call(window.portfolio["photos.relink"](editImage!.photoKey));
      if (!saved) return;
      setMissing(null);
      open({ ...saved, photoKey: editImage!.photoKey });
    }, setError);
  }

  async function discard() {
    if (!editing) return;
    await window.portfolio["photos.discardDraft"](editing.source.id);
    setDrafts(drafts.filter((item) => item.source.id !== editing.source.id));
    setEditing(null);
  }

  async function add(overwrite = false) {
    if (!editing || !view) return;
    const request: AddRequest = editing.photoKey
      ? {
          kind: "replace",
          revision: view.revision,
          sourceId: editing.source.id,
          photoKey: editing.photoKey,
        }
      : {
          kind: "new",
          revision: view.revision,
          sourceId: editing.source.id,
          name,
          format: outputFormat,
          alt,
          tags,
          overwrite,
        };
    setAdding(true);
    setError(null);
    try {
      const added = await window.portfolio["photos.add"](request);
      if (added.ok) {
        setDrafts(drafts.filter((item) => item.source.id !== editing.source.id));
        setEditing(null);
        onAdded(added.value.view);
      } else if (added.error.code === "name-conflict") setConflict(added.error.message);
      else setError(added.error.message);
    } finally {
      setAdding(false);
    }
  }

  function chooseAspect(choice: string) {
    setAspect(choice);
    const ratio = ASPECTS[choice];
    if (!ratio || !proxy || !editing) return;
    const fill = ratio > proxy.width / proxy.height ? { width: 100 } : { height: 100 };
    const next = centerCrop(
      makeAspectCrop({ unit: "%", ...fill }, ratio, proxy.width, proxy.height),
      proxy.width,
      proxy.height,
    );
    setCrop(next);
    commitCrop(next);
  }

  function commitCrop(percent: PercentCrop) {
    if (!editing) return;
    const { x, y, width, height } = percent;
    changeRecipe({
      ...editing.recipe,
      crop:
        width && height
          ? { x: x / 100, y: y / 100, width: width / 100, height: height / 100 }
          : undefined,
    });
  }

  const current =
    rendered &&
    editing &&
    rendered.recipe === editing.recipe &&
    rendered.format === outputFormat &&
    !busy;
  const validChoice = suffixChoice !== "custom" || validSuffix(customSuffix);
  const nameProblem = photoBaseNameProblem(name.trim());
  const described =
    !!editing?.photoKey ||
    (!nameProblem && !!alt.trim() && tags.length > 0 && validChoice);

  return (
    <Group align="flex-start" wrap="nowrap">
      <Stack w={240} gap="xs">
        <Button onClick={importOriginal}>Import original</Button>
        {drafts.map((draft) => (
          <NavLink
            key={draft.source.id}
            label={draft.source.name}
            active={editing?.source.id === draft.source.id}
            onClick={() => open(draft)}
          />
        ))}
      </Stack>
      <Stack flex={1}>
        {missing && (
          <Group>
            <Text c="red">{missing}</Text>
            <Button variant="default" onClick={relink}>
              Relink original
            </Button>
          </Group>
        )}
        {error && <Text c="red">{error}</Text>}
        {editing && (
          <>
            <Title order={3}>
              {editing.photoKey ? `Edit Image: ${editing.photoKey}` : editing.source.name}
            </Title>
            <Group align="flex-end">
              <Button variant="default" onClick={() => rotate(270)}>
                Rotate left
              </Button>
              <Button variant="default" onClick={() => rotate(90)}>
                Rotate right
              </Button>
              <NumberInput
                label="Straighten"
                suffix="°"
                min={-45}
                max={45}
                step={0.1}
                decimalScale={1}
                clampBehavior="strict"
                w={120}
                value={editing.recipe.straighten}
                onChange={(value) =>
                  changeRecipe({ ...editing.recipe, straighten: Number(value) || 0 })
                }
              />
              <SegmentedControl
                data={Object.keys(ASPECTS)}
                value={aspect}
                onChange={chooseAspect}
              />
              {busy && (
                <Button variant="default" onClick={() => void window.portfolio["photos.cancel"]()}>
                  Cancel
                </Button>
              )}
            </Group>
            {proxy && (
              <ReactCrop
                crop={crop}
                aspect={ASPECTS[aspect]}
                keepSelection
                onChange={(_, percent) => setCrop(percent)}
                onComplete={(_, percent) => commitCrop(percent)}
              >
                <img src={proxy.url} alt="" style={{ maxWidth: "100%", maxHeight: "60vh" }} />
              </ReactCrop>
            )}
            <Text size="sm" c="dimmed">
              {crop?.width
                ? `Crop: ${crop.x.toFixed(1)}% from left, ${crop.y.toFixed(1)}% from top, ${crop.width.toFixed(1)}% × ${crop.height.toFixed(1)}%`
                : "No crop: the whole straightened photo"}
            </Text>
            {rendered && rendered.format === outputFormat && (
              <>
                <img
                  src={rendered.image.url}
                  alt=""
                  style={{ maxWidth: 400, maxHeight: 400, alignSelf: "flex-start" }}
                />
                <Text size="sm">
                  Published preview (.{outputFormat}): {rendered.image.width} × {rendered.image.height} px,{" "}
                  {kilobytes(rendered.image.bytes)}
                </Text>
              </>
            )}
            {!editing.photoKey && (
              <>
                <Select
                  label="Filename suffix"
                  description="Choose the ending added before the source extension."
                  data={SUFFIX_OPTIONS}
                  value={suffixChoice}
                  allowDeselect={false}
                  onChange={(choice) => {
                    if (!choice) return;
                    setSuffixChoice(choice);
                    const ending = choice === "custom" ? customSuffix : choice;
                    if (validSuffix(ending))
                      setName(catalogNameWithSuffix(editing.source.name, ending));
                  }}
                />
                {suffixChoice === "custom" && (
                  <TextInput
                    label="Custom suffix"
                    error={
                      !validSuffix(customSuffix) &&
                      "Use _ followed by 1–20 letters, numbers, _ or -."
                    }
                    value={customSuffix}
                    onChange={(event) => {
                      const ending = event.currentTarget.value;
                      setCustomSuffix(ending);
                      if (validSuffix(ending))
                        setName(catalogNameWithSuffix(editing.source.name, ending));
                    }}
                  />
                )}
                <Group align="flex-start" gap="xs" wrap="nowrap">
                  <TextInput
                    label="Name"
                    description="Filename without extension"
                    style={{ flex: "1 1 0", minWidth: 0 }}
                    required
                    value={name}
                    error={nameProblem || undefined}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                  <Select
                    label="Output filetype"
                    description="Actual website image format"
                    w={190}
                    data={FORMAT_CHOICES}
                    value={outputFormat}
                    allowDeselect={false}
                    onChange={(choice) => {
                      if (isPhotoOutputFormat(choice)) setOutputFormat(choice);
                    }}
                  />
                </Group>
                <Text size="sm" fw={600}>
                  Website file: photography/thumbnails/
                  {nameProblem ? "(enter a valid name)" : publishedFilename(name.trim(), outputFormat)}
                </Text>
                <Text size="sm" c="dimmed">
                  The photo is converted to .{outputFormat}, up to 800 px on its longest side,
                  with a watermark and rights metadata. The private original is unchanged.
                </Text>
                {outputFormat === "heic" && (
                  <Text size="sm" c="orange">
                    HEIC export requires optional native HEVC encoding libraries and may fail
                    on this computer. Many website browsers cannot display HEIC; WebP is
                    recommended for a publicly viewable gallery. No fallback filetype is
                    silently substituted.
                  </Text>
                )}
                <Textarea
                  label="Description"
                  description="Also the alt text that screen readers read aloud"
                  required
                  autosize
                  minRows={2}
                  value={alt}
                  onChange={(event) => setAlt(event.currentTarget.value)}
                />
                <TagsInput
                  label="Tags"
                  description="A new tag also becomes a filter on the site"
                  required
                  data={view?.catalogs.photography.photoTags ?? []}
                  value={tags}
                  onChange={setTags}
                />
              </>
            )}
            {dirty && <Text c="orange">Save or reload your edits before adding.</Text>}
            <Group>
              <Button
                disabled={!current || !described || dirty}
                loading={adding}
                onClick={() => void add()}
              >
                {editing.photoKey ? "Replace image" : "Add to Photo Catalog"}
              </Button>
              {!editing.photoKey && (
                <Button variant="default" onClick={discard}>
                  Discard draft
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
      <Modal opened={conflict !== null} onClose={() => setConflict(null)} title="Name taken">
        <Text>{conflict}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConflict(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              setConflict(null);
              void add(true);
            }}
          >
            Overwrite
          </Button>
        </Group>
      </Modal>
    </Group>
  );
}
