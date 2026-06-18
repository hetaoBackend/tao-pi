import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { throwIfAborted } from "../utils/errors.js";
import type { AgentPlugin, AgentSlashCommand } from "./plugin-registry.js";

const DEFAULT_SKILL_DESCRIPTION = "No description provided.";

const skillReadParameters = Type.Object({
  name: Type.String({ description: "Skill name to read." }),
});

export interface CreateSkillsPluginOptions {
  skillDirs: string[];
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
}

interface SkillReadDetails {
  skill: DiscoveredSkill;
}

export function createSkillsPlugin(options: CreateSkillsPluginOptions): AgentPlugin {
  const skills = discoverSkills(options.skillDirs);

  return {
    id: "skills",
    tools: createSkillTools(skills),
    slashCommands: createSkillSlashCommands(skills),
    systemPromptSections: skills.length ? [formatSkillsPromptSection(skills)] : [],
  };
}

export function discoverSkills(skillDirs: readonly string[]): DiscoveredSkill[] {
  const skillsByName = new Map<string, DiscoveredSkill>();

  for (const skillDir of skillDirs) {
    if (!existsSync(skillDir)) {
      continue;
    }

    for (const entry of readdirSync(skillDir).sort()) {
      const candidateDir = join(skillDir, entry);
      if (!statSync(candidateDir).isDirectory()) {
        continue;
      }

      const skillPath = join(candidateDir, "SKILL.md");
      if (!existsSync(skillPath)) {
        continue;
      }

      const content = readFileSync(skillPath, "utf8");
      const frontmatter = parseFrontmatter(content);
      const skill = {
        name: frontmatter.name ?? entry,
        description: frontmatter.description ?? DEFAULT_SKILL_DESCRIPTION,
        path: skillPath,
      };
      skillsByName.delete(skill.name);
      skillsByName.set(skill.name, skill);
    }
  }

  return [...skillsByName.values()];
}

function formatSkillsPromptSection(skills: DiscoveredSkill[]): string {
  return [
    "Available skills:",
    ...skills.map((skill) => `- ${skill.name}: ${skill.description} (${skill.path})`),
    "Use a skill when the user's request clearly matches its description. Use skill_read to read the full SKILL.md before following it.",
  ].join("\n");
}

function createSkillTools(skills: DiscoveredSkill[]): AgentTool[] {
  const readTool: AgentTool<typeof skillReadParameters, SkillReadDetails> = {
    name: "skill_read",
    label: "Read Skill",
    description: "Read the full SKILL.md for a discovered local skill by name.",
    parameters: skillReadParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const skill = skills.find((candidate) => candidate.name === params.name);
      if (!skill) {
        throw new Error(`Skill not found: ${params.name}`);
      }

      return {
        content: [{ type: "text", text: readFileSync(skill.path, "utf8") }],
        details: { skill },
      };
    },
  };

  return [readTool];
}

function createSkillSlashCommands(skills: DiscoveredSkill[]): AgentSlashCommand[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    kind: "skill" as const,
    toPrompt: ({ args }) =>
      [
        `Use the "${skill.name}" skill for this request.`,
        `First call skill_read with name "${skill.name}" and follow the loaded SKILL.md instructions before answering.`,
        args ? `User request: ${args}` : "User request: Follow the skill instructions for this turn.",
      ].join("\n"),
  }));
}

function parseFrontmatter(content: string): Partial<Pick<DiscoveredSkill, "name" | "description">> {
  if (!content.startsWith("---\n")) {
    return {};
  }

  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) {
    return {};
  }

  const frontmatter = content.slice(4, endIndex).split(/\r?\n/);
  const result: Partial<Pick<DiscoveredSkill, "name" | "description">> = {};
  for (const line of frontmatter) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if ((key === "name" || key === "description") && value) {
      result[key] = value;
    }
  }

  return result;
}
