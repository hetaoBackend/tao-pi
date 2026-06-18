import { Box, Text, useBoxMetrics, useInput } from "ink";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { TuiRow } from "../view-state.js";
import { tuiTheme } from "../theme.js";
import { formatAssistantTextBlocks, type AssistantTextSpan } from "../message-format.js";
import { getAbsoluteLayoutPosition } from "../layout.js";
import {
  findToolResultHitTarget,
  getTerminalRectangle,
  parseSgrMouseInput,
  type TerminalRectangle,
  type ToolResultHitTarget,
} from "../mouse.js";

export interface MessageHistoryProps {
  rows: readonly TuiRow[];
  toolResultsExpanded?: boolean;
  onToggleToolResult?: (toolCallId: string) => void;
}

type ToolRow = Extract<TuiRow, { kind: "tool" }>;

export function MessageHistory({ rows, toolResultsExpanded = false, onToggleToolResult }: MessageHistoryProps) {
  const toolHitTargetsRef = useRef<ToolResultHitTarget[]>([]);
  const registerToolResultTarget = useCallback((toolCallId: string, rectangle?: TerminalRectangle) => {
    toolHitTargetsRef.current = toolHitTargetsRef.current.filter((target) => target.toolCallId !== toolCallId);
    if (rectangle) {
      toolHitTargetsRef.current = [...toolHitTargetsRef.current, { toolCallId, rectangle }];
    }
  }, []);

  useToolResultMouseToggle(toolHitTargetsRef, onToggleToolResult);

  if (rows.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" rowGap={1}>
      {rows.map((row, index) => (
        <MessageRow
          key={`${row.kind}:${index}`}
          row={row}
          toolResultsExpanded={toolResultsExpanded}
          onToggleToolResult={onToggleToolResult}
          registerToolResultTarget={registerToolResultTarget}
        />
      ))}
    </Box>
  );
}

function MessageRow({
  row,
  toolResultsExpanded,
  onToggleToolResult,
  registerToolResultTarget,
}: {
  row: TuiRow;
  toolResultsExpanded: boolean;
  onToggleToolResult?: (toolCallId: string) => void;
  registerToolResultTarget: (toolCallId: string, rectangle?: TerminalRectangle) => void;
}) {
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
      return (
        <ToolMessageRow
          row={row}
          toolResultsExpanded={toolResultsExpanded}
          onToggleToolResult={onToggleToolResult}
          registerToolResultTarget={registerToolResultTarget}
        />
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

function ToolMessageRow({
  row,
  toolResultsExpanded,
  onToggleToolResult,
  registerToolResultTarget,
}: {
  row: ToolRow;
  toolResultsExpanded: boolean;
  onToggleToolResult?: (toolCallId: string) => void;
  registerToolResultTarget: (toolCallId: string, rectangle?: TerminalRectangle) => void;
}) {
  const rowRef = useRef(null);
  const metrics = useBoxMetrics(rowRef);
  const hasResult = Boolean(row.result || row.fullResult);
  const isPreviewedByDefault = row.toolName === "write_file";
  const isFoldable = !isPreviewedByDefault && hasResult;
  const resultExpanded = isFoldable && Boolean(toolResultsExpanded || row.resultExpanded);
  const result = formatVisibleToolResult(row, { isFoldable, resultExpanded, toolResultsExpanded });

  useEffect(() => {
    if (!isFoldable || !onToggleToolResult || !metrics.hasMeasured) {
      registerToolResultTarget(row.toolCallId);
      return;
    }

    registerToolResultTarget(
      row.toolCallId,
      getTerminalRectangle(getAbsoluteLayoutPosition(rowRef.current), metrics),
    );

    return () => registerToolResultTarget(row.toolCallId);
  }, [
    isFoldable,
    metrics.hasMeasured,
    metrics.height,
    metrics.left,
    metrics.top,
    metrics.width,
    onToggleToolResult,
    registerToolResultTarget,
    row.toolCallId,
  ]);

  return (
    <Box
      ref={rowRef}
      flexDirection="column"
      aria-role={isFoldable ? "button" : undefined}
      aria-state={isFoldable ? { expanded: resultExpanded } : undefined}
    >
      <Box columnGap={1}>
        <Text color={row.status === "error" ? tuiTheme.colors.error : tuiTheme.colors.dim}>
          {isFoldable ? (resultExpanded ? "v" : ">") : tuiTheme.symbols.tool}
        </Text>
        <Text>{row.title}</Text>
        <Text color={statusColor(row.status)}>{row.status}</Text>
      </Box>
      {row.detail ? <Text color={tuiTheme.colors.dim}>  {row.detail}</Text> : null}
      {result ? <Text color={tuiTheme.colors.dim}>  {result}</Text> : null}
    </Box>
  );
}

function formatVisibleToolResult(
  row: ToolRow,
  options: { isFoldable: boolean; resultExpanded: boolean; toolResultsExpanded: boolean },
): string | undefined {
  if (options.isFoldable) {
    return options.resultExpanded ? row.fullResult ?? row.result : undefined;
  }

  if (options.toolResultsExpanded && row.resultTruncated) {
    return row.fullResult ?? row.result;
  }

  return row.result;
}

function useToolResultMouseToggle(
  toolHitTargetsRef: RefObject<readonly ToolResultHitTarget[]>,
  onToggleToolResult: ((toolCallId: string) => void) | undefined,
) {
  useInput(
    (input) => {
      const mouseInput = parseSgrMouseInput(input);
      if (!mouseInput || mouseInput.button !== "left" || mouseInput.action !== "press") {
        return;
      }

      const target = findToolResultHitTarget(toolHitTargetsRef.current, mouseInput);
      if (target) {
        onToggleToolResult?.(target.toolCallId);
      }
    },
    { isActive: Boolean(onToggleToolResult) },
  );
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
