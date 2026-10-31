import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import type { Catalogs } from "../../backend/api/api";
import { siteImage } from "../app/portfolio";

export function EngineeringView({ catalog }: { catalog: Catalogs["engineering"] }) {
  return (
    <Stack>
      {catalog.projects.map((project) => (
        <Group key={project.id} align="flex-start" wrap="nowrap">
          <img src={siteImage(project.cover)} alt="" width={160} />
          <Stack gap={2}>
            <Title order={4}>{project.title}</Title>
            <Text>{[project.heading, project.context].filter(Boolean).join(", ")}</Text>
            <Group gap={4}>
              <Badge variant="light">{project.media.length} media</Badge>
              {!project.visible && <Badge color="gray">Hidden</Badge>}
            </Group>
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}
