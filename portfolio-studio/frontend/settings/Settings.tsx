import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import type { AppInfo, ImageSettings, PortfolioView } from "../../backend/api/api";
import { confirmDiscard } from "../app/editor";
import { call } from "../app/portfolio";

interface SettingsProps {
  view: PortfolioView | null;
  onFolderChosen: (view: PortfolioView) => void;
}

export function Settings({ view, onFolderChosen }: SettingsProps) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ImageSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    call(window.portfolio["app.info"]()).then(setInfo, (cause: Error) => setError(cause.message));
    call(window.portfolio["settings.get"]()).then(setImages, (cause: Error) =>
      setError(cause.message),
    );
  }, []);

  const rights = (values: Partial<ImageSettings["rights"]>) => {
    setSaved(false);
    setImages((current) => current && { ...current, rights: { ...current.rights, ...values } });
  };
  const watermark = (values: Partial<ImageSettings["watermark"]>) => {
    setSaved(false);
    setImages(
      (current) => current && { ...current, watermark: { ...current.watermark, ...values } },
    );
  };

  async function saveImageSettings() {
    try {
      const { rights, watermark } = await call(window.portfolio["settings.set"](images!));
      setImages({ rights, watermark });
      setSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

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
      {images && (
        <>
          <Title order={3}>Photo Editor</Title>
          <Text size="sm" c="dimmed">
            Every image the app adds or replaces gets these, including Edit Image of older photos.
          </Text>
          <TextInput
            label="Author"
            value={images.rights.author}
            onChange={(event) => rights({ author: event.currentTarget.value })}
          />
          <TextInput
            label="Copyright"
            value={images.rights.copyright}
            onChange={(event) => rights({ copyright: event.currentTarget.value })}
          />
          <Textarea
            label="Usage terms"
            description="Written into each image with the notice that AI training is not allowed"
            autosize
            value={images.rights.usageTerms}
            onChange={(event) => rights({ usageTerms: event.currentTarget.value })}
          />
          <TextInput
            label="Watermark text"
            value={images.watermark.text}
            onChange={(event) => watermark({ text: event.currentTarget.value })}
          />
          <Group>
            <Checkbox
              label="Tiled across the photo"
              checked={images.watermark.tiled}
              onChange={(event) => watermark({ tiled: event.currentTarget.checked })}
            />
            <Checkbox
              label="Signature in the corner"
              checked={images.watermark.corner}
              onChange={(event) => watermark({ corner: event.currentTarget.checked })}
            />
          </Group>
          <NumberInput
            label="Watermark strength"
            description="Opacity of the watermark"
            suffix="%"
            min={0}
            max={100}
            clampBehavior="strict"
            w={200}
            value={Math.round(images.watermark.strength * 100)}
            onChange={(value) => watermark({ strength: (Number(value) || 0) / 100 })}
          />
          <Group>
            <Button onClick={saveImageSettings}>Save settings</Button>
            {saved && <Text c="dimmed">Saved</Text>}
          </Group>
        </>
      )}
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
