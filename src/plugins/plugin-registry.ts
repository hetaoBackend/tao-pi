import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface AgentPlugin {
  id: string;
  tools?: readonly AgentTool[];
  systemPromptSections?: readonly string[];
  slashCommands?: readonly AgentSlashCommand[];
}

export interface AgentSlashCommand {
  name: string;
  description: string;
  toPrompt: (input: AgentSlashCommandInput) => string;
}

export interface AgentSlashCommandInput {
  command: string;
  args: string;
  raw: string;
}

export interface AgentPluginRuntime {
  pluginIds: string[];
  tools: AgentTool[];
  systemPromptSections: string[];
  slashCommands: AgentSlashCommand[];
}

export function createAgentPluginRuntime(plugins: readonly AgentPlugin[]): AgentPluginRuntime {
  const pluginIds: string[] = [];
  const tools: AgentTool[] = [];
  const systemPromptSections: string[] = [];
  const slashCommands: AgentSlashCommand[] = [];
  const seenPluginIds = new Set<string>();
  const seenToolNames = new Set<string>();
  const seenSlashCommandNames = new Set<string>();

  for (const plugin of plugins) {
    const pluginId = plugin.id.trim();
    if (!pluginId) {
      throw new Error("Plugin id is required");
    }
    if (seenPluginIds.has(pluginId)) {
      throw new Error(`Duplicate plugin id: ${pluginId}`);
    }

    seenPluginIds.add(pluginId);
    pluginIds.push(pluginId);

    for (const tool of plugin.tools ?? []) {
      const toolName = tool.name.trim();
      if (!toolName) {
        throw new Error(`Plugin ${pluginId} includes a tool without a name`);
      }
      if (seenToolNames.has(toolName)) {
        throw new Error(`Duplicate plugin tool name: ${toolName}`);
      }

      seenToolNames.add(toolName);
      tools.push(tool);
    }

    for (const section of plugin.systemPromptSections ?? []) {
      const trimmedSection = section.trim();
      if (trimmedSection) {
        systemPromptSections.push(trimmedSection);
      }
    }

    for (const slashCommand of plugin.slashCommands ?? []) {
      const commandName = slashCommand.name.trim();
      if (!commandName) {
        throw new Error(`Plugin ${pluginId} includes a slash command without a name`);
      }
      if (seenSlashCommandNames.has(commandName)) {
        throw new Error(`Duplicate plugin slash command: ${commandName}`);
      }

      seenSlashCommandNames.add(commandName);
      slashCommands.push({
        ...slashCommand,
        name: commandName,
      });
    }
  }

  return {
    pluginIds,
    tools,
    systemPromptSections,
    slashCommands,
  };
}
