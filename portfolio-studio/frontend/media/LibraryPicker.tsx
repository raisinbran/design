import { Button, Group, Image, Modal, NavLink, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { descriptionOf, isVideo, type Page } from "../../shared/library";
import { useEditor } from "../app/editor";
import { siteImage } from "../app/portfolio";

interface LibraryPickerProps {
  /** The page whose assigned files are listed. */
  page: Page;
  opened: boolean;
  /** Files already in the project, shown dimmed and not selectable. */
  taken: string[];
  /** Picks exactly one file, as when replacing a media path. */
  single?: boolean;
  /** Design shows no video. */
  images?: boolean;
  onClose: () => void;
  onPick: (sources: string[]) => void;
}

/** Lists the library files assigned to one page, so a project picks from them instead of typing paths. */
export function LibraryPicker({
  page,
  opened,
  taken,
  single,
  images,
  onClose,
  onPick,
}: LibraryPickerProps) {
  const catalogs = useEditor((state) => state.catalogs);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const query = search.trim().toLowerCase();
  const items = (catalogs?.library.items ?? []).filter(
    (item) =>
      item.pages.includes(page) &&
      !(images && isVideo(item.src)) &&
      (!query ||
        item.src.toLowerCase().includes(query) ||
        (catalogs && descriptionOf(catalogs, item).toLowerCase().includes(query))),
  );
  const close = () => {
    setChosen([]);
    setSearch("");
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title="Add from library" size="lg">
      <Stack gap="xs">
        <TextInput
          size="xs"
          placeholder="Search files"
          aria-label="Search file names and descriptions"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Stack gap={0} mah={420} style={{ overflowY: "auto" }}>
          {items.map((item) => {
            const used = taken.includes(item.src);
            const on = chosen.includes(item.src);
            return (
              <NavLink
                key={item.src}
                active={on}
                disabled={used}
                label={item.src.slice(item.src.lastIndexOf("/") + 1)}
                description={used ? "Already in this project" : item.src}
                leftSection={
                  isVideo(item.src) ? (
                    <Text size="xs">Video</Text>
                  ) : (
                    <Image src={siteImage(item.src)} w={40} h={40} fit="cover" alt="" />
                  )
                }
                onClick={() =>
                  setChosen(
                    single
                      ? [item.src]
                      : on
                        ? chosen.filter((src) => src !== item.src)
                        : [...chosen, item.src],
                  )
                }
              />
            );
          })}
          {items.length === 0 && (
            <Text size="sm" c="dimmed">
              No files are assigned to this page. Tick the page for a file in Media.
            </Text>
          )}
        </Stack>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              onPick(chosen);
              close();
            }}
          >
            {single ? "Use file" : `Add selected (${chosen.length})`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
