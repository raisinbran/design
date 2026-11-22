import {
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import type { Catalogs, PortfolioView } from "../../backend/api/api";
import { editCatalogs, isDirty, useEditor } from "../app/editor";
import { publishedImageDescription } from "./published-image";

type Photography = Catalogs["photography"];
type Photo = Photography["photos"][number];

function editPhoto(file: string, values: Partial<Photo>) {
  editCatalogs((catalogs) => ({
    ...catalogs,
    photography: {
      ...catalogs.photography,
      photos: catalogs.photography.photos.map((photo) =>
        photo.file === file ? { ...photo, ...values } : photo,
      ),
    },
  }));
}

function setTags(file: string, tags: string[]) {
  editCatalogs((catalogs) => ({
    ...catalogs,
    photography: {
      ...catalogs.photography,
      photoTags: [
        ...catalogs.photography.photoTags,
        ...tags.filter((tag) => !catalogs.photography.photoTags.includes(tag)),
      ],
      photos: catalogs.photography.photos.map((photo) =>
        photo.file === file ? { ...photo, tags } : photo,
      ),
    },
  }));
}

interface PhotoFieldsProps {
  photo: Photo;
  photoTags: string[];
  imageUrl: string;
  onEditImage: () => void;
  onRename: (name: string, view: PortfolioView, warning?: string) => void;
  onDelete: (view: PortfolioView, warning?: string) => void;
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "portraitBoost", label: "Portrait boost" },
  { value: "featured", label: "Featured" },
];

export function PhotoFields({
  photo,
  photoTags,
  imageUrl,
  onEditImage,
  onRename,
  onDelete,
}: PhotoFieldsProps) {
  const dirty = useEditor(isDirty);
  const view = useEditor((state) => state.view);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(photo.file);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (values: Partial<Photo>) => editPhoto(photo.file, values);

  async function rename() {
    if (!view || dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.portfolio["photos.rename"](
        view.revision,
        photo.file,
        newName.trim(),
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRenaming(false);
      onRename(newName.trim(), result.value.view, result.value.warning);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!view || dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.portfolio["photos.delete"](view.revision, photo.file);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setConfirmDelete(false);
      onDelete(result.value.view, result.value.warning);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="xs" pr="xs">
      <img
        src={imageUrl}
        alt=""
        style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }}
      />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Catalog name: {photo.file}
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            disabled={dirty}
            onClick={() => setRenaming(!renaming)}
          >
            Rename
          </Button>
          <Button variant="default" disabled={dirty} onClick={onEditImage}>
            Edit Image
          </Button>
        </Group>
      </Group>
      <Text size="xs" c="dimmed">
        Published image: {publishedImageDescription(photo)}. Your private original is kept
        separately.
      </Text>
      {renaming && (
        <Group gap="xs" align="flex-end">
          <TextInput
            style={{ flex: "1 1 0", minWidth: 0 }}
            label="New catalog name"
            description="The published derivative keeps its real image extension."
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
          />
          <Button
            loading={busy}
            disabled={dirty || !newName.trim() || newName === photo.file}
            onClick={() => void rename()}
          >
            Rename
          </Button>
          <Button variant="default" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </Group>
      )}
      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
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
        description="Keeps the photo's catalog position during arrangement. On the site, its row and column still depend on the window width."
        checked={!!photo.locked}
        onChange={(event) => edit({ locked: event.currentTarget.checked || undefined })}
      />
      <Group mt="md">
        <Button
          color="red"
          variant="light"
          disabled={dirty || busy}
          onClick={() => setConfirmDelete(true)}
        >
          Delete photo from portfolio…
        </Button>
        {dirty && (
          <Text size="xs" c="dimmed">
            Save or discard edits first.
          </Text>
        )}
      </Group>
      <Modal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove the photo and its site files?"
      >
        <Text>
          The catalog entry for {photo.file} will be removed, and its unshared published images will
          move to the system Trash. Private original photos are not deleted. You choose whether to
          publish this deletion in GitHub Desktop.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={() => void remove()}>
            Move site photo to Trash
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
