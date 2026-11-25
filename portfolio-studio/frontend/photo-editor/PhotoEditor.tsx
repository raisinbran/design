// Coordinates persistent drafts, proxy previews and the final published render in one view; kept whole because the toolbar, viewport and publish form share one editing state.
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NavLink,
  NumberInput,
  Select,
  Slider,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
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
import {
  DEFAULT_VIEWPORT,
  GRID_MODES,
  sliderFromZoom,
  zoomFromSlider,
  type GridMode,
  type Viewport,
  angleOf,
  canRedo,
  canUndo,
  change,
  isEdited,
  levelGuide,
  redo,
  reset,
  startHistory,
  undo,
  withAngle,
  type CropRect,
  type History,
  type Point,
} from "./geometry";
import { catalogNameWithSuffix, SUFFIX_OPTIONS, validSuffix } from "./naming";
import { PhotoViewport } from "./PhotoViewport";
import {
  aspectOf,
  choosePreset,
  cropWithAspect,
  editProportion,
  FREEFORM,
  PRESETS,
  setOrientation,
  type Preset,
  type RatioState,
} from "./ratio";
import { cropControlsEnabled, toggleTool, type Tool } from "./tools";
import {
  DEFAULT_PHOTO_OUTPUT_FORMAT,
  fileOutputFormat,
  isPhotoOutputFormat,
  photoBaseNameProblem,
  publishedFilename,
  type PhotoOutputFormat,
} from "../../shared/photo-format";

/** The photo being edited; `photoKey` is set for Edit Image, which has no draft. */
interface Editing extends Draft {
  photoKey?: string;
}

const FORMAT_CHOICES = [
  { value: "webp", label: ".webp (rec)" },
  { value: "jpg", label: ".jpg" },
  { value: "png", label: ".png" },
];

/** A button with only a symbol: it needs an accessible label and an instant tooltip. */
function IconTool(props: {
  label: string;
  symbol: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={props.label} openDelay={0} closeDelay={0} transitionProps={{ duration: 0 }}>
      <ActionIcon
        variant={props.pressed ? "filled" : "default"}
        size={32}
        aria-label={props.label}
        aria-pressed={props.pressed}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.symbol}
      </ActionIcon>
    </Tooltip>
  );
}

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
  const [proxyOf, setProxyOf] = useState("");
  const [original, setOriginal] = useState<ImageRef | null>(null);
  const [comparing, setComparing] = useState(false);
  const originalFor = useRef("");
  const [leveling, setLeveling] = useState(false);
  const openId = useRef("");
  const [rendered, setRendered] = useState<{
    image: ImageRef;
    recipe: Recipe;
    format: PhotoOutputFormat;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState<History>(startHistory({ rotation: 0, straighten: 0 }));
  const [tool, setTool] = useState<Tool>("none");
  const [confirmReset, setConfirmReset] = useState(false);
  const [help, setHelp] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [grid, setGrid] = useState<GridMode>("Off");
  const [ratio, setRatio] = useState<RatioState>(FREEFORM);
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
    openId.current = next.source.id;
    originalFor.current = "";
    setOriginal(null);
    setRatio(FREEFORM);
    setViewport(DEFAULT_VIEWPORT);
    setHistory(startHistory(next.recipe));
    setTool("none");
    setSuffixChoice("_crop");
    setCustomSuffix("_portfolio");
    setName(next.photoKey ? next.photoKey : catalogNameWithSuffix(next.source.name, "_crop"));
    const savedPhoto = view?.catalogs.photography.photos.find(
      (photo) => photo.file === next.photoKey,
    );
    setOutputFormat(
      next.photoKey
        ? (fileOutputFormat(savedPhoto?.thumbnail ?? "") ?? DEFAULT_PHOTO_OUTPUT_FORMAT)
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTool("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const recipe = history.present;

  // Each recipe change renders again after a short pause; the proxy is redrawn only when the
  // orientation changes. A newer job ends the running one, and its stale result is ignored.
  useEffect(() => {
    if (!editing) return;
    const run = ++generation.current;
    const { source, photoKey: key } = editing;
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
        setProxyOf(orientation);
      }
      const image = settled(
        await window.portfolio["photos.render"](source.id, recipe, outputFormat),
      );
      if (!image) return;
      setRendered({ image, recipe, format: outputFormat });
      setBusy(false);
      if (!key) void window.portfolio["photos.saveDraft"](source.id, recipe);
      // The unedited preview for the eye button loads once, after the first render; a newer job cancels it.
      if (originalFor.current !== source.id) {
        const plain = await window.portfolio["photos.original"](source.id);
        if (run === generation.current && plain.ok) {
          originalFor.current = source.id;
          setOriginal(plain.value);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [editing, recipe, outputFormat]);

  const changeRecipe = (next: Recipe) => setHistory((h) => change(h, next));

  function applyGuide(mode: "H" | "V", start: Point, end: Point) {
    const straighten = levelGuide(mode, start, end, recipe.straighten);
    if (straighten === recipe.straighten) return;
    changeRecipe({ ...recipe, straighten, crop: undefined });
  }

  // The measurement belongs to the photo and recipe it started from; a newer edit makes it obsolete.
  async function autoLevel() {
    if (!editing) return;
    const { revision } = history;
    const { id } = editing.source;
    const { rotation, straighten } = recipe;
    setLeveling(true);
    try {
      const found = await window.portfolio["photos.autoLevel"](id, { rotation, straighten });
      if (!found.ok) {
        if (found.error.code !== "cancelled") setError(found.error.message);
        return;
      }
      if (found.value.straighten === null) {
        setError(
          "No clear horizontal or vertical lines found. Level it with a guide or the angle.",
        );
        return;
      }
      setError(null);
      const level = found.value.straighten;
      setHistory((h) =>
        h.revision === revision && openId.current === id
          ? change(h, { ...h.present, straighten: level, crop: undefined })
          : h,
      );
    } finally {
      setLeveling(false);
    }
  }

  async function importOriginal() {
    await runShowingErrors(async () => {
      const sources = await call(window.portfolio["photos.import"]());
      if (!sources?.length) return;
      const added: Draft[] = sources.map(
        (source) =>
          drafts.find((item) => item.source.id === source.id) ?? {
            source,
            recipe: { rotation: 0, straighten: 0 },
          },
      );
      setDrafts([
        ...drafts.filter((item) => !sources.some(({ id }) => id === item.source.id)),
        ...added,
      ]);
      open(added[0]);
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

  // A new ratio reshapes the crop around its centre at once; nothing is written until Add.
  function applyRatio(next: RatioState) {
    setRatio(next);
    const shape = aspectOf(next);
    if (shape && proxy && !stale)
      changeRecipe({ ...recipe, crop: cropWithAspect(recipe.crop, shape, proxy) });
  }

  const commitCrop = (crop: CropRect) => changeRecipe({ ...recipe, crop });
  const crop = recipe.crop;
  const cropOn = cropControlsEnabled(tool, !!crop);
  // Until the new preview arrives the image shows an older angle, so only pan and zoom are safe.
  const stale =
    !editing || proxyOf !== `${editing.source.id} ${recipe.rotation} ${recipe.straighten}`;

  const current =
    rendered && editing && rendered.recipe === recipe && rendered.format === outputFormat && !busy;
  const validChoice = suffixChoice !== "custom" || validSuffix(customSuffix);
  const nameProblem = photoBaseNameProblem(name.trim());
  const described =
    !!editing?.photoKey || (!nameProblem && !!alt.trim() && tags.length > 0 && validChoice);

  return (
    <Group align="flex-start" wrap="nowrap">
      <Stack w={240} gap="xs">
        <Button onClick={importOriginal}>Import originals</Button>
        {drafts.map((draft) => (
          <NavLink
            key={draft.source.id}
            label={draft.source.name}
            active={editing?.source.id === draft.source.id}
            onClick={() => open(draft)}
          />
        ))}
      </Stack>
      <Stack flex={1} miw={0}>
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
            <Group gap="xs" wrap="nowrap" h={36} aria-label="Tools" role="toolbar">
              <IconTool
                label="Crop"
                symbol="▭"
                pressed={tool === "crop"}
                onClick={() => setTool(toggleTool(tool, "crop"))}
              />
              <IconTool
                label="Level horizontal"
                symbol="↔"
                pressed={tool === "levelH"}
                onClick={() => setTool(toggleTool(tool, "levelH"))}
              />
              <IconTool
                label="Level vertical"
                symbol="↕"
                pressed={tool === "levelV"}
                onClick={() => setTool(toggleTool(tool, "levelV"))}
              />
              <IconTool
                label="Auto-level"
                symbol="⟂"
                disabled={stale || busy || leveling}
                onClick={() => void autoLevel()}
              />
              <NumberInput
                aria-label="Angle"
                suffix="°"
                min={-360}
                max={360}
                step={0.1}
                decimalScale={1}
                clampBehavior="strict"
                w={90}
                size="xs"
                value={angleOf(recipe)}
                onChange={(value) => changeRecipe(withAngle(recipe, Number(value) || 0))}
              />
              <IconTool
                label="Undo"
                symbol="↶"
                disabled={!canUndo(history)}
                onClick={() => setHistory(undo)}
              />
              <IconTool
                label="Redo"
                symbol="↷"
                disabled={!canRedo(history)}
                onClick={() => setHistory(redo)}
              />
              <Button
                variant="default"
                size="xs"
                disabled={!isEdited(recipe)}
                onClick={() => setConfirmReset(true)}
              >
                Reset
              </Button>
              <IconTool label="Help" symbol="?" onClick={() => setHelp(true)} />
            </Group>
            <Group gap="xs" wrap="nowrap" h={36} aria-label="Aspect and view" role="toolbar">
              <Select
                aria-label="Aspect"
                size="xs"
                w={110}
                data={[...PRESETS]}
                value={ratio.preset}
                allowDeselect={false}
                disabled={!cropOn}
                comboboxProps={{ transitionProps: { duration: 0 } }}
                onChange={(choice) => {
                  if (choice && proxy) applyRatio(choosePreset(ratio, choice as Preset, proxy));
                }}
              />
              {(["width", "height"] as const).map((side) => (
                <NumberInput
                  key={side}
                  aria-label={side === "width" ? "Width" : "Height"}
                  size="xs"
                  w={78}
                  min={0}
                  hideControls
                  leftSection={<Text size="xs">{side === "width" ? "W" : "H"}</Text>}
                  disabled={!cropOn || ratio.preset === "Freeform"}
                  value={ratio[side] ?? ""}
                  onChange={(value) => applyRatio(editProportion(ratio, side, value))}
                />
              ))}
              <Text size="xs" c="dimmed">
                Orientation
              </Text>
              <IconTool
                label="Landscape"
                symbol="▭"
                pressed={ratio.orientation === "landscape"}
                disabled={!cropOn || ratio.preset === "Freeform"}
                onClick={() => applyRatio(setOrientation(ratio, "landscape"))}
              />
              <IconTool
                label="Portrait"
                symbol="▯"
                pressed={ratio.orientation === "portrait"}
                disabled={!cropOn || ratio.preset === "Freeform"}
                onClick={() => applyRatio(setOrientation(ratio, "portrait"))}
              />
              <IconTool
                label="Clear crop"
                symbol="✕"
                disabled={!crop}
                onClick={() => changeRecipe({ ...recipe, crop: undefined })}
              />
              <Select
                aria-label="Grid"
                size="xs"
                w={96}
                data={GRID_MODES.map((mode) => ({
                  value: mode,
                  label: mode === "Off" ? "Grid: Off" : mode,
                }))}
                value={grid}
                allowDeselect={false}
                comboboxProps={{ transitionProps: { duration: 0 } }}
                onChange={(choice) => choice && setGrid(choice as GridMode)}
              />
              <Slider
                aria-label="Zoom (100% is the photo fitted to the window)"
                w={120}
                min={0}
                max={1}
                step={0.005}
                marks={[{ value: 0.5 }]}
                label={(t) => `${Math.round(zoomFromSlider(t) * 100)}%`}
                value={sliderFromZoom(viewport.zoom)}
                onChange={(t) => setViewport({ ...viewport, zoom: zoomFromSlider(t) })}
              />
              <Tooltip
                label="Show original (hold)"
                openDelay={0}
                closeDelay={0}
                transitionProps={{ duration: 0 }}
              >
                <ActionIcon
                  variant={comparing ? "filled" : "default"}
                  size={32}
                  aria-label="Show original (hold)"
                  aria-pressed={comparing}
                  disabled={!original}
                  onPointerDown={() => setComparing(true)}
                  onPointerUp={() => setComparing(false)}
                  onPointerLeave={() => setComparing(false)}
                  onPointerCancel={() => setComparing(false)}
                  onBlur={() => setComparing(false)}
                  onKeyDown={(event) =>
                    (event.key === " " || event.key === "Enter") && setComparing(true)
                  }
                  onKeyUp={() => setComparing(false)}
                >
                  ◉
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" ml="auto">
                {busy ? "Rendering…" : ""}
              </Text>
              <Button
                variant="default"
                size="xs"
                disabled={!busy}
                onClick={() => void window.portfolio["photos.cancel"]()}
              >
                Cancel
              </Button>
            </Group>
            {proxy && (
              <PhotoViewport
                image={comparing && original ? original : proxy}
                key={editing.source.id}
                tool={stale || comparing ? "none" : tool}
                crop={comparing ? undefined : crop}
                aspect={aspectOf(ratio)}
                viewport={viewport}
                onViewport={setViewport}
                grid={grid}
                height="55vh"
                onCrop={commitCrop}
                onGuide={applyGuide}
              />
            )}
            {rendered && rendered.format === outputFormat && (
              <>
                <img
                  src={rendered.image.url}
                  alt=""
                  style={{ maxWidth: 400, maxHeight: 400, alignSelf: "flex-start" }}
                />
                <Text size="sm">
                  Published preview (.{outputFormat}): {rendered.image.width} ×{" "}
                  {rendered.image.height} px, {kilobytes(rendered.image.bytes)}
                </Text>
              </>
            )}
            {!editing.photoKey && (
              <>
                <Select
                  label="Filename suffix"
                  description="Appended to Name, before the selected output filetype."
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
                  Website file: images/Photography/
                  {nameProblem
                    ? "(enter a valid name)"
                    : publishedFilename(name.trim(), outputFormat)}
                </Text>
                <Text size="sm" c="dimmed">
                  The photo is converted to .{outputFormat}, up to 800 px on its longest side, with
                  a watermark and rights metadata. The private original is unchanged.
                </Text>
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
      <Modal opened={confirmReset} onClose={() => setConfirmReset(false)} title="Reset edits">
        <Text>Remove the rotation, straightening and crop from this photo? You can undo it.</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmReset(false);
              setHistory(reset);
              setRatio(FREEFORM);
              setTool("none");
            }}
          >
            Reset
          </Button>
        </Group>
      </Modal>
      <Modal opened={help} onClose={() => setHelp(false)} title="Photo editor help">
        <Text size="sm">
          With no tool selected, drag the photo to move it and scroll to zoom. Crop draws, moves and
          resizes the crop. Level horizontal or vertical: drag along a line that should be level;
          the photo turns to match. Type an angle in the box to rotate. Esc or clicking the tool
          again returns to moving the photo.
        </Text>
      </Modal>
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
