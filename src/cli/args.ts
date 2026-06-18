export interface ParsedCliArgs {
  resume: boolean;
  resumeTarget?: string;
  print: boolean;
  debug: boolean;
  help: boolean;
  overrides: CliOverrides;
  firstPrompt: string;
}

export interface CliOverrides {
  provider?: string;
  model?: string;
  baseUrl?: string;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const promptParts: string[] = [];
  let resume = false;
  let resumeTarget = "latest";
  let print = false;
  let debug = false;
  let help = false;
  const overrides: CliOverrides = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }

    if (arg === "-p" || arg === "--print") {
      print = true;
      continue;
    }

    if (arg === "--debug") {
      debug = true;
      continue;
    }

    if (arg === "-c" || arg === "--continue") {
      resume = true;
      resumeTarget = "latest";
      continue;
    }

    if (arg === "-r" || arg === "--resume") {
      resume = true;

      const nextArg = argv[index + 1];
      if (nextArg && !isOptionToken(nextArg)) {
        resumeTarget = nextArg;
        index += 1;
      }

      continue;
    }

    if (arg === "--provider") {
      overrides.provider = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--model") {
      overrides.model = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--base-url") {
      overrides.baseUrl = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    promptParts.push(arg);
  }

  const firstPrompt = promptParts.join(" ").trim();
  if (resume) {
    return { resume: true, resumeTarget, print, debug, help, overrides, firstPrompt };
  }

  return { resume: false, print, debug, help, overrides, firstPrompt };
}

function readOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || isOptionToken(value)) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function isOptionToken(value: string): boolean {
  return value.startsWith("-");
}
