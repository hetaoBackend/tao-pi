import { Box, Text } from "ink";
import { tuiTheme } from "../theme.js";

export interface FooterProps {
  modelLabel: string;
  messageCount: number;
  toolCount: number;
  pluginCount: number;
}

export function Footer({ modelLabel, messageCount, toolCount, pluginCount }: FooterProps) {
  return (
    <Box width="100%" paddingX={1}>
      <Text color={tuiTheme.colors.dim}>
        {modelLabel} | messages {messageCount} | tools {toolCount} | plugins {pluginCount}
      </Text>
    </Box>
  );
}
