<p align="center">
  <img src="assets/taopi-header-cozy-terminal.png" alt="TaoPi mascot PiPi in a futuristic terminal workspace">
</p>

# TaoPi

Turn any repo into an agent cockpit.

TaoPi is a TypeScript CLI that lets a Pi agent work where your code already
lives: in the terminal, inside the current workspace, with tools for files,
commands, web context, memory, skills, and resumable sessions. It is small
enough to hack on, but complete enough to feel like a real local workstation.

[Chinese version](README_zh.md)

## The Loop

Open a repo. Start TaoPi. Ask for a change.

The agent reads the project context, searches the workspace, edits files, runs
commands, pulls web context when needed, and saves the session so the next run
can pick up the thread.

```text
repo -> terminal -> agent tools -> workspace changes -> resumable session
```

## Why TaoPi

- **A repo becomes the runtime**: TaoPi starts from the current workspace and
  gives the agent tools for reading, searching, editing, writing, and running
  commands.
- **Terminal-native by default**: use the interactive TUI when you are in a real
  terminal, or fall back to plain streaming output for scripts and pipes.
- **Sessions that survive the tab close**: conversations are stored in SQLite,
  so you can continue the latest session or resume a specific one.
- **Context without ceremony**: `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` are
  picked up automatically when present.
- **Web context when you need it**: Firecrawl can add `web_search` and
  `web_fetch`, while local work stays useful without network access.
- **Made to be bent**: todos, file-backed memory, and local skills are plugins,
  not a sealed product surface.
- **One setup, many workspaces**: `bun run dev -- setup` writes reusable defaults
  to `~/.tao/config.toml`.

## Mascot

TaoPi's mascot is **PiPi**, a cheerful terminal navigator for local agent work.
PiPi wears a pi-shaped hairpin, peach-and-teal techwear, and carries small
visual hints of the project: terminal panes, file cards, database tiles,
checklists, and web-search light trails.

The mascot direction is meant to make TaoPi easier to recognize and share
without turning the CLI itself into a heavy branded product.

<p align="center">
  <img src="assets/taopi-header-observatory.png" alt="PiPi navigating terminal panes under a moonlit observatory" width="49%">
  <img src="assets/taopi-header-maker-desk.png" alt="PiPi holding a glowing terminal cube in a bright maker workspace" width="49%">
</p>

## Quick Start

Requirements:

- Bun
- A Node-compatible shell
- An API key for your model provider

Install dependencies:

```bash
bun install
```

Configure global defaults:

```bash
bun run dev -- setup
```

Or use environment variables for a quick local run:

```bash
cp .env.example .env
# edit .env with your provider, model, and API key
```

Start an interactive session:

```bash
bun run dev --
```

Ask a first question immediately:

```bash
bun run dev -- "Explain this project structure"
```

Run once and print the answer:

```bash
bun run dev -- --print "Summarize what src/index.ts does"
```

Continue the latest session:

```bash
bun run dev -- --continue
```

Resume a specific session:

```bash
bun run dev -- --resume <session-id>
```

## Configuration

TaoPi reads configuration in this order:

1. CLI flags
2. Environment variables
3. `~/.tao/config.toml`
4. Built-in defaults

Common options:

```bash
PI_PROVIDER=openai
PI_MODEL=gpt-4.1-mini
PI_API_KEY=your_api_key
PI_BASE_URL=https://your-openai-compatible-endpoint.example/v1
PI_TIMEZONE=Asia/Shanghai
PI_SESSION_DB=.pi-sessions.sqlite
PI_PLUGINS=todo,memory,skills
```

Firecrawl is optional:

```bash
FIRECRAWL_API_KEY=fc-your_firecrawl_api_key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
```

Useful CLI overrides:

```bash
bun run dev -- --provider deepseek --model deepseek-v4-flash
bun run dev -- --base-url http://localhost:11434/v1 --model local-model
bun run dev -- --debug
```

## Interactive Commands

Inside an interactive session:

- `/help` shows available commands.
- `/session` shows the current session, model, tools, plugins, and context.
- `/clear` clears the terminal.
- `/exit` exits the session.

Plugins may add more slash commands. Discovered skills, for example, are exposed
as slash commands by the skills plugin.

## Project Layout

```text
src/
├── index.ts              # composition root
├── agent/                # model config, prompts, project context, streaming
├── cli/                  # args, terminal UI, slash commands, TUI loop
├── persistence/          # SQLite-backed session storage
├── plugins/              # optional runtime capabilities
├── tools/                # file, command, todo, and Firecrawl tool adapters
└── utils/                # shared utilities
```

Tests mirror the source tree under `test/`.

## Development

Run the test suite:

```bash
bun run test
```

Run TypeScript checks:

```bash
bun run typecheck
```

Start the CLI through `tsx`:

```bash
bun run dev -- [options] [prompt]
```

Build a standalone CLI executable with Bun:

```bash
bun run build:cli
./dist/tao-pi --help
```

The generated `dist/tao-pi` binary is built for the current OS and CPU
architecture.

Keep runtime data out of commits. Do not commit `.env`, `.pi-sessions.sqlite`,
`node_modules/`, or generated local memory/session files.

## Contributing

Issues and project notes live in local markdown files under `.scratch/` when
that workflow is used. Before opening a change, please run:

```bash
bun run test
bun run typecheck
```

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT. See [LICENSE](LICENSE).
