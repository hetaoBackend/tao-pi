import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/args.js";

describe("parseCliArgs", () => {
  it("starts a new session by default and keeps the remaining text as the first prompt", () => {
    expect(parseCliArgs(["hello", "there"])).toEqual({
      resume: false,
      print: false,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "hello there",
    });
  });

  it("resumes the latest session when -r has no explicit id", () => {
    expect(parseCliArgs(["-r"])).toEqual({
      resume: true,
      resumeTarget: "latest",
      print: false,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "",
    });
  });

  it("resumes a specific session id and keeps the remaining text as the first prompt", () => {
    expect(parseCliArgs(["--resume", "session-123", "continue", "please"])).toEqual({
      resume: true,
      resumeTarget: "session-123",
      print: false,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "continue please",
    });
  });

  it("continues the latest session with the Claude-style -c alias", () => {
    expect(parseCliArgs(["-c", "keep", "going"])).toEqual({
      resume: true,
      resumeTarget: "latest",
      print: false,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "keep going",
    });
  });

  it("does not consume the next option as a resume target", () => {
    expect(parseCliArgs(["-r", "-p", "hello"])).toEqual({
      resume: true,
      resumeTarget: "latest",
      print: true,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "hello",
    });
  });

  it("supports print mode and common model overrides", () => {
    expect(
      parseCliArgs([
        "-p",
        "--debug",
        "--provider",
        "deepseek",
        "--model",
        "ark-code-latest",
        "--base-url",
        "https://example.com/v1",
        "say",
        "hi",
      ]),
    ).toEqual({
      resume: false,
      print: true,
      debug: true,
      help: false,
      overrides: {
        provider: "deepseek",
        model: "ark-code-latest",
        baseUrl: "https://example.com/v1",
      },
      firstPrompt: "say hi",
    });
  });

  it("parses help without requiring any other configuration", () => {
    expect(parseCliArgs(["--help"])).toEqual({
      resume: false,
      print: false,
      debug: false,
      help: true,
      overrides: {},
      firstPrompt: "",
    });
  });

  it("parses setup as a top-level command", () => {
    expect(parseCliArgs(["setup"])).toEqual({
      command: "setup",
      resume: false,
      print: false,
      debug: false,
      help: false,
      overrides: {},
      firstPrompt: "",
    });
  });
});
