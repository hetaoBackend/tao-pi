import { basename } from "node:path";

const SOURCE_ENTRY_PATTERN = /(?:^|[/\\])src[/\\]index\.ts$/;

export function resolveCliCommandName(argv: readonly string[]): string {
  const entry = argv[1];
  if (!entry) {
    return "tao-pi";
  }

  if (SOURCE_ENTRY_PATTERN.test(entry)) {
    return "tsx src/index.ts";
  }

  return basename(entry) || "tao-pi";
}
