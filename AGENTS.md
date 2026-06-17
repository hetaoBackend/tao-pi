# AGENTS.md

## Project shape

This repo is a TypeScript CLI for running a Pi agent with local file tools,
Firecrawl web tools, SQLite-backed sessions, and a Chinese system prompt.

Keep the source tree organized by runtime responsibility:

- `src/index.ts` is the composition root. It wires configuration, adapters, the agent, and the CLI loop.
- `src/agent/` owns model selection, system prompt text, context transforms, and streaming event rendering.
- `src/cli/` owns argument parsing, terminal UI text, slash commands, and the interactive loop.
- `src/tools/` owns agent tool adapters such as filesystem and Firecrawl tools.
- `src/persistence/` owns session storage and database-specific implementation details.
- `test/` mirrors the source tree. Put tests beside the responsibility they verify.
- `examples/` is for unrelated learning snippets and demos, not application code.

## Commands

- `npm test` runs the Vitest suite.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run dev -- [options] [prompt]` starts the CLI through `tsx src/index.ts`.

Run `npm test` and `npm run typecheck` before claiming changes are complete.

## Architecture rules

- Keep `src/index.ts` thin. It may compose modules, read environment variables, and connect adapters, but it should not accumulate business logic.
- Prefer deep modules: a small interface with useful behavior behind it. Do not split files only to make them smaller.
- Add new CLI behavior under `src/cli/`; add new agent runtime behavior under `src/agent/`; add new external integrations under `src/tools/`.
- Keep adapter-specific details local. Firecrawl request shapes stay in `src/tools/firecrawl-tools.ts`; `sql.js` details stay in `src/persistence/session-store.ts`.
- Inject external dependencies in adapters when practical, as `createFirecrawlTools` does with `fetch`, so tests can run without network access.
- Keep tests at the module interface. Avoid testing private implementation details unless the module interface is the wrong shape.
- Do not commit `.env`, `.pi-sessions.sqlite`, `node_modules/`, or generated runtime data.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with optional root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
