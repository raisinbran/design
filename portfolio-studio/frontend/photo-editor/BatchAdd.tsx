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
import type { Draft, Page, PortfolioView } from "../../backend/api/api";
import { isPhotoOutputFormat, photoBaseNameProblem } from "../../shared/photo-format";
import type { PhotoOutputFormat } from "../../shared/photo-format";
import { catalogNameWithSuffix, FORMAT_CHOICES } from "./naming";

interface BatchAddProps {
  opened: boolean;
  drafts: Draft[];
  view: PortfolioView;
  onClose: () => void;
  /** Called after each photo is added, with the draft's source id and the saved site. */
  onAdded: (sourceId: string, view: PortfolioView, pages: Page[]) => void;
}

/** Adds every draft with its saved edits: shared pages, tags and format, a name and description each. */
export function BatchAdd({ opened, drafts, view, onClose, onAdded }: BatchAddProps) {
  const [pages, setPages] = useState<Page[]>(["photography"]);
  const [tags, setTags] = useState<string[]>([]);
  const [format, setFormat] = useState<PhotoOutputFormat>("webp");
  const [names, setNames] = useState<Record<string, string>>({});
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (draft: Draft) =>
    names[draft.source.id] ?? catalogNameWithSuffix(draft.source.name, "_crop");
  const ready =
    pages.length > 0 &&
    (!pages.includes("photography") || tags.length > 0) &&
    drafts.every(
      (draft) => !photoBaseNameProblem(nameOf(draft).trim()) && !!alts[draft.source.id]?.trim(),
    );

  async function addAll() {
    setAdding(true);
    setError(null);
    let revision = view.revision;
    try {
      for (const draft of drafts) {
        const id = draft.source.id;
        const rendered = await window.portfolio["photos.render"](id, draft.recipe, format);
        if (!rendered.ok) return setError(`${draft.source.name}: ${rendered.error.message}`);
        const added = await window.portfolio["photos.add"]({
          kind: "new",
          revision,
          sourceId: id,
          name: nameOf(draft),
          format,
          alt: alts[id],
          tags: pages.includes("photography") ? tags : [],
          pages,
        });
        // The ones before it stay added; this one and the rest remain drafts to fix and retry.
        if (!added.ok) return setError(`${draft.source.name}: ${added.error.message}`);
        revision = added.value.view.revision;
        onAdded(id, added.value.view, pages);
      }
      onClose();
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Add all drafts" size="lg">
      <Stack>
        <Checkbox.Group label="Pages" value={pages} onChange={(value) => setPages(value as Page[])}>
          <Group mt={4}>
            <Checkbox value="photography" label="Photography" />
            <Checkbox value="engineering" label="Engineering" />
            <Checkbox value="archive" label="Design" />
          </Group>
        </Checkbox.Group>
        {pages.includes("photography") && (
          <TagsInput
            label="Tags"
            description="Every photo gets these; a new tag also becomes a filter on the site"
            data={view.catalogs.photography.photoTags}
            value={tags}
            onChange={setTags}
          />
        )}
        <Select
          label="Output filetype"
          w={190}
          data={FORMAT_CHOICES}
          value={format}
          allowDeselect={false}
          onChange={(choice) => isPhotoOutputFormat(choice) && setFormat(choice)}
        />
        {drafts.map((draft) => (
          <Stack key={draft.source.id} gap={4}>
            <Text size="sm" fw={600}>
              {draft.source.name}
            </Text>
            <TextInput
              label="Name"
              value={nameOf(draft)}
              error={photoBaseNameProblem(nameOf(draft).trim())}
              onChange={(event) =>
                setNames({ ...names, [draft.source.id]: event.currentTarget.value })
              }
            />
            <Textarea
              label="Description"
              description="Also the alt text that screen readers read aloud"
              autosize
              minRows={1}
              value={alts[draft.source.id] ?? ""}
              onChange={(event) =>
                setAlts({ ...alts, [draft.source.id]: event.currentTarget.value })
              }
            />
          </Stack>
        ))}
        {error && <Text c="red">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready} loading={adding} onClick={() => void addAll()}>
            Add {drafts.length} photos
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
