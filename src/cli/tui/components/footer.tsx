import { Box, Text } from "ink";
import { tuiTheme } from "../theme.js";

export interface FooterProps {
  modelLabel: string;
  sessionMode: "new" | "resumed";
  messageCount: number;
  toolCount: number;
  pluginCount: number;
  inputMode: "prompt" | "steer";
}

export function Footer({ modelLabel, sessionMode, messageCount, toolCount, pluginCount, inputMode }: FooterProps) {
  return (
    <Box width="100%" paddingX={1}>
      <Text color={tuiTheme.colors.dim}>
        {modelLabel} | {sessionMode} | messages {messageCount} | tools {toolCount} | plugins {pluginCount} | mode{" "}
        {inputMode}
      </Text>
    </Box>
  );
}
