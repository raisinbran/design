import { Group, Stack, Text, Title } from "@mantine/core";
import type { Catalogs } from "../../backend/api/api";
import { siteImage } from "../app/portfolio";

export function ArchiveView({ catalog }: { catalog: Catalogs["archive"] }) {
  return (
    <Stack>
      {catalog.collections.map((collection) => (
        <Stack key={collection.id} gap="xs">
          <Title order={4}>{collection.title}</Title>
          {collection.context && <Text>{collection.context}</Text>}
          <Group gap="xs">
            {collection.media.map((media) => (
              <img
                key={media.id}
                src={siteImage(media.src)}
                alt={media.alt}
                title={media.caption}
                height={96}
              />
            ))}
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}
