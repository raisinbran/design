import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ActionIcon, Badge, Button, Menu, Group, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import type { Catalogs, PortfolioView } from "../../backend/api/api";
import { editCatalogs } from "../app/editor";
import { PhotoFields } from "./PhotoFields";
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

interface PhotographyViewProps {
  catalog: Photography;
  onEditImage: (photoKey: string) => void;
  onPhotoSaved: (view: PortfolioView, warning?: string) => void;
}

export function PhotographyView({ catalog, onEditImage, onPhotoSaved }: PhotographyViewProps) {
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
      details={
        photo && (
          <PhotoFields
            key={photo.file}
            photo={photo}
            photoTags={catalog.photoTags}
            imageUrl={photoUrl(photo)}
            onEditImage={() => onEditImage(photo.file)}
            onRename={(name, view, warning) => {
              setSelected(name);
              onPhotoSaved(view, warning);
            }}
            onDelete={(view, warning) => {
              const remaining = view.catalogs.photography.photos;
              setSelected(
                remaining[Math.min(Math.max(selectedIndex, 0), remaining.length - 1)]?.file,
              );
              onPhotoSaved(view, warning);
            }}
          />
        )
      }
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
