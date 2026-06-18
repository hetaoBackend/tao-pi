import { join } from "node:path";
import type { CliOverrides } from "./cli/args.js";

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-mini";

export interface AppConfig {
  provider: string;
  modelId: string;
  modelTemplateId?: string;
  modelBaseUrl?: string;
  workspaceRoot: string;
  sessionDbPath: string;
  contextPrefix?: string;
  promptTimeZone?: string;
  debug: boolean;
  configuredPluginIds?: string;
  memoryDir?: string;
  skillDirs: string[];
  modelCompat: Record<string, boolean>;
  firecrawlApiKey?: string;
  firecrawlBaseUrl?: string;
}

export function loadAppConfig(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  overrides: CliOverrides;
  debugFlag: boolean;
}): AppConfig {
  const { cwd, env, overrides } = options;

  return {
    provider: overrides.provider ?? env.PI_PROVIDER ?? DEFAULT_PROVIDER,
    modelId: overrides.model ?? env.PI_MODEL ?? DEFAULT_MODEL,
    modelTemplateId: env.PI_MODEL_TEMPLATE,
    modelBaseUrl: overrides.baseUrl ?? env.PI_BASE_URL,
    workspaceRoot: cwd,
    sessionDbPath: env.PI_SESSION_DB ?? join(cwd, ".pi-sessions.sqlite"),
    contextPrefix: env.PI_CONTEXT_PREFIX,
    promptTimeZone: env.PI_TIMEZONE,
    debug: options.debugFlag || env.PI_DEBUG?.toLowerCase() === "true",
    configuredPluginIds: env.PI_PLUGINS,
    memoryDir: env.PI_MEMORY_DIR,
    skillDirs: parsePathList(env.PI_SKILLS_DIRS),
    modelCompat: {
      ...parseOptionalBooleanCompat("supportsDeveloperRole", env.PI_SUPPORTS_DEVELOPER_ROLE),
    },
    firecrawlApiKey: env.FIRECRAWL_API_KEY,
    firecrawlBaseUrl: env.FIRECRAWL_BASE_URL,
  };
}

function parseOptionalBooleanCompat(key: string, value: string | undefined): Record<string, boolean> {
  if (value === undefined) {
    return {};
  }

  return {
    [key]: value.toLowerCase() === "true",
  };
}

function parsePathList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(":")
    .map((path) => path.trim())
    .filter(Boolean);
}
