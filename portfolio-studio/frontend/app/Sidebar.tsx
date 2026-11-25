import { ActionIcon, Divider, Group, NavLink, Stack, Tooltip } from "@mantine/core";
import type { Page } from "../../backend/api/api";

export type Section = Page | "media" | "photo-editor" | "settings" | "help";

const PAGES: [Page, string][] = [
  ["photography", "Photography"],
  ["engineering", "Engineering"],
  ["archive", "Design"],
];
const TOOLS: [Section, string][] = [
  ["media", "Media"],
  ["photo-editor", "Photo Editor"],
];

// Icon outlines on a 24-unit grid, the same ones the Scribe app uses for Settings and Help.
const SETTINGS_ICON =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";
const HELP_ICON =
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01";

export const isPage = (section: Section): section is Page =>
  PAGES.some(([page]) => page === section);

interface SidebarProps {
  section: Section;
  /** Without a website folder only Settings and Help open. */
  hasFolder: boolean;
  onSelect: (section: Section) => void;
}

function IconLink(props: { label: string; path: string; active: boolean; onClick: () => void }) {
  return (
    <Tooltip label={props.label} openDelay={0} closeDelay={0} transitionProps={{ duration: 0 }}>
      <ActionIcon
        variant={props.active ? "light" : "subtle"}
        color={props.active ? undefined : "gray"}
        size={36}
        aria-label={props.label}
        aria-current={props.active ? "page" : undefined}
        onClick={props.onClick}
      >
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={props.path} />
        </svg>
      </ActionIcon>
    </Tooltip>
  );
}

export function Sidebar({ section, hasFolder, onSelect }: SidebarProps) {
  const link = ([name, label]: [Section, string]) => (
    <NavLink
      key={name}
      label={label}
      active={section === name}
      disabled={!hasFolder}
      onClick={() => onSelect(name)}
    />
  );
  return (
    <Stack h="100%" justify="space-between" gap="xs">
      <div>
        {PAGES.map(link)}
        <Divider my="xs" />
        {TOOLS.map(link)}
      </div>
      <Group justify="space-between">
        <IconLink
          label="Settings"
          path={SETTINGS_ICON}
          active={section === "settings"}
          onClick={() => onSelect("settings")}
        />
        <IconLink
          label="Help"
          path={HELP_ICON}
          active={section === "help"}
          onClick={() => onSelect("help")}
        />
      </Group>
    </Stack>
  );
}
