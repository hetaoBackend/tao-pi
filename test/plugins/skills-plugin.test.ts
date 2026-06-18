import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSkillsPlugin, discoverSkills } from "../../src/plugins/skills-plugin.js";

let skillsRoot: string;

beforeEach(async () => {
  skillsRoot = await mkdtemp(join(tmpdir(), "tao-pi-skills-plugin-"));
});

afterEach(async () => {
  await rm(skillsRoot, { recursive: true, force: true });
});

describe("discoverSkills", () => {
  it("discovers skills from SKILL.md frontmatter", () => {
    writeSkill("research", [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
      "",
      "# Research",
    ].join("\n"));
    writeSkill("review", [
      "---",
      "name: review",
      "description: Review changes for bugs.",
      "---",
      "",
      "# Review",
    ].join("\n"));

    expect(discoverSkills([skillsRoot])).toEqual([
      {
        name: "research",
        description: "Research a topic and synthesize sources.",
        path: join(skillsRoot, "research", "SKILL.md"),
      },
      {
        name: "review",
        description: "Review changes for bugs.",
        path: join(skillsRoot, "review", "SKILL.md"),
      },
    ]);
  });

  it("uses directory name when frontmatter does not include a name", () => {
    writeSkill("plain", "# Plain\n\nNo frontmatter.");

    expect(discoverSkills([skillsRoot])).toEqual([
      {
        name: "plain",
        description: "No description provided.",
        path: join(skillsRoot, "plain", "SKILL.md"),
      },
    ]);
  });

  it("ignores missing skill roots", () => {
    expect(discoverSkills([join(skillsRoot, "missing")])).toEqual([]);
  });

  it("lets later skill directories override earlier skills with the same name", async () => {
    const overrideRoot = await mkdtemp(join(tmpdir(), "tao-pi-skills-plugin-override-"));
    writeSkill("review", [
      "---",
      "name: review",
      "description: Review changes from the base directory.",
      "---",
    ].join("\n"));
    const overrideSkillDir = join(overrideRoot, "review");
    mkdirSync(overrideSkillDir, { recursive: true });
    writeFileSync(
      join(overrideSkillDir, "SKILL.md"),
      [
        "---",
        "name: review",
        "description: Review changes from the override directory.",
        "---",
      ].join("\n"),
      "utf8",
    );

    try {
      expect(discoverSkills([skillsRoot, overrideRoot])).toEqual([
        {
          name: "review",
          description: "Review changes from the override directory.",
          path: join(overrideRoot, "review", "SKILL.md"),
        },
      ]);
    } finally {
      await rm(overrideRoot, { recursive: true, force: true });
    }
  });
});

describe("createSkillsPlugin", () => {
  it("packages discovered skills as prompt guidance", () => {
    writeSkill("research", [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
    ].join("\n"));

    const plugin = createSkillsPlugin({ skillDirs: [skillsRoot] });

    expect(plugin.id).toBe("skills");
    expect(plugin.tools?.map((tool) => tool.name)).toEqual(["skill_read"]);
    expect(plugin.slashCommands?.map((command) => command.name)).toEqual(["research"]);
    expect(plugin.slashCommands?.[0]?.description).toBe("Research a topic and synthesize sources.");
    expect(plugin.slashCommands?.[0]?.kind).toBe("skill");
    expect(plugin.systemPromptSections?.join("\n")).toContain("Available skills:");
    expect(plugin.systemPromptSections?.join("\n")).toContain("- research: Research a topic and synthesize sources.");
    expect(plugin.systemPromptSections?.join("\n")).toContain(join(skillsRoot, "research", "SKILL.md"));
    expect(plugin.systemPromptSections?.join("\n")).toContain("Use skill_read");
  });

  it("turns slash skill invocations into skill-guided prompts", () => {
    writeSkill("research", [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
    ].join("\n"));

    const [slashCommand] = createSkillsPlugin({ skillDirs: [skillsRoot] }).slashCommands ?? [];

    expect(slashCommand?.toPrompt({ command: "research", args: "compare local options", raw: "/research compare local options" }))
      .toBe(
        [
          'Use the "research" skill for this request.',
          "First call skill_read with name \"research\" and follow the loaded SKILL.md instructions before answering.",
          "User request: compare local options",
        ].join("\n"),
      );
  });

  it("exposes every discovered skill as a same-name slash command", () => {
    writeSkill("research", [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
    ].join("\n"));
    writeSkill("tdd", [
      "---",
      "name: superpowers:test-driven-development",
      "description: Use test-driven development.",
      "---",
    ].join("\n"));

    const commands = createSkillsPlugin({ skillDirs: [skillsRoot] }).slashCommands ?? [];
    const tddCommand = commands.find((command) => command.name === "superpowers:test-driven-development");

    expect(commands.map((command) => command.name)).toEqual(["research", "superpowers:test-driven-development"]);
    expect(commands.every((command) => command.kind === "skill")).toBe(true);
    expect(
      tddCommand?.toPrompt({
        command: "superpowers:test-driven-development",
        args: "add coverage first",
        raw: "/superpowers:test-driven-development add coverage first",
      }),
    ).toBe(
      [
        'Use the "superpowers:test-driven-development" skill for this request.',
        'First call skill_read with name "superpowers:test-driven-development" and follow the loaded SKILL.md instructions before answering.',
        "User request: add coverage first",
      ].join("\n"),
    );
  });

  it("does not add prompt guidance when no skills are discovered", () => {
    const plugin = createSkillsPlugin({ skillDirs: [skillsRoot] });

    expect(plugin.id).toBe("skills");
    expect(plugin.systemPromptSections).toEqual([]);
  });

  it("does not expose a skill-listing tool because discovered skills are prompt context", () => {
    writeSkill("research", [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
      "",
      "# Research",
    ].join("\n"));

    const tools = createSkillsPlugin({ skillDirs: [skillsRoot] }).tools ?? [];

    expect(tools.map((tool) => tool.name)).not.toContain("skill_list");
  });

  it("reads a skill body through skill_read", async () => {
    const content = [
      "---",
      "name: research",
      "description: Research a topic and synthesize sources.",
      "---",
      "",
      "# Research",
      "",
      "Read sources before summarizing.",
    ].join("\n");
    writeSkill("research", content);
    const readTool = createSkillsPlugin({ skillDirs: [skillsRoot] }).tools?.find((tool) => tool.name === "skill_read");

    const result = await readTool?.execute("call-1", { name: "research" });

    expect(result?.content[0]).toEqual({ type: "text", text: content });
    expect(result?.details).toEqual({
      skill: {
        name: "research",
        description: "Research a topic and synthesize sources.",
        path: join(skillsRoot, "research", "SKILL.md"),
      },
    });
  });

  it("rejects unknown skills", async () => {
    const readTool = createSkillsPlugin({ skillDirs: [skillsRoot] }).tools?.find((tool) => tool.name === "skill_read");

    await expect(readTool?.execute("call-1", { name: "missing" })).rejects.toThrow("Skill not found: missing");
  });
});

function writeSkill(skillName: string, content: string): void {
  const skillDir = join(skillsRoot, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");
}
