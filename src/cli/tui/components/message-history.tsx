import { Box, Text } from "ink";
import type { TuiRow } from "../view-state.js";
import { tuiTheme } from "../theme.js";
import { formatAssistantTextBlocks, type AssistantTextSpan } from "../message-format.js";

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
        <Box columnGap={1} alignItems="flex-start">
          <Text color={row.error ? tuiTheme.colors.error : tuiTheme.colors.accent}>{tuiTheme.symbols.assistant}</Text>
          <AssistantMessageText text={row.text} error={row.error} />
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

function AssistantMessageText({ text, error }: { text: string; error?: boolean }) {
  if (!text) {
    return <Text />;
  }

  if (error) {
    return <Text color={tuiTheme.colors.error}>{text}</Text>;
  }

  return (
    <Box flexDirection="column">
      {formatAssistantTextBlocks(text).map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <Text key={index}>
                <AssistantTextSpans spans={block.spans} forceStrong />
              </Text>
            );
          case "paragraph":
            return (
              <Text key={index}>
                <AssistantTextSpans spans={block.spans} />
              </Text>
            );
          case "listItem":
            return (
              <Text key={index}>
                <Text color={tuiTheme.colors.dim}>- </Text>
                <AssistantTextSpans spans={block.spans} />
              </Text>
            );
          case "codeBlock":
            return (
              <Text key={index} color={tuiTheme.colors.code}>
                {block.spans.map((span) => span.text).join("")}
              </Text>
            );
          case "blank":
            return <Text key={index}> </Text>;
          default:
            return null;
        }
      })}
    </Box>
  );
}

function AssistantTextSpans({ spans, forceStrong = false }: { spans: readonly AssistantTextSpan[]; forceStrong?: boolean }) {
  return (
    <>
      {spans.map((span, index) => (
        <Text
          key={index}
          bold={forceStrong || span.style === "strong"}
          color={span.style === "code" ? tuiTheme.colors.code : undefined}
        >
          {span.text}
        </Text>
      ))}
    </>
  );
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
