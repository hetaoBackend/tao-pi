import { Box, Text } from "ink";
import type { TuiRow } from "../view-state.js";
import { tuiTheme } from "../theme.js";

export interface MessageHistoryProps {
  rows: readonly TuiRow[];
  toolResultsExpanded?: boolean;
}

export function MessageHistory({ rows, toolResultsExpanded = false }: MessageHistoryProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" rowGap={1}>
      {rows.map((row, index) => (
        <MessageRow key={`${row.kind}:${index}`} row={row} toolResultsExpanded={toolResultsExpanded} />
      ))}
    </Box>
  );
}

function MessageRow({ row, toolResultsExpanded }: { row: TuiRow; toolResultsExpanded: boolean }) {
  switch (row.kind) {
    case "user":
      return (
        <Box columnGap={1}>
          <Text color={tuiTheme.colors.primary} bold>
            {tuiTheme.symbols.prompt}
          </Text>
          <Text>{row.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box columnGap={1}>
          <Text color={row.error ? tuiTheme.colors.error : tuiTheme.colors.accent}>{tuiTheme.symbols.assistant}</Text>
          <Text color={row.error ? tuiTheme.colors.error : undefined}>{row.text}</Text>
        </Box>
      );
    case "tool":
      const result = toolResultsExpanded && row.resultTruncated ? row.fullResult : row.result;
      return (
        <Box flexDirection="column">
          <Box columnGap={1}>
            <Text color={row.status === "error" ? tuiTheme.colors.error : tuiTheme.colors.dim}>
              {tuiTheme.symbols.tool}
            </Text>
            <Text>{row.title}</Text>
            <Text color={statusColor(row.status)}>{row.status}</Text>
          </Box>
          {row.detail ? <Text color={tuiTheme.colors.dim}>  {row.detail}</Text> : null}
          {result ? <Text color={tuiTheme.colors.dim}>  {result}</Text> : null}
        </Box>
      );
    case "steering":
      return (
        <Box columnGap={1}>
          <Text color={tuiTheme.colors.warning}>{tuiTheme.symbols.steering}</Text>
          <Text color={tuiTheme.colors.warning}>{row.text}</Text>
        </Box>
      );
    case "system":
      return <Text color={row.tone === "error" ? tuiTheme.colors.error : tuiTheme.colors.dim}>{row.text}</Text>;
    default:
      return null;
  }
}

function statusColor(status: "running" | "ok" | "error") {
  if (status === "error") {
    return tuiTheme.colors.error;
  }
  if (status === "ok") {
    return tuiTheme.colors.accent;
  }
  return tuiTheme.colors.dim;
}
