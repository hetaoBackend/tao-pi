import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("project name", () => {
  it("uses tao-pi as the package name", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      name?: string;
    };

    expect(packageJson.name).toBe("tao-pi");
  });
});
