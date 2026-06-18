import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliOverrides } from "./cli/args.js";

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-mini";

export interface AppConfig {
  provider: string;
  modelId: string;
  modelTemplateId?: string;
  modelBaseUrl?: string;
  apiKey?: string;
  workspaceRoot: string;
  sessionDbPath: string;
  promptTimeZone?: string;
  debug: boolean;
  configuredPluginIds?: string;
  memoryDir?: string;
  skillDirs: string[];
  modelCompat: Record<string, boolean>;
  firecrawlApiKey?: string;
  firecrawlBaseUrl?: string;
}

export interface TaoConfigFile {
  provider?: string;
  model?: string;
  modelTemplate?: string;
  baseUrl?: string;
  apiKey?: string;
  sessionDb?: string;
  timezone?: string;
  debug?: boolean;
  plugins?: string;
  memoryDir?: string;
  skillDirs?: string[];
  supportsDeveloperRole?: boolean;
  firecrawlApiKey?: string;
  firecrawlBaseUrl?: string;
}

export function loadAppConfig(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  overrides: CliOverrides;
  debugFlag: boolean;
  homeDir?: string;
  configPath?: string;
  getProviderApiKey?: (provider: string, env: NodeJS.ProcessEnv) => string | undefined;
}): AppConfig {
  const { cwd, env, overrides } = options;
  const homeDir = options.homeDir ?? homedir();
  const fileConfig = loadTaoConfigFile(options.configPath ?? getTaoConfigPath(homeDir));
  const provider = overrides.provider ?? env.PI_PROVIDER ?? fileConfig.provider ?? DEFAULT_PROVIDER;
  const modelCompat = parseOptionalBooleanCompat(
    "supportsDeveloperRole",
    env.PI_SUPPORTS_DEVELOPER_ROLE,
    fileConfig.supportsDeveloperRole,
  );

  return {
    provider,
    modelId: overrides.model ?? env.PI_MODEL ?? fileConfig.model ?? DEFAULT_MODEL,
    modelTemplateId: env.PI_MODEL_TEMPLATE ?? fileConfig.modelTemplate,
    modelBaseUrl: overrides.baseUrl ?? env.PI_BASE_URL ?? fileConfig.baseUrl,
    apiKey: env.PI_API_KEY ?? options.getProviderApiKey?.(provider, env) ?? fileConfig.apiKey,
    workspaceRoot: cwd,
    sessionDbPath: expandTilde(env.PI_SESSION_DB ?? fileConfig.sessionDb, homeDir) ?? join(cwd, ".pi-sessions.sqlite"),
    promptTimeZone: env.PI_TIMEZONE ?? fileConfig.timezone,
    debug: options.debugFlag || parseOptionalBoolean(env.PI_DEBUG, fileConfig.debug) === true,
    configuredPluginIds: env.PI_PLUGINS ?? fileConfig.plugins,
    memoryDir: env.PI_MEMORY_DIR ?? fileConfig.memoryDir,
    skillDirs: env.PI_SKILLS_DIRS === undefined ? fileConfig.skillDirs ?? [] : parsePathList(env.PI_SKILLS_DIRS),
    modelCompat,
    firecrawlApiKey: env.FIRECRAWL_API_KEY ?? fileConfig.firecrawlApiKey,
    firecrawlBaseUrl: env.FIRECRAWL_BASE_URL ?? fileConfig.firecrawlBaseUrl,
  };
}

export function getTaoConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".tao", "config.toml");
}

export function loadTaoConfigFile(configPath: string): TaoConfigFile {
  if (!existsSync(configPath)) {
    return {};
  }

  return parseTaoConfigToml(readFileSync(configPath, "utf8"));
}

export function parseTaoConfigToml(input: string): TaoConfigFile {
  const config: TaoConfigFile = {};
  const fieldByTomlKey: Record<string, keyof TaoConfigFile> = {
    provider: "provider",
    model: "model",
    model_template: "modelTemplate",
    base_url: "baseUrl",
    api_key: "apiKey",
    session_db: "sessionDb",
    timezone: "timezone",
    debug: "debug",
    plugins: "plugins",
    memory_dir: "memoryDir",
    skill_dirs: "skillDirs",
    supports_developer_role: "supportsDeveloperRole",
    firecrawl_api_key: "firecrawlApiKey",
    firecrawl_base_url: "firecrawlBaseUrl",
  };

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      return;
    }

    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid Tao config line ${index + 1}: ${rawLine}`);
    }

    const [, tomlKey, rawValue] = match;
    const field = fieldByTomlKey[tomlKey];
    if (!field) {
      return;
    }

    const value = parseTomlValue(rawValue.trim(), index + 1);
    assignConfigValue(config, field, value, index + 1);
  });

  return config;
}

export function serializeTaoConfigToml(config: TaoConfigFile): string {
  const lines: string[] = [];

  appendString(lines, "provider", config.provider);
  appendString(lines, "model", config.model);
  appendString(lines, "model_template", config.modelTemplate);
  appendString(lines, "base_url", config.baseUrl);
  appendString(lines, "api_key", config.apiKey);
  appendString(lines, "timezone", config.timezone);
  appendString(lines, "session_db", config.sessionDb);
  appendString(lines, "plugins", config.plugins);
  appendString(lines, "memory_dir", config.memoryDir);
  appendStringArray(lines, "skill_dirs", config.skillDirs);
  appendBoolean(lines, "supports_developer_role", config.supportsDeveloperRole);
  appendString(lines, "firecrawl_api_key", config.firecrawlApiKey);
  appendString(lines, "firecrawl_base_url", config.firecrawlBaseUrl);

  return `${lines.join("\n")}\n`;
}

function parseOptionalBooleanCompat(
  key: string,
  envValue: string | undefined,
  configValue: boolean | undefined,
): Record<string, boolean> {
  const value = parseOptionalBoolean(envValue, configValue);
  if (value === undefined) {
    return {};
  }

  return {
    [key]: value,
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

function parseOptionalBoolean(envValue: string | undefined, configValue: boolean | undefined): boolean | undefined {
  if (envValue === undefined) {
    return configValue;
  }

  return envValue.toLowerCase() === "true";
}

function expandTilde(value: string | undefined, homeDir: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homeDir, value.slice(2));
  }

  return value;
}

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaping) {
      escaping = false;
      continue;
    }

    if (quote === '"' && char === "\\") {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && quote === undefined) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = undefined;
      continue;
    }

    if (char === "#" && quote === undefined) {
      return line.slice(0, index);
    }
  }

  return line;
}

function parseTomlValue(rawValue: string, lineNumber: number): unknown {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return splitTomlArray(inner).map((item) => parseTomlString(item.trim(), lineNumber));
  }

  return parseTomlString(rawValue, lineNumber);
}

function parseTomlString(rawValue: string, lineNumber: number): string {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  throw new Error(`Invalid Tao config value on line ${lineNumber}: expected a string, boolean, or string array`);
}

function splitTomlArray(value: string): string[] {
  const items: string[] = [];
  let quote: '"' | "'" | undefined;
  let escaping = false;
  let itemStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaping) {
      escaping = false;
      continue;
    }

    if (quote === '"' && char === "\\") {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && quote === undefined) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = undefined;
      continue;
    }

    if (char === "," && quote === undefined) {
      items.push(value.slice(itemStart, index));
      itemStart = index + 1;
    }
  }

  items.push(value.slice(itemStart));
  return items.filter((item) => item.trim().length > 0);
}

function assignConfigValue(
  config: TaoConfigFile,
  field: keyof TaoConfigFile,
  value: unknown,
  lineNumber: number,
): void {
  if (field === "debug" || field === "supportsDeveloperRole") {
    if (typeof value !== "boolean") {
      throw new Error(`Invalid Tao config line ${lineNumber}: ${field} must be a boolean`);
    }
    config[field] = value;
    return;
  }

  if (field === "skillDirs") {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error(`Invalid Tao config line ${lineNumber}: skill_dirs must be an array of strings`);
    }
    config.skillDirs = value;
    return;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid Tao config line ${lineNumber}: ${field} must be a string`);
  }
  config[field] = value;
}

function appendString(lines: string[], key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`${key} = ${JSON.stringify(trimmed)}`);
}

function appendStringArray(lines: string[], key: string, value: string[] | undefined): void {
  const items = value?.map((item) => item.trim()).filter(Boolean);
  if (!items?.length) {
    return;
  }

  lines.push(`${key} = [${items.map((item) => JSON.stringify(item)).join(", ")}]`);
}

function appendBoolean(lines: string[], key: string, value: boolean | undefined): void {
  if (value === undefined) {
    return;
  }

  lines.push(`${key} = ${value ? "true" : "false"}`);
}
