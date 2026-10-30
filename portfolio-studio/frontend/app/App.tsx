import { AppShell, NavLink, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { PortfolioView } from "../../backend/api/api";
import { Settings } from "../settings/Settings";
import { call } from "./portfolio";

export function App() {
  const [view, setView] = useState<PortfolioView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call(window.portfolio["portfolio.load"]()).then(setView, (cause: Error) => setError(cause.message));
  }, []);

  return (
    <AppShell header={{ height: 44 }} navbar={{ width: 220, breakpoint: 0 }} padding="md">
      <AppShell.Header p="sm">
        <Text fw={600}>{view ? view.folder : "No portfolio folder"}</Text>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <NavLink label="Settings" active />
      </AppShell.Navbar>
      <AppShell.Main>
        {error && <Text c="red">{error}</Text>}
        <Settings view={view} onFolderChosen={setView} />
      </AppShell.Main>
    </AppShell>
  );
}
