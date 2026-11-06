import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Badge, Group, Stack, Text } from "@mantine/core";

export interface Item {
  /** Unique within the list; also the drag id. */
  key: string;
  label: string;
  image?: string;
  hidden?: boolean;
}

interface ItemListProps {
  items: Item[];
  selected: number;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

export function ItemList({ items, selected, onSelect, onMove }: ItemListProps) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        const { source } = event.operation;
        if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return;
        onMove(source.initialIndex, source.index);
      }}
    >
      <Stack gap={0}>
        {items.map((item, index) => (
          <Row
            key={item.key}
            item={item}
            index={index}
            selected={index === selected}
            onSelect={() => onSelect(index)}
          />
        ))}
      </Stack>
    </DragDropProvider>
  );
}

interface RowProps {
  item: Item;
  index: number;
  selected: boolean;
  onSelect: () => void;
}

function Row({ item, index, selected, onSelect }: RowProps) {
  const { ref } = useSortable({ id: item.key, index });
  return (
    <Group
      ref={ref}
      wrap="nowrap"
      p={4}
      bg={selected ? "var(--mantine-color-default-hover)" : undefined}
      style={{ cursor: "grab" }}
      onClick={onSelect}
    >
      {item.image ? (
        <img
          src={item.image}
          alt=""
          width={72}
          height={48}
          draggable={false}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <div style={{ width: 72, height: 48 }} />
      )}
      <Text size="sm" lineClamp={1} flex={1}>
        {item.label}
      </Text>
      {item.hidden && <Badge color="gray">Hidden</Badge>}
    </Group>
  );
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function removeItem<T>(items: T[], index: number): T[] {
  return items.filter((_, at) => at !== index);
}

/** Turns "Clip-It 2" into "collapseClipIt2", the form of the existing ids, adding "-2", "-3" when taken. */
export function newId(title: string, taken: string[]): string {
  const words = title.match(/[A-Za-z0-9]+/g) ?? [];
  const base = "collapse" + words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
