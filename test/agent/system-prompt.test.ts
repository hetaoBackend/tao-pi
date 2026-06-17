import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatPromptDate } from "../../src/agent/system-prompt.js";

describe("system prompt", () => {
  it("formats the current date in the configured timezone", () => {
    expect(formatPromptDate(new Date("2026-06-16T18:30:00.000Z"), "Asia/Shanghai")).toBe("2026-06-17");
  });

  it("appends the current date as the final prompt section", () => {
    const prompt = buildSystemPrompt({
      now: new Date("2026-06-17T07:00:00.000Z"),
      timeZone: "Asia/Shanghai",
    });

    expect(prompt).toContain("## 工具使用");
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("web_fetch");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("write_file");
    expect(prompt).toContain("## 动态上下文");
    expect(prompt.trimEnd().endsWith("当前日期：2026-06-17（Asia/Shanghai）。")).toBe(true);
    expect(prompt.indexOf("## 工具使用")).toBeLessThan(prompt.indexOf("## 动态上下文"));
  });
});
