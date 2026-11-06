import { Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import type { AppInfo, PortfolioView } from "../../backend/api/api";
import { confirmDiscard } from "../app/editor";
import { call } from "../app/portfolio";

interface SettingsProps {
  view: PortfolioView | null;
  onFolderChosen: (view: PortfolioView) => void;
}

export function Settings({ view, onFolderChosen }: SettingsProps) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call(window.portfolio["app.info"]()).then(setInfo, (cause: Error) => setError(cause.message));
  }, []);

  async function chooseFolder() {
    if (!confirmDiscard()) return;
    try {
      const chosen = await call(window.portfolio["portfolio.choose"]());
      if (chosen) onFolderChosen(chosen);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <Stack maw={640}>
      <Title order={2}>Settings</Title>
      <Group justify="space-between">
        <Text>{view ? view.folder : "Choose the website folder to start."}</Text>
        <Button onClick={chooseFolder}>Choose folder</Button>
      </Group>
      {error && <Text c="red">{error}</Text>}
      {info && (
        <Table>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Portfolio Studio</Table.Td>
              <Table.Td>{info.app}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Electron</Table.Td>
              <Table.Td>{info.electron}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Sharp</Table.Td>
              <Table.Td>{info.sharp}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>libvips</Table.Td>
              <Table.Td>{info.libvips}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
