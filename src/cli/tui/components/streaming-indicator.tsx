import { Box, Text } from "ink";
import { tuiTheme } from "../theme.js";

export interface StreamingIndicatorProps {
  streaming: boolean;
  nextTodo?: string;
}

export function StreamingIndicator({ streaming, nextTodo }: StreamingIndicatorProps) {
  if (!streaming) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.primary}>{tuiTheme.symbols.assistant}</Text>
        <Text color={tuiTheme.colors.primary}>Working</Text>
      </Box>
      {nextTodo ? <Text color={tuiTheme.colors.dim}>Next: {nextTodo}</Text> : null}
    </Box>
  );
}
