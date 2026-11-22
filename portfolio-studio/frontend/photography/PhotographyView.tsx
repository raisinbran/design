import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Checkbox,
  Group,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import type { Catalogs } from "../../backend/api/api";
import { editCatalogs, isDirty, useEditor } from "../app/editor";
import { EditorColumns } from "../app/EditorColumns";
import { siteImage } from "../app/portfolio";
import {
  arrangePhotos,
  movePhoto,
  reverseUnlocked,
  suggestArrangement,
  type ArrangementStrategy,
} from "./arrangement";

type Photography = Catalogs["photography"];
type Photo = Photography["photos"][number];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "portraitBoost", label: "Portrait boost" },
  { value: "featured", label: "Featured" },
];

const ARRANGEMENTS: { value: ArrangementStrategy | "tags"; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "color", label: "Color harmony" },
  { value: "themes", label: "Thematic groups" },
  { value: "contrast", label: "Visual contrast" },
  { value: "tags", label: "Tags + alternating shapes" },
];

const photoUrl = (photo: Photo) =>
  siteImage(
    photo.thumbnail
      ? `photography/thumbnails/${photo.thumbnail}`
      : `photography/published/${photo.file}`,
  );

function editPhotography(change: (photography: Photography) => Photography) {
  editCatalogs((catalogs) => ({ ...catalogs, photography: change(catalogs.photography) }));
}

function editPhoto(file: string, values: Partial<Photo>) {
  editPhotography((photography) => ({
    ...photography,
    photos: photography.photos.map((photo) =>
      photo.file === file ? { ...photo, ...values } : photo,
    ),
  }));
}

// A new tag goes to the end of photoTags, which is also the order of the site's filter chips.
function setTags(file: string, tags: string[]) {
  editPhotography((photography) => ({
    ...photography,
    photoTags: [
      ...photography.photoTags,
      ...tags.filter((tag) => !photography.photoTags.includes(tag)),
    ],
    photos: photography.photos.map((photo) => (photo.file === file ? { ...photo, tags } : photo)),
  }));
}

interface PhotographyViewProps {
  catalog: Photography;
  onEditImage: (photoKey: string) => void;
}

export function PhotographyView({ catalog, onEditImage }: PhotographyViewProps) {
  const [selected, setSelected] = useState(catalog.photos[0]?.file);
  const [search, setSearch] = useState("");
  const [arranging, setArranging] = useState(false);
  const [arrangementError, setArrangementError] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const shown = catalog.photos.filter((photo) =>
    `${photo.alt} ${photo.file} ${photo.tags.join(" ")}`.toLowerCase().includes(query),
  );
  const photo = catalog.photos.find((item) => item.file === selected);
  const selectedIndex = catalog.photos.findIndex((item) => item.file === selected);
  const canMove = (direction: -1 | 1) => {
    const next = selectedIndex + direction;
    return (
      !query &&
      selectedIndex >= 0 &&
      next >= 0 &&
      next < catalog.photos.length &&
      !catalog.photos[selectedIndex].locked &&
      !catalog.photos[next].locked
    );
  };
  const moveSelected = (direction: -1 | 1) => {
    if (!canMove(direction)) return;
    editPhotography((photography) => ({
      ...photography,
      photos: movePhoto(photography.photos, selectedIndex, selectedIndex + direction),
    }));
  };

  async function applyArrangement(strategy: ArrangementStrategy | "tags", reverse: boolean) {
    setArrangementError(null);
    setArranging(true);
    try {
      const appearances =
        strategy === "tags" ? null : await window.portfolio["photos.appearance"]();
      if (appearances && !appearances.ok) throw new Error(appearances.error.message);
      editPhotography((photography) => {
        const ordered =
          strategy === "tags"
            ? suggestArrangement(photography.photos, photography.photoTags)
            : arrangePhotos(photography.photos, strategy, appearances!.value);
        return { ...photography, photos: reverse ? reverseUnlocked(ordered) : ordered };
      });
    } catch (error) {
      setArrangementError(error instanceof Error ? error.message : String(error));
    } finally {
      setArranging(false);
    }
  }

  return (
    <EditorColumns
      sidebarWidth={380}
      sidebar={
        <Stack gap="xs" pr="xs">
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: "1 1 0", minWidth: 0 }}
            placeholder="Search photos"
            aria-label="Search descriptions, tags and file names"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Menu withinPortal>
            <Menu.Target>
              <Button
                size="compact-sm"
                variant="default"
                disabled={!!query || arranging || catalog.photos.length < 2}
                loading={arranging}
              >
                Arrangement
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Arrange by</Menu.Label>
              {ARRANGEMENTS.map((strategy) => (
                <Menu.Item
                  key={strategy.value}
                  onClick={() => void applyArrangement(strategy.value, false)}
                >
                  {strategy.label}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Label>Reverse arrangement</Menu.Label>
              {ARRANGEMENTS.map((strategy) => (
                <Menu.Item
                  key={`reverse-${strategy.value}`}
                  onClick={() => void applyArrangement(strategy.value, true)}
                >
                  {strategy.label} (reverse)
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item
                onClick={() =>
                  editPhotography((photography) => ({
                    ...photography,
                    photos: reverseUnlocked(photography.photos),
                  }))
                }
              >
                Reverse current order
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <ActionIcon
            size="lg"
            variant="default"
            aria-label="Move selected photo up"
            title="Move photo up"
            disabled={!canMove(-1)}
            onClick={() => moveSelected(-1)}
          >
            ▲
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="default"
            aria-label="Move selected photo down"
            title="Move photo down"
            disabled={!canMove(1)}
            onClick={() => moveSelected(1)}
          >
            ▼
          </ActionIcon>
        </Group>
        {arrangementError && (
          <Text size="xs" c="red">
            {arrangementError}
          </Text>
        )}
        <DragDropProvider
          onDragEnd={(event) => {
            const { source } = event.operation;
            if (event.canceled || !isSortable(source)) return;
            editPhotography((photography) => ({
              ...photography,
              photos: movePhoto(photography.photos, source.initialIndex, source.index),
            }));
          }}
        >
          {shown.map((item, index) => (
            <PhotoRow
              key={item.file}
              photo={item}
              index={index}
              // Drag positions are catalog indexes, so dragging waits until the search is empty.
              draggable={!query && !item.locked}
              selected={item.file === selected}
              onSelect={() => setSelected(item.file)}
            />
          ))}
        </DragDropProvider>
        </Stack>
      }
      details={photo && (
        <PhotoFields
          photo={photo}
          photoTags={catalog.photoTags}
          onEditImage={() => onEditImage(photo.file)}
        />
      )}
    />
  );
}

interface PhotoRowProps {
  photo: Photo;
  index: number;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
}

function PhotoRow({ photo, index, draggable, selected, onSelect }: PhotoRowProps) {
  const { ref } = useSortable({ id: photo.file, index, disabled: !draggable });
  return (
    <Group
      ref={ref}
      wrap="nowrap"
      p={4}
      bg={selected ? "var(--mantine-color-default-hover)" : undefined}
      style={{ cursor: draggable ? "grab" : "pointer" }}
      onClick={onSelect}
    >
      <img
        src={photoUrl(photo)}
        alt=""
        width={72}
        height={48}
        draggable={false}
        style={{ objectFit: "cover" }}
      />
      <Text size="sm" lineClamp={1} flex={1}>
        {photo.alt}
      </Text>
      {!photo.visible && <Badge color="gray">Unlisted</Badge>}
      {photo.locked && <Badge color="orange">Locked</Badge>}
    </Group>
  );
}

interface PhotoFieldsProps {
  photo: Photo;
  photoTags: string[];
  onEditImage: () => void;
}

function PhotoFields({ photo, photoTags, onEditImage }: PhotoFieldsProps) {
  const dirty = useEditor(isDirty);
  const edit = (values: Partial<Photo>) => editPhoto(photo.file, values);
  return (
    <Stack gap="xs" pr="xs">
      <img
        src={photoUrl(photo)}
        alt=""
        style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }}
      />
      <Group>
        <Text size="sm" c="dimmed" flex={1}>
          {photo.file}
        </Text>
        <Button variant="default" disabled={dirty} onClick={onEditImage}>
          Edit Image
        </Button>
      </Group>
      <Textarea
        label="Description"
        description="Also the alt text that screen readers read aloud"
        autosize
        minRows={2}
        value={photo.alt}
        onChange={(event) => edit({ alt: event.currentTarget.value })}
      />
      <TagsInput
        label="Tags"
        description="A new tag also becomes a filter on the site"
        data={photoTags}
        value={photo.tags}
        onChange={(tags) => setTags(photo.file, tags)}
      />
      <Select
        label="Display priority"
        data={PRIORITIES}
        value={photo.displayPriority}
        allowDeselect={false}
        onChange={(value) => value && edit({ displayPriority: value as Photo["displayPriority"] })}
      />
      <Checkbox
        label="Unlist"
        description="Hides the photo on the site"
        checked={!photo.visible}
        onChange={(event) => edit({ visible: !event.currentTarget.checked })}
      />
      <Checkbox
        label="Lock position"
        description="Keeps the photo's place in the order during drags and Suggest Arrangement. On the site, its row and column still depend on the window width, the tag filter and unlisted photos before it."
        checked={!!photo.locked}
        onChange={(event) => edit({ locked: event.currentTarget.checked || undefined })}
      />
    </Stack>
  );
}
