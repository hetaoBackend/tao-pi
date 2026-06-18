import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConfiguredPlugins } from "../../src/plugins/default-plugins.js";

describe("createConfiguredPlugins", () => {
  it("loads default non-core plugins when no plugin list is configured", () => {
    expect(createConfiguredPlugins({ workspaceRoot: "/workspace" }).map((plugin) => plugin.id)).toEqual([
      "todo",
      "memory",
      "skills",
    ]);
  });

  it("can disable all non-core plugins", () => {
    expect(createConfiguredPlugins({ workspaceRoot: "/workspace", configuredPluginIds: "none" })).toEqual([]);
  });

  it("loads configured plugins by id", () => {
    expect(
      createConfiguredPlugins({ workspaceRoot: "/workspace", configuredPluginIds: " memory, todo " }).map(
        (plugin) => plugin.id,
      ),
    ).toEqual(["memory", "todo"]);
  });

  it("passes the configured memory directory to the memory plugin", () => {
    const [plugin] = createConfiguredPlugins({
      workspaceRoot: "/workspace",
      configuredPluginIds: "memory",
      memoryDir: "/custom-memory",
    });

    expect(plugin.systemPromptSections?.join("\n")).toContain("/custom-memory");
  });

  it("passes configured skill directories to the skills plugin", () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "tao-pi-default-skills-"));
    mkdirSync(join(skillsRoot, "research"), { recursive: true });
    writeFileSync(
      join(skillsRoot, "research", "SKILL.md"),
      "---\nname: research\ndescription: Research a topic.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot: "/workspace",
      configuredPluginIds: "skills",
      skillDirs: [skillsRoot],
    })[0];

    try {
      expect(plugin.id).toBe("skills");
      expect(plugin.systemPromptSections?.join("\n")).toContain("- research: Research a topic.");
    } finally {
      rmSync(skillsRoot, { recursive: true, force: true });
    }
  });

  it("discovers global Tao skills by default", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-home-skills-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-workspace-skills-"));
    mkdirSync(join(homeDir, ".tao", "skills", "research"), { recursive: true });
    writeFileSync(
      join(homeDir, ".tao", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research a topic.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
      homeDir,
    })[0];

    try {
      expect(plugin.systemPromptSections?.join("\n")).toContain("- research: Research a topic.");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("discovers workspace Tao skills by default", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-workspace-skills-"));
    mkdirSync(join(workspaceRoot, ".tao", "skills", "research"), { recursive: true });
    writeFileSync(
      join(workspaceRoot, ".tao", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research a topic.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
    })[0];

    try {
      expect(plugin.systemPromptSections?.join("\n")).toContain("- research: Research a topic.");
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("does not discover Claude-style project skills by default", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-home-skills-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-claude-skills-"));
    mkdirSync(join(workspaceRoot, ".claude", "skills", "research"), { recursive: true });
    writeFileSync(
      join(workspaceRoot, ".claude", "skills", "research", "SKILL.md"),
      "---\nname: research\ndescription: Research a topic.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
      homeDir,
    })[0];

    try {
      expect(plugin.systemPromptSections).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("lets workspace Tao skills override same-name global Tao skills", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-home-skill-override-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-skill-override-"));
    mkdirSync(join(homeDir, ".tao", "skills", "review"), { recursive: true });
    mkdirSync(join(workspaceRoot, ".tao", "skills", "review"), { recursive: true });
    writeFileSync(
      join(homeDir, ".tao", "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review from global Tao skills.\n---\n",
      "utf8",
    );
    writeFileSync(
      join(workspaceRoot, ".tao", "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review from workspace Tao skills.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
      homeDir,
    })[0];

    try {
      expect(plugin.systemPromptSections?.join("\n")).toContain("- review: Review from workspace Tao skills.");
      expect(plugin.systemPromptSections?.join("\n")).not.toContain("Review from global Tao skills.");
      expect(plugin.slashCommands?.map((command) => command.name)).toEqual(["review"]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("does not discover main-repository Claude-style skills when running in a git worktree", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-home-worktree-skills-"));
    const mainRepositoryRoot = mkdtempSync(join(tmpdir(), "tao-pi-main-repo-skills-"));
    const worktreeRoot = mkdtempSync(join(tmpdir(), "tao-pi-worktree-skills-"));
    const worktreeGitDir = join(mainRepositoryRoot, ".git", "worktrees", "feature");
    mkdirSync(join(mainRepositoryRoot, ".claude", "skills", "review"), { recursive: true });
    mkdirSync(worktreeGitDir, { recursive: true });
    writeFileSync(
      join(mainRepositoryRoot, ".claude", "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review local changes.\n---\n",
      "utf8",
    );
    writeFileSync(join(worktreeRoot, ".git"), `gitdir: ${worktreeGitDir}\n`, "utf8");

    const plugin = createConfiguredPlugins({
      workspaceRoot: worktreeRoot,
      configuredPluginIds: "skills",
      homeDir,
    })[0];

    try {
      expect(plugin.systemPromptSections).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(mainRepositoryRoot, { recursive: true, force: true });
      rmSync(worktreeRoot, { recursive: true, force: true });
    }
  });

  it("resolves configured relative skill directories from the workspace root", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-relative-skills-"));
    mkdirSync(join(workspaceRoot, ".agent-skills", "review"), { recursive: true });
    writeFileSync(
      join(workspaceRoot, ".agent-skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review local changes.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
      skillDirs: [".agent-skills"],
    })[0];

    try {
      expect(plugin.systemPromptSections?.join("\n")).toContain("- review: Review local changes.");
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("resolves configured tilde skill directories from the home directory", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tao-pi-tilde-skills-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "tao-pi-tilde-workspace-"));
    mkdirSync(join(homeDir, ".tao", "skills", "review"), { recursive: true });
    writeFileSync(
      join(homeDir, ".tao", "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review local changes.\n---\n",
      "utf8",
    );

    const plugin = createConfiguredPlugins({
      workspaceRoot,
      configuredPluginIds: "skills",
      skillDirs: ["~/.tao/skills"],
      homeDir,
    })[0];

    try {
      expect(plugin.systemPromptSections?.join("\n")).toContain("- review: Review local changes.");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects unknown plugins with available ids", () => {
    expect(() =>
      createConfiguredPlugins({ workspaceRoot: "/workspace", configuredPluginIds: "unknown" }),
    ).toThrow("Unknown plugin: unknown. Available plugins: todo, memory, skills");
  });
});
