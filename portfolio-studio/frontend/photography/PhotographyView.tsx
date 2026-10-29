import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  Badge,
  Button,
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
import { editCatalogs } from "../app/editor";
import { siteImage } from "../app/portfolio";
import { movePhoto, suggestArrangement } from "./arrangement";

type Photography = Catalogs["photography"];
type Photo = Photography["photos"][number];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "portraitBoost", label: "Portrait boost" },
  { value: "featured", label: "Featured" },
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

export function PhotographyView({ catalog }: { catalog: Photography }) {
  const [selected, setSelected] = useState(catalog.photos[0]?.file);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = catalog.photos.filter((photo) =>
    `${photo.alt} ${photo.file} ${photo.tags.join(" ")}`.toLowerCase().includes(query),
  );
  const photo = catalog.photos.find((item) => item.file === selected);

  return (
    <Group align="flex-start" wrap="nowrap">
      <Stack w={380} gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            flex={1}
            placeholder="Search descriptions, tags and file names"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Button
            variant="default"
            onClick={() =>
              editPhotography((photography) => ({
                ...photography,
                photos: suggestArrangement(photography.photos, photography.photoTags),
              }))
            }
          >
            Suggest Arrangement
          </Button>
        </Group>
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
      {photo && <PhotoEditor photo={photo} photoTags={catalog.photoTags} />}
    </Group>
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

function PhotoEditor({ photo, photoTags }: { photo: Photo; photoTags: string[] }) {
  const edit = (values: Partial<Photo>) => editPhoto(photo.file, values);
  return (
    <Stack flex={1} pos="sticky" top={68}>
      <img
        src={photoUrl(photo)}
        alt=""
        style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }}
      />
      <Text size="sm" c="dimmed">
        {photo.file}
      </Text>
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
