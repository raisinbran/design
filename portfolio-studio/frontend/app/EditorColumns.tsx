import { Group, ScrollArea } from "@mantine/core";
import type { ReactNode } from "react";

interface EditorColumnsProps {
  sidebar: ReactNode;
  details: ReactNode;
  sidebarWidth: number;
}

/** Each editor panel owns its vertical scrollbar instead of scrolling the entire workspace. */
export function EditorColumns({ sidebar, details, sidebarWidth }: EditorColumnsProps) {
  return (
    <Group
      align="stretch"
      wrap="nowrap"
      gap="md"
      style={{ height: "calc(100dvh - 90px)", minHeight: 300, overflow: "hidden" }}
    >
      <ScrollArea w={sidebarWidth} h="100%" type="always" scrollbars="y" offsetScrollbars>
        {sidebar}
      </ScrollArea>
      <ScrollArea
        h="100%"
        type="always"
        scrollbars="y"
        offsetScrollbars
        style={{ flex: "1 1 0", minWidth: 0 }}
      >
        {details}
      </ScrollArea>
    </Group>
  );
}
