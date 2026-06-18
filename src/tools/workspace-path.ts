import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isMissingFileError } from "../utils/errors.js";

export function resolveLexicalWorkspacePath(root: string, requestedPath: string): string {
  if (!requestedPath.trim()) {
    throw new Error("Path is required");
  }

  const target = resolve(root, requestedPath);
  if (!isPathInside(root, target)) {
    throw new Error("Path must stay inside the workspace");
  }

  return target;
}

export async function resolveExistingWorkspacePath(root: string, requestedPath: string): Promise<string> {
  const target = resolveLexicalWorkspacePath(root, requestedPath);
  await assertRealPathInsideWorkspace(root, target);
  return target;
}

export async function resolveWritableWorkspacePath(root: string, requestedPath: string): Promise<string> {
  const target = resolveLexicalWorkspacePath(root, requestedPath);
  await assertWritablePathInsideWorkspace(root, target);
  return target;
}

export function toDisplayPath(root: string, target: string): string {
  return relative(root, target) || ".";
}

export function splitDisplayPath(path: string): string[] {
  return path.split(sep);
}

async function assertRealPathInsideWorkspace(root: string, target: string): Promise<void> {
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!isPathInside(realRoot, realTarget)) {
      throw new Error("Path must stay inside the workspace");
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Path not found: ${toDisplayPath(root, target)}`);
    }

    throw error;
  }
}

async function assertWritablePathInsideWorkspace(root: string, target: string): Promise<void> {
  const realRoot = await realpath(root);
  let nearestExistingPath = target;

  while (true) {
    try {
      const realTarget = await realpath(nearestExistingPath);
      if (!isPathInside(realRoot, realTarget)) {
        throw new Error("Path must stay inside the workspace");
      }
      return;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      const parent = dirname(nearestExistingPath);
      if (parent === nearestExistingPath) {
        throw new Error(`Path not found: ${toDisplayPath(root, target)}`);
      }
      nearestExistingPath = parent;
    }
  }
}

function isPathInside(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
