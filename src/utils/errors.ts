export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Tool execution aborted");
  }
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
