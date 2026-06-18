import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  bin?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}

describe("CLI executable package metadata", () => {
  it("declares the compiled tao-pi executable and Bun build command", () => {
    const packageJson = readPackageJson();

    expect(packageJson.bin?.["tao-pi"]).toBe("./dist/tao-pi");
    expect(packageJson.scripts?.["build:cli"]).toBe(
      "bun build --compile --target=bun --outfile=dist/tao-pi src/index.ts",
    );
    expect(packageJson.devDependencies?.["react-devtools-core"]).toBeDefined();
  });
});
