import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { AgentPlugin } from "./plugin-registry.js";
import { createMemoryPlugin } from "./memory-plugin.js";
import { createSkillsPlugin } from "./skills-plugin.js";
import { createTodoPlugin } from "./todo-plugin.js";

const DEFAULT_PLUGIN_IDS = ["todo", "memory", "skills"];

export interface CreateConfiguredPluginsOptions {
  workspaceRoot: string;
  configuredPluginIds?: string;
  memoryDir?: string;
  skillDirs?: string[];
  homeDir?: string;
}

export function createConfiguredPlugins(options: CreateConfiguredPluginsOptions): AgentPlugin[] {
  const pluginIds = parseConfiguredPluginIds(options.configuredPluginIds);
  const memoryDir = resolveMemoryDir(options.workspaceRoot, options.memoryDir);
  const homeDirectory = options.homeDir ?? homedir();
  const pluginFactories: Record<string, () => AgentPlugin> = {
    todo: createTodoPlugin,
    memory: () => createMemoryPlugin({ memoryDir }),
    skills: () =>
      createSkillsPlugin({ skillDirs: resolveSkillDirs(options.workspaceRoot, homeDirectory, options.skillDirs) }),
  };

  return pluginIds.map((pluginId) => {
    const createPlugin = pluginFactories[pluginId];
    if (!createPlugin) {
      throw new Error(`Unknown plugin: ${pluginId}. Available plugins: ${Object.keys(pluginFactories).join(", ")}`);
    }

    return createPlugin();
  });
}

function parseConfiguredPluginIds(configuredPluginIds: string | undefined): string[] {
  if (configuredPluginIds === undefined) {
    return [...DEFAULT_PLUGIN_IDS];
  }

  const trimmed = configuredPluginIds.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return [];
  }

  return trimmed
    .split(",")
    .map((pluginId) => pluginId.trim().toLowerCase())
    .filter(Boolean);
}

function resolveMemoryDir(workspaceRoot: string, configuredMemoryDir: string | undefined): string {
  if (!configuredMemoryDir) {
    return join(workspaceRoot, ".pi-memory");
  }

  return isAbsolute(configuredMemoryDir) ? configuredMemoryDir : join(workspaceRoot, configuredMemoryDir);
}

function resolveSkillDirs(workspaceRoot: string, homeDir: string, configuredSkillDirs: string[] | undefined): string[] {
  if (!configuredSkillDirs?.length) {
    return uniquePaths([
      join(homeDir, ".tao", "skills"),
      join(workspaceRoot, ".tao", "skills"),
    ]);
  }

  return configuredSkillDirs.map((skillDir) => resolveSkillDir(workspaceRoot, homeDir, skillDir));
}

function resolveSkillDir(workspaceRoot: string, homeDir: string, skillDir: string): string {
  if (skillDir === "~") {
    return homeDir;
  }
  if (skillDir.startsWith("~/") || skillDir.startsWith("~\\")) {
    return join(homeDir, skillDir.slice(2));
  }
  if (isAbsolute(skillDir)) {
    return skillDir;
  }

  return join(workspaceRoot, skillDir);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}
