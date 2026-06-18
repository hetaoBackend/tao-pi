import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import {
  getTaoConfigPath,
  loadAppConfig,
  loadTaoConfigFile,
  serializeTaoConfigToml,
  type TaoConfigFile,
} from "../config.js";

export interface SetupOutput {
  write(text: string): unknown;
}

export interface SetupChoice {
  label: string;
  value: string;
}

export interface SetupPrompt {
  name: string;
  message: string;
  defaultValue?: string;
  choices?: SetupChoice[];
  secret?: boolean;
}

export interface RunSetupCommandOptions {
  homeDir?: string;
  cwd?: string;
  env: NodeJS.ProcessEnv;
  ask: (prompt: SetupPrompt) => Promise<string>;
  output: SetupOutput;
}

const CUSTOM_VALUE = "__custom__";

const PROVIDER_CHOICES: SetupChoice[] = [
  { label: "OpenAI", value: "openai" },
  { label: "DeepSeek", value: "deepseek" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Gemini", value: "google" },
  { label: "OpenRouter", value: "openrouter" },
  { label: "Custom provider", value: CUSTOM_VALUE },
];

const MODEL_CHOICES_BY_PROVIDER: Record<string, SetupChoice[]> = {
  openai: [
    { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
    { label: "GPT-4.1", value: "gpt-4.1" },
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
    { label: "Custom model", value: CUSTOM_VALUE },
  ],
  deepseek: [
    { label: "DeepSeek V4 Flash", value: "deepseek-v4-flash" },
    { label: "DeepSeek V4 Pro", value: "deepseek-v4-pro" },
    { label: "Custom model", value: CUSTOM_VALUE },
  ],
  anthropic: [
    { label: "Claude Sonnet 4.5", value: "claude-sonnet-4-5" },
    { label: "Claude Haiku 4.5", value: "claude-haiku-4-5" },
    { label: "Custom model", value: CUSTOM_VALUE },
  ],
  google: [
    { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
    { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
    { label: "Custom model", value: CUSTOM_VALUE },
  ],
  openrouter: [
    { label: "OpenAI GPT-4.1 mini", value: "openai/gpt-4.1-mini" },
    { label: "Anthropic Claude Sonnet 4.5", value: "anthropic/claude-sonnet-4.5" },
    { label: "Custom model", value: CUSTOM_VALUE },
  ],
};

export async function runSetupCommand(options: RunSetupCommandOptions): Promise<string> {
  const homeDir = options.homeDir ?? homedir();
  const configPath = getTaoConfigPath(homeDir);

  if (existsSync(configPath)) {
    options.output.write(`Config already exists at ${configPath}\n`);
    const overwrite = await askChoice(options, {
      name: "overwriteConfig",
      message: "Overwrite existing config?",
      defaultValue: "no",
      choices: [
        { label: "No, keep current config", value: "no" },
        { label: "Yes, overwrite it", value: "yes" },
      ],
    });

    if (overwrite !== "yes") {
      options.output.write(`Keeping ${configPath}\n`);
      return configPath;
    }
  }

  const existingFileConfig = loadTaoConfigFile(configPath);
  const current = loadAppConfig({
    cwd: options.cwd ?? process.cwd(),
    env: options.env,
    overrides: {},
    debugFlag: false,
    homeDir,
    configPath,
  });

  options.output.write(`Configuring ${configPath}\n`);

  const selectedProvider = await askChoice(options, {
    name: "provider",
    message: "Provider",
    defaultValue: current.provider,
    choices: PROVIDER_CHOICES,
  });
  const provider =
    selectedProvider === CUSTOM_VALUE
      ? (await askText(options, {
          name: "customProvider",
          message: "Custom provider id",
          defaultValue: existingFileConfig.provider,
        })) ?? current.provider
      : selectedProvider;

  const modelChoices = MODEL_CHOICES_BY_PROVIDER[provider] ?? [
    { label: "Use current/default model", value: current.modelId },
    { label: "Custom model", value: CUSTOM_VALUE },
  ];
  const selectedModel = await askChoice(options, {
    name: "model",
    message: "Model",
    defaultValue: current.modelId,
    choices: modelChoices,
  });
  const model =
    selectedModel === CUSTOM_VALUE
      ? (await askText(options, {
          name: "customModel",
          message: "Custom model id",
          defaultValue: existingFileConfig.model,
        })) ?? current.modelId
      : selectedModel;

  const endpoint = await askChoice(options, {
    name: "endpoint",
    message: "Endpoint",
    defaultValue: current.modelBaseUrl ? "custom" : "default",
    choices: [
      { label: "Provider default", value: "default" },
      { label: "Custom OpenAI-compatible base URL", value: "custom" },
    ],
  });
  const baseUrl =
    endpoint === "custom"
      ? await askText(options, {
          name: "baseUrl",
          message: "Base URL",
          defaultValue: current.modelBaseUrl,
        })
      : undefined;

  const sessionDb = await askSessionDb(options, existingFileConfig.sessionDb);
  const plugins = await askPlugins(options, current.configuredPluginIds);
  const webTools = await askChoice(options, {
    name: "webTools",
    message: "Web tools",
    defaultValue: current.firecrawlApiKey ? "enabled" : "disabled",
    choices: [
      { label: "Disabled", value: "disabled" },
      { label: "Enable Firecrawl web_search/web_fetch", value: "enabled" },
    ],
  });

  const config: TaoConfigFile = {
    provider,
    model,
    baseUrl,
    apiKey: await askText(options, {
      name: "apiKey",
      message: "API key",
      defaultValue: current.apiKey,
      secret: true,
    }),
    sessionDb,
    plugins,
    memoryDir: existingFileConfig.memoryDir ?? "~/.tao/memory",
    skillDirs: existingFileConfig.skillDirs?.length ? existingFileConfig.skillDirs : ["~/.tao/skills", ".tao/skills"],
    firecrawlApiKey:
      webTools === "enabled"
        ? await askText(options, {
            name: "firecrawlApiKey",
            message: "Firecrawl API key",
            defaultValue: current.firecrawlApiKey,
            secret: true,
          })
        : undefined,
  };

  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, serializeTaoConfigToml(config), { encoding: "utf8", mode: 0o600 });
  options.output.write(`Wrote ${configPath}\n`);

  return configPath;
}

export async function askTerminalSetupPrompt(input: Readable, output: Writable, prompt: SetupPrompt): Promise<string> {
  if (prompt.choices?.length && canUseRawMode(input)) {
    return askTerminalChoice(input, output, prompt);
  }

  const question = formatSetupQuestion(prompt);
  if (prompt.secret && canUseRawMode(input)) {
    return askMaskedTerminalInput(input, output, question);
  }

  const readline = createInterface({ input, output });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

export function formatSetupQuestion(prompt: SetupPrompt): string {
  if (prompt.choices?.length) {
    const defaultLabel = findChoiceLabel(prompt.choices, prompt.defaultValue);
    return [
      `${prompt.message}:`,
      ...prompt.choices.map((choice, index) => `  ${index + 1}. ${choice.label}`),
      `Choose${defaultLabel ? ` [${defaultLabel}]` : ""}: `,
    ].join("\n");
  }

  const value = prompt.defaultValue?.trim();
  if (!value) {
    return `${prompt.message}: `;
  }

  return `${prompt.message} [${prompt.secret ? "*****" : value}]: `;
}

async function askSessionDb(options: RunSetupCommandOptions, existingValue: string | undefined): Promise<string> {
  const selected = await askChoice(options, {
    name: "sessionDb",
    message: "Session storage",
    defaultValue: existingValue ?? "global",
    choices: [
      { label: "Global ~/.tao/sessions.sqlite", value: "global" },
      { label: "Workspace .pi-sessions.sqlite", value: "workspace" },
      { label: "Custom path", value: CUSTOM_VALUE },
    ],
  });

  if (selected === "global") {
    return "~/.tao/sessions.sqlite";
  }
  if (selected === "workspace") {
    return ".pi-sessions.sqlite";
  }

  return (
    (await askText(options, {
      name: "customSessionDb",
      message: "Session DB path",
      defaultValue: existingValue,
    })) ?? "~/.tao/sessions.sqlite"
  );
}

async function askPlugins(options: RunSetupCommandOptions, currentValue: string | undefined): Promise<string> {
  const selected = await askChoice(options, {
    name: "plugins",
    message: "Plugins",
    defaultValue: currentValue ?? "default",
    choices: [
      { label: "Default todo,memory,skills", value: "default" },
      { label: "Minimal core tools only", value: "none" },
      { label: "Custom plugin list", value: CUSTOM_VALUE },
    ],
  });

  if (selected === "default") {
    return "todo,memory,skills";
  }
  if (selected === "none") {
    return "none";
  }

  return (
    (await askText(options, {
      name: "customPlugins",
      message: "Plugin ids",
      defaultValue: currentValue,
    })) ?? "todo,memory,skills"
  );
}

async function askChoice(options: RunSetupCommandOptions, prompt: SetupPrompt): Promise<string> {
  return resolveChoiceAnswer(prompt, await askPrompt(options, prompt));
}

async function askText(options: RunSetupCommandOptions, prompt: SetupPrompt): Promise<string | undefined> {
  const answer = await askPrompt(options, prompt);
  return answer || prompt.defaultValue?.trim() || undefined;
}

async function askPrompt(options: RunSetupCommandOptions, prompt: SetupPrompt): Promise<string> {
  return (await options.ask(prompt)).trim();
}

function resolveChoiceAnswer(prompt: SetupPrompt, answer: string): string {
  if (!prompt.choices?.length) {
    return answer || prompt.defaultValue?.trim() || "";
  }

  if (!answer) {
    return prompt.defaultValue?.trim() || prompt.choices[0]?.value || "";
  }

  const selectedIndex = Number.parseInt(answer, 10);
  if (Number.isInteger(selectedIndex) && String(selectedIndex) === answer) {
    return prompt.choices[selectedIndex - 1]?.value ?? answer;
  }

  const normalizedAnswer = answer.toLowerCase();
  const matchingChoice = prompt.choices.find(
    (choice) => choice.value.toLowerCase() === normalizedAnswer || choice.label.toLowerCase() === normalizedAnswer,
  );

  return matchingChoice?.value ?? answer;
}

function findChoiceLabel(choices: SetupChoice[], value: string | undefined): string | undefined {
  if (!value) {
    return choices[0]?.label;
  }

  return choices.find((choice) => choice.value === value)?.label ?? value;
}

function findChoiceIndex(choices: SetupChoice[], value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const index = choices.findIndex((choice) => choice.value === value);
  return index >= 0 ? index : 0;
}

function wrapChoiceIndex(index: number, length: number): number {
  return (index + length) % length;
}

function renderTerminalChoicePrompt(prompt: SetupPrompt, selectedIndex: number): string {
  const lines = [
    `${prompt.message}:`,
    "Use Up/Down and Enter to select.",
    ...prompt.choices!.map((choice, index) => `${index === selectedIndex ? ">" : " "} ${choice.label}`),
  ];

  return `${lines.join("\n")}\n`;
}

function askTerminalChoice(
  input: Readable & {
    isRaw?: boolean;
    setRawMode: (mode: boolean) => void;
    isPaused?: () => boolean;
  },
  output: Writable,
  prompt: SetupPrompt,
): Promise<string> {
  const choices = prompt.choices ?? [];
  let selectedIndex = findChoiceIndex(choices, prompt.defaultValue);
  const renderedLineCount = choices.length + 2;
  const wasRaw = input.isRaw === true;
  const wasPaused = input.isPaused?.() ?? false;

  input.setRawMode(true);
  input.resume();
  output.write(renderTerminalChoicePrompt(prompt, selectedIndex));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.off("data", handleData);
      input.setRawMode(wasRaw);
      if (wasPaused) {
        input.pause();
      }
    };

    const render = () => {
      output.write(`\u001b[${renderedLineCount}A\u001b[0J`);
      output.write(renderTerminalChoicePrompt(prompt, selectedIndex));
    };

    const finish = () => {
      cleanup();
      resolve(choices[selectedIndex]?.value ?? "");
    };

    const cancel = () => {
      cleanup();
      output.write("\n");
      reject(new Error("Setup cancelled"));
    };

    const handleData = (chunk: Buffer | string) => {
      const text = String(chunk);
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === "\u0003") {
          cancel();
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u001b") {
          const sequence = text.slice(index, index + 3);
          if (sequence === "\u001b[A") {
            selectedIndex = wrapChoiceIndex(selectedIndex - 1, choices.length);
            index += 2;
            render();
            continue;
          }
          if (sequence === "\u001b[B") {
            selectedIndex = wrapChoiceIndex(selectedIndex + 1, choices.length);
            index += 2;
            render();
            continue;
          }

          cancel();
          return;
        }

        const numericChoice = Number.parseInt(char, 10);
        if (Number.isInteger(numericChoice) && numericChoice >= 1 && numericChoice <= choices.length) {
          selectedIndex = numericChoice - 1;
          render();
        }
      }
    };

    input.on("data", handleData);
  });
}

function canUseRawMode(input: Readable): input is Readable & {
  isTTY: true;
  isRaw?: boolean;
  setRawMode: (mode: boolean) => void;
  isPaused?: () => boolean;
} {
  return Boolean(
    (input as { isTTY?: boolean }).isTTY &&
      typeof (input as { setRawMode?: unknown }).setRawMode === "function",
  );
}

function askMaskedTerminalInput(
  input: Readable & {
    isRaw?: boolean;
    setRawMode: (mode: boolean) => void;
    isPaused?: () => boolean;
  },
  output: Writable,
  question: string,
): Promise<string> {
  output.write(question);

  const wasRaw = input.isRaw === true;
  const wasPaused = input.isPaused?.() ?? false;
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      input.off("data", handleData);
      input.setRawMode(wasRaw);
      if (wasPaused) {
        input.pause();
      }
    };

    const finish = () => {
      cleanup();
      output.write("\n");
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      output.write("\n");
      reject(new Error("Setup cancelled"));
    };

    const handleData = (chunk: Buffer | string) => {
      const text = String(chunk);
      for (const char of text) {
        if (char === "\u0003") {
          cancel();
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (char < " " || char === "\u001b") {
          continue;
        }

        value += char;
        output.write("*");
      }
    };

    input.on("data", handleData);
  });
}
