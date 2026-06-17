import { describe, expect, it } from "vitest";
import { resolveConfiguredModel } from "../../src/agent/model-config.js";

describe("resolveConfiguredModel", () => {
  it("returns a registered model when no overrides are provided", () => {
    const model = resolveConfiguredModel({
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
    });

    expect(model.id).toBe("deepseek-v4-flash");
    expect(model.provider).toBe("deepseek");
    expect(model.baseUrl).toBe("https://api.deepseek.com");
  });

  it("overrides the model baseUrl", () => {
    const model = resolveConfiguredModel({
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
      baseUrl: "http://localhost:8000/v1",
    });

    expect(model.baseUrl).toBe("http://localhost:8000/v1");
  });

  it("creates a custom model id from a registered template model", () => {
    const model = resolveConfiguredModel({
      provider: "openai",
      modelId: "local-qwen",
      modelTemplateId: "gpt-4.1-mini",
      baseUrl: "http://localhost:11434/v1",
    });

    expect(model.id).toBe("local-qwen");
    expect(model.name).toBe("local-qwen");
    expect(model.api).toBe("openai-responses");
    expect(model.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("merges OpenAI-compatible compat overrides", () => {
    const model = resolveConfiguredModel({
      provider: "deepseek",
      modelId: "ark-code-latest",
      modelTemplateId: "deepseek-v4-flash",
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
      compat: {
        supportsDeveloperRole: false,
      },
    });

    expect(model.compat).toMatchObject({
      requiresReasoningContentOnAssistantMessages: true,
      supportsDeveloperRole: false,
    });
  });
});
