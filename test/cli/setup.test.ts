import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { askTerminalSetupPrompt, formatSetupQuestion, runSetupCommand, type SetupPrompt } from "../../src/cli/setup.js";

describe("runSetupCommand", () => {
  it("writes a guided global config.toml from selected answers", async () => {
    const homeDir = join(tmpdir(), `tao-pi-setup-${process.pid}-${Date.now()}`);
    const answers = new Map([
      ["provider", "2"],
      ["model", "1"],
      ["endpoint", "2"],
      ["baseUrl", "https://api.deepseek.example/v1"],
      ["apiKey", "test-api-key"],
      ["sessionDb", "1"],
      ["plugins", "1"],
      ["webTools", "2"],
      ["firecrawlApiKey", "fc-test"],
    ]);

    const output: string[] = [];
    const prompts: SetupPrompt[] = [];
    try {
      const configPath = await runSetupCommand({
        homeDir,
        env: {},
        ask: async (prompt) => {
          prompts.push(prompt);
          return answers.get(prompt.name) ?? "";
        },
        output: { write: (text) => output.push(text) },
      });

      expect(configPath).toBe(join(homeDir, ".tao", "config.toml"));
      expect(readFileSync(configPath, "utf8")).toBe(
        [
          'provider = "deepseek"',
          'model = "deepseek-v4-flash"',
          'base_url = "https://api.deepseek.example/v1"',
          'api_key = "test-api-key"',
          'session_db = "~/.tao/sessions.sqlite"',
          'plugins = "todo,memory,skills"',
          'memory_dir = "~/.tao/memory"',
          'skill_dirs = ["~/.tao/skills", ".tao/skills"]',
          'firecrawl_api_key = "fc-test"',
          "",
        ].join("\n"),
      );
      expect(prompts.find((prompt) => prompt.name === "provider")?.choices?.map((choice) => choice.label)).toEqual([
        "OpenAI",
        "DeepSeek",
        "Anthropic",
        "Gemini",
        "OpenRouter",
        "Custom provider",
      ]);
      expect(prompts.find((prompt) => prompt.name === "model")?.choices?.map((choice) => choice.value)).toEqual([
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "__custom__",
      ]);
      expect(prompts.find((prompt) => prompt.name === "apiKey")?.secret).toBe(true);
      expect(prompts.map((prompt) => prompt.name)).not.toContain("timezone");
      expect(output.join("")).toContain("Wrote");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("uses cross-workspace defaults when optional answers are blank", async () => {
    const homeDir = join(tmpdir(), `tao-pi-setup-defaults-${process.pid}-${Date.now()}`);

    try {
      const configPath = await runSetupCommand({
        homeDir,
        cwd: "/workspace/project",
        env: {},
        ask: async () => "",
        output: { write: () => undefined },
      });

      const configText = readFileSync(configPath, "utf8");
      expect(configText).toContain('provider = "openai"');
      expect(configText).toContain('model = "gpt-4.1-mini"');
      expect(configText).toContain('session_db = "~/.tao/sessions.sqlite"');
      expect(configText).toContain('plugins = "todo,memory,skills"');
      expect(configText).toContain('memory_dir = "~/.tao/memory"');
      expect(configText).toContain('skill_dirs = ["~/.tao/skills", ".tao/skills"]');
      expect(configText).not.toContain("timezone");
      expect(configText).not.toContain("/workspace/project");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("asks before overwriting an existing config and keeps it when declined", async () => {
    const homeDir = join(tmpdir(), `tao-pi-setup-existing-${process.pid}-${Date.now()}`);
    const configDir = join(homeDir, ".tao");
    const configPath = join(configDir, "config.toml");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, 'provider = "deepseek"\nmodel = "deepseek-v4-flash"\n', "utf8");

    const output: string[] = [];
    const prompts: SetupPrompt[] = [];
    try {
      const result = await runSetupCommand({
        homeDir,
        env: {},
        ask: async (prompt) => {
          prompts.push(prompt);
          return "";
        },
        output: { write: (text) => output.push(text) },
      });

      expect(result).toBe(configPath);
      expect(readFileSync(configPath, "utf8")).toBe('provider = "deepseek"\nmodel = "deepseek-v4-flash"\n');
      expect(prompts.map((prompt) => prompt.name)).toEqual(["overwriteConfig"]);
      expect(prompts[0]?.choices?.map((choice) => choice.value)).toEqual(["no", "yes"]);
      expect(output.join("")).toContain("Keeping");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("confirms overwrite before entering setup for an existing config", async () => {
    const homeDir = join(tmpdir(), `tao-pi-setup-overwrite-${process.pid}-${Date.now()}`);
    const configDir = join(homeDir, ".tao");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.toml"), 'provider = "openai"\nmodel = "gpt-4.1-mini"\n', "utf8");

    const answers = new Map([
      ["overwriteConfig", "2"],
      ["provider", "1"],
      ["model", "1"],
      ["endpoint", "1"],
      ["apiKey", "new-api-key"],
      ["sessionDb", "1"],
      ["plugins", "1"],
      ["webTools", "1"],
    ]);
    const prompts: SetupPrompt[] = [];
    try {
      await runSetupCommand({
        homeDir,
        env: {},
        ask: async (prompt) => {
          prompts.push(prompt);
          return answers.get(prompt.name) ?? "";
        },
        output: { write: () => undefined },
      });

      expect(prompts.map((prompt) => prompt.name).slice(0, 2)).toEqual(["overwriteConfig", "provider"]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("lets terminal choices move with arrow keys and confirm with enter", async () => {
    const input = new PassThrough() as PassThrough & {
      isTTY: true;
      isRaw: boolean;
      setRawMode: (mode: boolean) => void;
    };
    const rawModes: boolean[] = [];
    input.isTTY = true;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      rawModes.push(mode);
      input.isRaw = mode;
    };
    const writes: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        writes.push(String(chunk));
        callback();
      },
    });

    const answer = askTerminalSetupPrompt(input, output, {
      name: "provider",
      message: "Provider",
      defaultValue: "openai",
      choices: [
        { label: "OpenAI", value: "openai" },
        { label: "DeepSeek", value: "deepseek" },
      ],
    });
    input.write("\u001b[B");
    input.write("\r");

    await expect(answer).resolves.toBe("deepseek");
    expect(rawModes).toEqual([true, false]);
    expect(writes.join("")).toContain("Use Up/Down and Enter to select.");
    expect(writes.join("")).toContain("> DeepSeek");
  });

  it("formats choices and masks secret defaults", () => {
    expect(
      formatSetupQuestion({
        name: "provider",
        message: "Provider",
        defaultValue: "openai",
        choices: [
          { label: "OpenAI", value: "openai" },
          { label: "DeepSeek", value: "deepseek" },
        ],
      }),
    ).toBe(["Provider:", "  1. OpenAI", "  2. DeepSeek", "Choose [OpenAI]: "].join("\n"));

    expect(
      formatSetupQuestion({
        name: "apiKey",
        message: "API key",
        defaultValue: "sk-secret-value",
        secret: true,
      }),
    ).toBe("API key [*****]: ");
  });
});
