import { AppShell, Button, Group, List, Modal, NavLink, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { ApiError, Page, PortfolioView } from "../../backend/api/api";
import { ArchiveView } from "../archive/ArchiveView";
import { EngineeringView } from "../engineering/EngineeringView";
import { PhotographyView } from "../photography/PhotographyView";
import { Settings } from "../settings/Settings";
import { confirmDiscard, isDirty, loadView, redo, showSaved, undo, useEditor } from "./editor";
import { call } from "./portfolio";

type Section = Page | "settings";
const SECTIONS: [Section, string][] = [
  ["photography", "Photography"],
  ["engineering", "Engineering"],
  ["archive", "Archive"],
  ["settings", "Settings"],
];

export function App() {
  const view = useEditor((state) => state.view);
  const catalogs = useEditor((state) => state.catalogs);
  const dirty = useEditor(isDirty);
  const [section, setSection] = useState<Section>("settings");
  const [error, setError] = useState<Pick<ApiError, "message" | "problems"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [changedOutside, setChangedOutside] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (cause) {
      setError({ message: (cause as Error).message });
    }
  }

  function show(next: PortfolioView | null) {
    loadView(next);
    setSection(next ? "photography" : "settings");
  }

  const reload = () => run(async () => loadView(await call(window.portfolio["portfolio.load"]())));
  const preview = (page: Page) =>
    run(async () => void (await call(window.portfolio["site.open"](page))));

  async function save() {
    if (!view || !catalogs || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await window.portfolio["catalogs.save"](view.revision, catalogs);
      if (saved.ok) showSaved(saved.value, catalogs);
      else if (saved.error.code === "changed-outside") setChangedOutside(saved.error.message);
      else setError(saved.error);
    } finally {
      setSaving(false);
    }
  }

  // Save works in every field. Undo and redo skip inputs, text areas and selects, which keep the browser's own undo.
  useHotkeys([["mod+S", () => void save()]], []);
  useHotkeys([
    ["mod+Z", undo],
    ["mod+shift+Z", redo],
    ["mod+Y", redo],
  ]);

  useEffect(() => {
    void run(async () => show(await call(window.portfolio["portfolio.load"]())));
    // Cancelling the unload makes the main process ask before the window closes.
    const keepUnsaved = (event: BeforeUnloadEvent) => {
      if (isDirty(useEditor.getState())) event.preventDefault();
    };
    window.addEventListener("beforeunload", keepUnsaved);
    return () => window.removeEventListener("beforeunload", keepUnsaved);
  }, []);

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 220, breakpoint: 0 }} padding="md">
      <AppShell.Header p="sm">
        <Group justify="space-between">
          <Text fw={600}>{view ? view.folder : "No portfolio folder"}</Text>
          <Group gap="xs">
            {section !== "settings" && view && (
              <Button variant="default" onClick={() => preview(section)}>
                Preview
              </Button>
            )}
            <Button disabled={!dirty} loading={saving} onClick={() => void save()}>
              Save
            </Button>
            <Button variant="default" onClick={() => confirmDiscard() && void reload()}>
              Reload
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {SECTIONS.map(([name, label]) => (
          <NavLink
            key={name}
            label={label}
            active={section === name}
            disabled={!view && name !== "settings"}
            onClick={() => setSection(name)}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        {error && (
          <>
            <Text c="red">{error.message}</Text>
            <List size="sm" c="red" mb="md">
              {error.problems?.map((problem) => (
                <List.Item key={problem}>{problem}</List.Item>
              ))}
            </List>
          </>
        )}
        {catalogs && section === "photography" && (
          <PhotographyView catalog={catalogs.photography} />
        )}
        {catalogs && section === "engineering" && (
          <EngineeringView catalog={catalogs.engineering} />
        )}
        {catalogs && section === "archive" && <ArchiveView catalog={catalogs.archive} />}
        {section === "settings" && <Settings view={view} onFolderChosen={show} />}
      </AppShell.Main>
      <Modal
        opened={changedOutside !== null}
        onClose={() => setChangedOutside(null)}
        title="Reload or Cancel"
      >
        <Text>{changedOutside}</Text>
        <Text mt="sm">Reload loads those files and discards your unsaved edits.</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setChangedOutside(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setChangedOutside(null);
              void reload();
            }}
          >
            Reload
          </Button>
        </Group>
      </Modal>
    </AppShell>
  );
}
