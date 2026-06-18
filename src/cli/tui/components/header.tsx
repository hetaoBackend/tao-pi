import { Box, Text } from "ink";
import { APP_NAME } from "../../app-info.js";
import { tuiTheme } from "../theme.js";

export const TAOPI_LOGO_LINES = [
  " _______   ___     ___  ",
  "|__   __| / _ \\   / _ \\ ",
  "   | |   / /_\\ \\ | | | |",
  "   | |   |  _  | | |_| |",
  "   |_|   |_| |_|  \\___/ ",
] as const;

export interface HeaderProps {
  appVersion: string;
  modelLabel: string;
  sessionId: string;
  sessionMode: "new" | "resumed";
  workspaceRoot: string;
  toolCount: number;
  pluginCount: number;
  projectContextCount: number;
}

export function Header({
  appVersion,
  modelLabel,
  sessionId,
  sessionMode,
  workspaceRoot,
  toolCount,
  pluginCount,
  projectContextCount,
}: HeaderProps) {
  return (
    <Box columnGap={3} paddingX={1}>
      <Box flexDirection="column">
        {TAOPI_LOGO_LINES.map((line, index) => (
          <Text key={`${index}:${line}`} color={tuiTheme.colors.primary}>
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text color={tuiTheme.colors.primary} bold>
            {APP_NAME}
          </Text>
          <Text color={tuiTheme.colors.dim}>v{appVersion}</Text>
        </Box>
        <Text color={tuiTheme.colors.dim}>{modelLabel}</Text>
        <Text color={tuiTheme.colors.dim}>{workspaceRoot}</Text>
        <Text color={tuiTheme.colors.dim}>
          session {sessionId} ({sessionMode})
        </Text>
        <Text color={tuiTheme.colors.dim}>
          tools {toolCount}  plugins {pluginCount}  context {projectContextCount}
        </Text>
      </Box>
    </Box>
  );
}
