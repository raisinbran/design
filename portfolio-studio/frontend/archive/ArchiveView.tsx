import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import type { Catalogs } from "../../backend/api/api";
import { editCatalogs } from "../app/editor";
import { EditorColumns } from "../app/EditorColumns";
import { ItemList, moveItem, newId, removeItem } from "../app/ItemList";
import { siteImage } from "../app/portfolio";

type Collection = Catalogs["archive"]["collections"][number];
type Image = Collection["media"][number];

const PROMINENCES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "portraitBoost", label: "Portrait boost" },
  { value: "featured", label: "Featured" },
];

function editCollections(change: (collections: Collection[]) => Collection[]) {
  editCatalogs((catalogs) => ({
    ...catalogs,
    archive: { ...catalogs.archive, collections: change(catalogs.archive.collections) },
  }));
}

function editCollection(index: number, change: (collection: Collection) => Collection) {
  editCollections((collections) =>
    collections.map((collection, at) => (at === index ? change(collection) : collection)),
  );
}

// Image ids never reach the page; they only need to be unique, such as "collapseArt-media-08".
function newImageId(collection: Collection): string {
  const taken = collection.media.map((image) => image.id);
  let id = "";
  for (let n = collection.media.length + 1; !id || taken.includes(id); n++)
    id = `${collection.id}-media-${String(n).padStart(2, "0")}`;
  return id;
}

interface ArchiveViewProps {
  catalog: Catalogs["archive"];
}

export function ArchiveView({ catalog }: ArchiveViewProps) {
  const [selected, setSelected] = useState(0);
  const [title, setTitle] = useState("");
  const collection = catalog.collections[selected];

  function addCollection() {
    const id = newId(
      title,
      catalog.collections.map((item) => item.id),
    );
    editCollections((collections) => [
      ...collections,
      {
        id,
        title: title.trim(),
        heading: title.trim(),
        context: "",
        cover: "",
        coverPosition: "50% 50%",
        coverSize: "cover",
        headerMinHeight: "8em",
        expanded: false,
        media: [],
      },
    ]);
    setSelected(catalog.collections.length);
    setTitle("");
  }

  const shift = (direction: -1 | 1) => {
    const next = selected + direction;
    if (next < 0 || next >= catalog.collections.length) return;
    editCollections((items) => moveItem(items, selected, next));
    setSelected(next);
  };

  return (
    <EditorColumns
      sidebarWidth={340}
      sidebar={
        <Stack gap="xs" pr="xs">
          <Group gap="xs" wrap="nowrap">
            <TextInput
              flex={1}
              placeholder="New project title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <Button variant="default" disabled={!title.trim()} onClick={addCollection}>
              Add
            </Button>
            <ActionIcon
              size="lg"
              variant="default"
              aria-label="Move selected project up"
              title="Move up"
              disabled={selected <= 0}
              onClick={() => shift(-1)}
            >
              ▲
            </ActionIcon>
            <ActionIcon
              size="lg"
              variant="default"
              aria-label="Move selected project down"
              title="Move down"
              disabled={selected >= catalog.collections.length - 1}
              onClick={() => shift(1)}
            >
              ▼
            </ActionIcon>
          </Group>
          <ItemList
            items={catalog.collections.map((item) => ({
              key: item.id,
              label: item.title,
              image: item.cover && siteImage(item.cover),
            }))}
            selected={selected}
            onSelect={setSelected}
            onMove={(from, to) => {
              editCollections((collections) => moveItem(collections, from, to));
              setSelected(to);
            }}
          />
        </Stack>
      }
      details={
        collection && (
          <CollectionEditor
            key={collection.id}
            collection={collection}
            index={selected}
            onRemove={() => {
              editCollections((collections) => removeItem(collections, selected));
              setSelected(Math.max(0, selected - 1));
            }}
          />
        )
      }
    />
  );
}

interface CollectionEditorProps {
  collection: Collection;
  index: number;
  onRemove: () => void;
}

function CollectionEditor({ collection, index, onRemove }: CollectionEditorProps) {
  const [selected, setSelected] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const edit = (values: Partial<Collection>) =>
    editCollection(index, (current) => ({ ...current, ...values }));
  const editImages = (change: (media: Image[]) => Image[]) =>
    editCollection(index, (current) => ({ ...current, media: change(current.media) }));
  const image = collection.media[selected];

  return (
    <Stack flex={1}>
      <Text size="sm" c="dimmed">
        Page anchor: #{collection.id}
      </Text>
      <TextInput
        label="Title"
        value={collection.title}
        onChange={(event) => edit({ title: event.currentTarget.value })}
      />
      <TextInput
        label="Heading"
        value={collection.heading}
        onChange={(event) => edit({ heading: event.currentTarget.value })}
      />
      <TextInput
        label="Context"
        description="The line under the heading"
        value={collection.context}
        onChange={(event) => edit({ context: event.currentTarget.value })}
      />
      <TextInput
        label="Cover path"
        placeholder="images/Folder/cover.jpg"
        value={collection.cover}
        onChange={(event) => edit({ cover: event.currentTarget.value })}
      />
      <TextInput
        label="Cover position"
        placeholder="50% 50%"
        value={collection.coverPosition}
        onChange={(event) => edit({ coverPosition: event.currentTarget.value })}
      />
      <Checkbox
        label="Expanded"
        description="Open when the page loads"
        checked={collection.expanded}
        onChange={(event) => edit({ expanded: event.currentTarget.checked })}
      />
      <Group justify="space-between">
        <Title order={5}>Images</Title>
        <Button
          variant="default"
          onClick={async () => {
            const result = await window.portfolio["media.import"]("archive", collection.id);
            if (!result.ok) return setImportError(result.error.message);
            setImportError(null);
            if (!result.value?.length) return;
            const added = result.value;
            editImages((media) => {
              const images = [...media];
              for (const { src } of added) {
                images.push({
                  id: newImageId({ ...collection, media: images }),
                  src,
                  alt: "",
                  caption: "",
                  credit: "",
                  cropMode: "natural",
                  displayRatio: null,
                  position: "50% 50%",
                  prominence: "normal",
                });
              }
              return images;
            });
            setSelected(collection.media.length);
          }}
        >
          Add image
        </Button>
      </Group>
      {importError && <Text c="red">{importError}</Text>}
      <ItemList
        items={collection.media.map((item) => ({
          key: item.id,
          label: item.caption || item.src || "New image",
          image: item.src && siteImage(item.src),
        }))}
        selected={selected}
        onSelect={setSelected}
        onMove={(from, to) => {
          editImages((media) => moveItem(media, from, to));
          setSelected(to);
        }}
      />
      {image && (
        <ImageEditor
          image={image}
          onChange={(values) =>
            editImages((media) =>
              media.map((item, at) => (at === selected ? { ...item, ...values } : item)),
            )
          }
          onRemove={() => {
            editImages((media) => removeItem(media, selected));
            setSelected(Math.max(0, selected - 1));
          }}
        />
      )}
      <Group>
        <Button color="red" variant="light" onClick={onRemove}>
          Remove project
        </Button>
        <Text size="sm" c="dimmed">
          Removing never deletes image files.
        </Text>
      </Group>
    </Stack>
  );
}

interface ImageEditorProps {
  image: Image;
  onChange: (values: Partial<Image>) => void;
  onRemove: () => void;
}

function ImageEditor({ image, onChange, onRemove }: ImageEditorProps) {
  return (
    <Stack gap="xs">
      <TextInput
        label="Image path"
        placeholder="images/Folder/photo.jpg"
        value={image.src}
        onChange={(event) => onChange({ src: event.currentTarget.value })}
      />
      <TextInput
        label="Alt text"
        description="Read aloud by screen readers; required"
        value={image.alt}
        onChange={(event) => onChange({ alt: event.currentTarget.value })}
      />
      <TextInput
        label="Caption"
        value={image.caption}
        onChange={(event) => onChange({ caption: event.currentTarget.value })}
      />
      <TextInput
        label="Credit"
        value={image.credit}
        onChange={(event) => onChange({ credit: event.currentTarget.value })}
      />
      <Select
        label="Prominence"
        description="How much space the gallery gives the image"
        data={PROMINENCES}
        value={image.prominence}
        allowDeselect={false}
        onChange={(value) => value && onChange({ prominence: value as Image["prominence"] })}
      />
      <TextInput
        label="Position"
        description="The point kept in view when the gallery crops the image"
        placeholder="50% 50%"
        value={image.position}
        onChange={(event) => onChange({ position: event.currentTarget.value })}
      />
      <Select
        label="Crop mode"
        data={[
          { value: "natural", label: "Natural shape" },
          { value: "square", label: "Square" },
        ]}
        value={image.cropMode}
        allowDeselect={false}
        // The gallery reads the shape from displayRatio, so square sets 1 and natural clears it.
        onChange={(value) =>
          value === "square"
            ? onChange({ cropMode: "square", displayRatio: 1 })
            : onChange({ cropMode: "natural", displayRatio: null })
        }
      />
      <Group>
        <Button color="red" variant="light" onClick={onRemove}>
          Remove image
        </Button>
      </Group>
    </Stack>
  );
}
