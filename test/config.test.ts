import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config.js";

describe("app config", () => {
  it("ignores PI_CONTEXT_PREFIX", () => {
    const config = loadAppConfig({
      cwd: "/workspace",
      env: { PI_CONTEXT_PREFIX: "unused" },
      overrides: {},
      debugFlag: false,
    });

    expect(config).not.toHaveProperty("contextPrefix");
  });

  it("loads defaults from ~/.tao/config.toml and lets env and CLI override them", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-config-home-"));
    const configDir = join(homeDir, ".tao");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "config.toml"),
      [
        'provider = "deepseek"',
        'model = "deepseek-v4-flash"',
        'model_template = "deepseek-v4-flash"',
        'base_url = "https://config.example/v1"',
        'api_key = "config-key"',
        'session_db = "~/.tao/sessions.sqlite"',
        'timezone = "Asia/Shanghai"',
        'plugins = "todo,memory,skills"',
        'memory_dir = "~/.tao/memory"',
        'skill_dirs = ["~/.tao/skills", ".tao/skills"]',
        "supports_developer_role = false",
        'firecrawl_api_key = "fc-config"',
        'firecrawl_base_url = "https://firecrawl.example"',
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const config = loadAppConfig({
        cwd: "/workspace",
        env: {
          PI_MODEL: "env-model",
          PI_API_KEY: "env-key",
          PI_DEBUG: "true",
        },
        overrides: {
          provider: "openai",
          baseUrl: "https://cli.example/v1",
        },
        debugFlag: false,
        homeDir,
      });

      expect(config.provider).toBe("openai");
      expect(config.modelId).toBe("env-model");
      expect(config.modelTemplateId).toBe("deepseek-v4-flash");
      expect(config.modelBaseUrl).toBe("https://cli.example/v1");
      expect(config.apiKey).toBe("env-key");
      expect(config.sessionDbPath).toBe(join(homeDir, ".tao", "sessions.sqlite"));
      expect(config.promptTimeZone).toBe("Asia/Shanghai");
      expect(config.debug).toBe(true);
      expect(config.configuredPluginIds).toBe("todo,memory,skills");
      expect(config.memoryDir).toBe("~/.tao/memory");
      expect(config.skillDirs).toEqual(["~/.tao/skills", ".tao/skills"]);
      expect(config.modelCompat).toEqual({ supportsDeveloperRole: false });
      expect(config.firecrawlApiKey).toBe("fc-config");
      expect(config.firecrawlBaseUrl).toBe("https://firecrawl.example");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
