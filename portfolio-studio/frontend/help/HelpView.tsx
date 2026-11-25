import { Group, List, NavLink, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { MANUAL, searchManual } from "./manual";

/** Groups consecutive "- " lines into one list, keeping the order of the text. */
function blocks(lines: string[]): { list: boolean; lines: string[] }[] {
  const result: { list: boolean; lines: string[] }[] = [];
  for (const line of lines) {
    const bullet = line.startsWith("- ");
    const last = result[result.length - 1];
    if (bullet && last?.list) last.lines.push(line.slice(2));
    else result.push({ list: bullet, lines: [bullet ? line.slice(2) : line] });
  }
  return result;
}

export function HelpView() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(MANUAL[0].id);
  const results = searchManual(MANUAL, query);
  const active = results.find((section) => section.id === selected) ?? results[0];

  return (
    <Stack maw={900}>
      <Title order={2}>Help</Title>
      <TextInput
        aria-label="Search user manual"
        placeholder="Search the user manual"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {!active ? (
        <Text c="dimmed">No manual section matches your search.</Text>
      ) : (
        <Group align="flex-start" wrap="nowrap">
          <Stack w={200} gap={0} component="nav" aria-label="Manual sections">
            {results.map((section) => (
              <NavLink
                key={section.id}
                label={section.title}
                active={section.id === active.id}
                onClick={() => setSelected(section.id)}
              />
            ))}
          </Stack>
          <Stack flex={1} miw={0} component="article">
            <Title order={3}>{active.title}</Title>
            {blocks(active.text).map((block, at) =>
              block.list ? (
                <List key={at}>
                  {block.lines.map((line) => (
                    <List.Item key={line}>{line}</List.Item>
                  ))}
                </List>
              ) : (
                <Text key={at}>{block.lines[0]}</Text>
              ),
            )}
          </Stack>
        </Group>
      )}
    </Stack>
  );
}
