import { AppShell, Button, Group, NavLink, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { Page, PortfolioView } from "../../backend/api/api";
import { ArchiveView } from "../archive/ArchiveView";
import { EngineeringView } from "../engineering/EngineeringView";
import { PhotographyView } from "../photography/PhotographyView";
import { Settings } from "../settings/Settings";
import { call } from "./portfolio";

type Section = Page | "settings";
const SECTIONS: [Section, string][] = [
  ["photography", "Photography"],
  ["engineering", "Engineering"],
  ["archive", "Archive"],
  ["settings", "Settings"],
];

export function App() {
  const [view, setView] = useState<PortfolioView | null>(null);
  const [section, setSection] = useState<Section>("settings");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function show(next: PortfolioView | null) {
    setView(next);
    setSection(next ? "photography" : "settings");
  }

  const reload = () => run(async () => setView(await call(window.portfolio["portfolio.load"]())));
  const preview = (page: Page) =>
    run(async () => void (await call(window.portfolio["site.open"](page))));

  useEffect(() => {
    void run(async () => show(await call(window.portfolio["portfolio.load"]())));
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
            <Button variant="default" onClick={reload}>
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
        {error && <Text c="red">{error}</Text>}
        {view && section === "photography" && (
          <PhotographyView catalog={view.catalogs.photography} />
        )}
        {view && section === "engineering" && (
          <EngineeringView catalog={view.catalogs.engineering} />
        )}
        {view && section === "archive" && <ArchiveView catalog={view.catalogs.archive} />}
        {section === "settings" && <Settings view={view} onFolderChosen={show} />}
      </AppShell.Main>
    </AppShell>
  );
}
