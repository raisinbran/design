import { Badge, Group, Table } from "@mantine/core";
import type { Catalogs } from "../../backend/api/api";
import { siteImage } from "../app/portfolio";

export function PhotographyView({ catalog }: { catalog: Catalogs["photography"] }) {
  return (
    <Table>
      <Table.Tbody>
        {catalog.photos.map((photo) => (
          <Table.Tr key={photo.file}>
            <Table.Td w={120}>
              <img
                src={siteImage(
                  photo.thumbnail
                    ? `photography/thumbnails/${photo.thumbnail}`
                    : `photography/published/${photo.file}`,
                )}
                alt=""
                height={64}
              />
            </Table.Td>
            <Table.Td>{photo.alt}</Table.Td>
            <Table.Td>
              <Group gap={4}>
                {photo.tags.map((tag) => (
                  <Badge key={tag} variant="light">
                    {tag}
                  </Badge>
                ))}
                {!photo.visible && <Badge color="gray">Unlisted</Badge>}
                {photo.locked && <Badge color="orange">Locked</Badge>}
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
