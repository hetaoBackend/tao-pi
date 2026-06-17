export interface RuntimeModeOptions {
  print: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}

export function shouldUseTui(options: RuntimeModeOptions): boolean {
  return !options.print && options.stdinIsTTY && options.stdoutIsTTY;
}
