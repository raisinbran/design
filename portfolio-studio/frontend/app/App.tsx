import { AppShell, Button, Group, List, Modal, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { ApiError, Page, PortfolioView } from "../../backend/api/api";
import { ArchiveView } from "../archive/ArchiveView";
import { EngineeringView } from "../engineering/EngineeringView";
import { PhotoEditor } from "../photo-editor/PhotoEditor";
import { PhotographyView } from "../photography/PhotographyView";
import { HelpView } from "../help/HelpView";
import { MediaView } from "../media/MediaView";
import { Settings } from "../settings/Settings";
import { confirmDiscard, isDirty, loadView, redo, showSaved, undo, useEditor } from "./editor";
import { call, runShowingErrors } from "./portfolio";
import { isPage, Sidebar, type Section } from "./Sidebar";

const SAVED_MESSAGE = "Saved. To publish, commit and push in GitHub Desktop.";

export function App() {
  const view = useEditor((state) => state.view);
  const catalogs = useEditor((state) => state.catalogs);
  const dirty = useEditor(isDirty);
  const [section, setSection] = useState<Section>("settings");
  const [error, setError] = useState<Pick<ApiError, "message" | "problems"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [changedOutside, setChangedOutside] = useState<string | null>(null);
  const [editImage, setEditImage] = useState<{ photoKey: string } | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setSavedMessage(false);
    await runShowingErrors(action, (message) => setError({ message }));
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
    setSavedMessage(false);
    try {
      const saved = await window.portfolio["catalogs.save"](view.revision, catalogs);
      if (saved.ok) {
        showSaved(saved.value, catalogs);
        setSavedMessage(true);
      } else if (saved.error.code === "changed-outside") setChangedOutside(saved.error.message);
      else setError(saved.error);
    } finally {
      setSaving(false);
    }
  }

  // Save works in every field, including the rich text editor. Undo and redo skip inputs, text areas,
  // selects and the rich text editor, which keep their own undo.
  useHotkeys([["mod+S", () => void save()]], [], true);
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
      <AppShell.Header px="md">
        <Group h="100%" align="center" justify="space-between" wrap="nowrap">
          <Text fw={600} truncate style={{ minWidth: 0 }}>
            {view ? view.folder : "No portfolio folder"}
          </Text>
          <Group gap="xs" wrap="nowrap">
            {isPage(section) && view && (
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
        <Sidebar section={section} hasFolder={!!view} onSelect={setSection} />
      </AppShell.Navbar>
      <AppShell.Main>
        {/* Hidden again by the next edit, so it never says "Saved" over unsaved work. */}
        {savedMessage && !dirty && (
          <Text c="green" mb="md">
            {SAVED_MESSAGE}
          </Text>
        )}
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
          <PhotographyView
            catalog={catalogs.photography}
            onEditImage={(photoKey) => {
              setEditImage({ photoKey });
              setSection("photo-editor");
            }}
            onPhotoSaved={(updated, warning) => {
              loadView(updated);
              setSavedMessage(true);
              if (warning) setError({ message: warning });
            }}
          />
        )}
        {catalogs && section === "engineering" && (
          <EngineeringView catalog={catalogs.engineering} />
        )}
        {catalogs && section === "archive" && <ArchiveView catalog={catalogs.archive} />}
        {catalogs && section === "media" && <MediaView catalogs={catalogs} />}
        {/* Hidden rather than unmounted, so switching sections keeps the photo being edited. */}
        {view && (
          <div hidden={section !== "photo-editor"}>
            <PhotoEditor
              editImage={editImage}
              onAdded={(added, pages) => {
                loadView(added);
                setSavedMessage(true);
                setEditImage(null);
                setSection(pages.includes("photography") ? "photography" : "media");
              }}
            />
          </div>
        )}
        {section === "settings" && <Settings view={view} onFolderChosen={show} />}
        {section === "help" && <HelpView />}
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
