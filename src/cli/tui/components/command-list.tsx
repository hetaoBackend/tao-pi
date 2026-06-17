import { Box, Text } from "ink";
import type { TuiCommand } from "../command-registry.js";
import { tuiTheme } from "../theme.js";

const MAX_VISIBLE_COMMANDS = 5;

export interface CommandListProps {
  commands: readonly TuiCommand[];
  selectedIndex: number;
}

export function CommandList({ commands, selectedIndex }: CommandListProps) {
  const visibleCommands = commands.slice(0, MAX_VISIBLE_COMMANDS);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1}>
      <Text color={tuiTheme.colors.primary} bold>
        Commands
      </Text>
      {visibleCommands.length === 0 ? (
        <Text color={tuiTheme.colors.dim}>No commands found</Text>
      ) : (
        visibleCommands.map((command, index) => (
          <Box key={command.name} columnGap={1}>
            <Text color={index === selectedIndex ? tuiTheme.colors.primary : tuiTheme.colors.dim}>
              {index === selectedIndex ? tuiTheme.symbols.prompt : " "}
            </Text>
            <Text color={index === selectedIndex ? tuiTheme.colors.primary : undefined}>/{command.name}</Text>
            <Text color={tuiTheme.colors.dim}>[{command.source}] {summarize(command.description)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

function summarize(description: string, maxLength = 72): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}
