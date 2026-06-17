import { Box, Text } from "ink";
import { tuiTheme } from "../theme.js";

export interface HeaderProps {
  modelLabel: string;
  sessionId: string;
  sessionMode: "new" | "resumed";
  workspaceRoot: string;
  toolCount: number;
  pluginCount: number;
  projectContextCount: number;
}

export function Header({
  modelLabel,
  sessionId,
  sessionMode,
  workspaceRoot,
  toolCount,
  pluginCount,
  projectContextCount,
}: HeaderProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1}>
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.primary} bold>
          Pi Agent
        </Text>
        <Text color={tuiTheme.colors.dim}>{modelLabel}</Text>
      </Box>
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.dim}>session</Text>
        <Text>
          {sessionId} ({sessionMode})
        </Text>
      </Box>
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.dim}>root</Text>
        <Text>{workspaceRoot}</Text>
      </Box>
      <Box columnGap={2}>
        <Text color={tuiTheme.colors.dim}>tools {toolCount}</Text>
        <Text color={tuiTheme.colors.dim}>plugins {pluginCount}</Text>
        <Text color={tuiTheme.colors.dim}>context {projectContextCount}</Text>
      </Box>
    </Box>
  );
}
