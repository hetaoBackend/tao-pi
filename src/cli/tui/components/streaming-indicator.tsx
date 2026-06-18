import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { tuiTheme } from "../theme.js";

export interface StreamingIndicatorProps {
  streaming: boolean;
  nextTodo?: string;
  frame?: number;
}

export function StreamingIndicator({ streaming, nextTodo, frame }: StreamingIndicatorProps) {
  const liveFrame = useBlinkFrame(streaming);

  if (!streaming) {
    return null;
  }

  const indicator = workingIndicatorSymbol(frame ?? liveFrame);

  return (
    <Box flexDirection="column">
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.primary}>{indicator}</Text>
        <Text color={tuiTheme.colors.primary}>Working</Text>
      </Box>
      {nextTodo ? <Text color={tuiTheme.colors.dim}>Next: {nextTodo}</Text> : null}
    </Box>
  );
}

export function workingIndicatorSymbol(frame: number): string {
  return frame % 2 === 0 ? tuiTheme.symbols.assistant : " ";
}

function useBlinkFrame(active: boolean): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }

    const interval = setInterval(() => {
      setFrame((current) => current + 1);
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [active]);

  return frame;
}
