import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Image,
  List,
  NavLink,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useState } from "react";
import type { Catalogs } from "../../backend/api/api";
import {
  descriptionOf,
  PAGE_LABELS,
  pagesInUse,
  removeItem,
  setAlt,
  setPage,
  usesByFile,
  type LibraryItem,
  type Page,
} from "../../shared/library";
import { EditorColumns } from "../app/EditorColumns";
import { editCatalogs } from "../app/editor";
import { siteImage } from "../app/portfolio";

const PAGES = Object.entries(PAGE_LABELS) as [Page, string][];
type Filter = "all" | Page | "unassigned";
const VIDEO = /\.(mp4|webm)$/i;
const nameOf = (src: string) => src.slice(src.lastIndexOf("/") + 1);

function Thumbnail({ src, size }: { src: string; size: number }) {
  return VIDEO.test(src) ? (
    <Box
      w={size}
      h={size}
      style={{
        display: "grid",
        placeItems: "center",
        background: "var(--mantine-color-default-hover)",
      }}
    >
      <Text size="xs">Video</Text>
    </Box>
  ) : (
    <Image src={siteImage(src)} w={size} h={size} fit="cover" alt="" />
  );
}

/** Every file the site uses, with the pages it is assigned to and where each page uses it. */
export function MediaView({ catalogs }: { catalogs: Catalogs }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const items = catalogs.library.items.filter(
    (item) =>
      (filter === "all" ||
        (filter === "unassigned" ? item.pages.length === 0 : item.pages.includes(filter))) &&
      (!query ||
        item.src.toLowerCase().includes(query) ||
        descriptionOf(catalogs, item).toLowerCase().includes(query)),
  );
  const current = catalogs.library.items.find((item) => item.src === selected);

  return (
    <EditorColumns
      sidebarWidth={380}
      sidebar={
        <Stack gap="xs" pr="xs">
          <TextInput
            size="xs"
            placeholder="Search files"
            aria-label="Search file names and descriptions"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Show files on"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
            data={[
              { value: "all", label: "All" },
              { value: "photography", label: "Photo" },
              { value: "engineering", label: "Eng." },
              { value: "archive", label: "Design" },
              { value: "unassigned", label: "None" },
            ]}
          />
          <Text size="xs" c="dimmed">
            {items.length} of {catalogs.library.items.length} files
          </Text>
          {items.map((item) => (
            <NavLink
              key={item.src}
              active={item.src === selected}
              onClick={() => setSelected(item.src)}
              leftSection={<Thumbnail src={item.src} size={40} />}
              label={nameOf(item.src)}
              description={
                item.pages.length
                  ? item.pages.map((page) => PAGE_LABELS[page]).join(", ")
                  : "Not on any page"
              }
            />
          ))}
        </Stack>
      }
      details={current ? <Detail key={current.src} catalogs={catalogs} item={current} /> : null}
    />
  );
}

function Detail({ catalogs, item }: { catalogs: Catalogs; item: LibraryItem }) {
  const uses = usesByFile(catalogs).get(item.src) ?? [];
  const inUse = pagesInUse(catalogs, item.src);
  const description = descriptionOf(catalogs, item);
  const needsDescription = inUse.some((page) => page !== "engineering");
  return (
    <Stack gap="sm" pl="xs" maw={640}>
      <Text fw={600}>{nameOf(item.src)}</Text>
      <Text size="xs" c="dimmed">
        {item.src}
      </Text>
      <Thumbnail src={item.src} size={240} />
      <Textarea
        label="Description"
        description="Alt text, the same on every page"
        autosize
        minRows={2}
        value={description}
        error={needsDescription && description.trim() === "" ? "Required" : undefined}
        onChange={(event) =>
          editCatalogs((current) => setAlt(current, item.src, event.currentTarget.value))
        }
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Pages
        </Text>
        {PAGES.map(([page, label]) => {
          const used = inUse.includes(page);
          const where = uses
            .filter((use) => use.page === page)
            .map((use) => `${use.where} (${use.kind})`)
            .join(", ");
          const reason = used
            ? `Used on ${label}: ${where}. Remove it there to untick`
            : page === "photography"
              ? "Adding a file to Photography is not available yet"
              : null;
          return (
            <Tooltip
              key={page}
              label={reason}
              disabled={!reason}
              position="right"
              openDelay={0}
              closeDelay={0}
              transitionProps={{ duration: 0 }}
            >
              <Box w="fit-content">
                <Checkbox
                  label={label}
                  checked={item.pages.includes(page)}
                  disabled={!!reason}
                  onChange={(event) =>
                    editCatalogs((current) =>
                      setPage(current, item.src, page, event.currentTarget.checked),
                    )
                  }
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Used in
        </Text>
        {uses.length ? (
          <List size="sm">
            {uses.map((use, index) => (
              <List.Item key={index}>
                <Badge size="xs" variant="light" mr={6}>
                  {PAGE_LABELS[use.page]}
                </Badge>
                {use.where} ({use.kind})
              </List.Item>
            ))}
          </List>
        ) : (
          <Text size="sm" c="dimmed">
            Not used yet
          </Text>
        )}
      </Stack>
      <Group>
        <Tooltip
          label="Used on a page, so it cannot be removed"
          disabled={uses.length === 0}
          openDelay={0}
          closeDelay={0}
          transitionProps={{ duration: 0 }}
        >
          <Box>
            <Button
              variant="default"
              color="red"
              disabled={uses.length > 0}
              onClick={() => editCatalogs((current) => removeItem(current, item.src))}
            >
              Remove from library
            </Button>
          </Box>
        </Tooltip>
      </Group>
    </Stack>
  );
}
