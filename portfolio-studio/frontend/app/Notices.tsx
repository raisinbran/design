import { CloseButton, List, Paper, Stack, Text, Tooltip } from "@mantine/core";
import type { ApiError } from "../../backend/api/api";

type Props = {
  saved: string | null;
  error: Pick<ApiError, "message" | "problems"> | null;
  onDismissSaved: () => void;
  onDismissError: () => void;
};

/**
 * Messages float over the corner of the window, so showing or hiding one never moves a button,
 * toolbar or field.
 */
export function Notices({ saved, error, onDismissSaved, onDismissError }: Props) {
  if (!saved && !error) return null;
  return (
    <Stack
      gap="xs"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 400,
        width: "min(480px, calc(100vw - 252px))",
        maxHeight: "50vh",
        overflowY: "auto",
      }}
    >
      {error && (
        <Paper withBorder shadow="md" p="sm" role="alert" style={{ position: "relative" }}>
          <Tooltip
            label="Dismiss message"
            openDelay={0}
            closeDelay={0}
            transitionProps={{ duration: 0 }}
          >
            <CloseButton
              aria-label="Dismiss message"
              size="sm"
              onClick={onDismissError}
              style={{ position: "absolute", top: 6, right: 6 }}
            />
          </Tooltip>
          <Text c="red" pr="xl">
            {error.message}
          </Text>
          {error.problems && error.problems.length > 0 && (
            <List size="sm" c="red" mt="xs">
              {error.problems.map((problem) => (
                <List.Item key={problem}>{problem}</List.Item>
              ))}
            </List>
          )}
        </Paper>
      )}
      {saved && (
        <Paper withBorder shadow="md" p="sm" role="status" style={{ position: "relative" }}>
          <Tooltip
            label="Dismiss message"
            openDelay={0}
            closeDelay={0}
            transitionProps={{ duration: 0 }}
          >
            <CloseButton
              aria-label="Dismiss message"
              size="sm"
              onClick={onDismissSaved}
              style={{ position: "absolute", top: 6, right: 6 }}
            />
          </Tooltip>
          <Text pr="xl">{saved}</Text>
        </Paper>
      )}
    </Stack>
  );
}
