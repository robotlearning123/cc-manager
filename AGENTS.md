# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the TypeScript application code. Core runtime modules include `scheduler.ts`, `agent-runner.ts`, `store.ts`, `server.ts`, and the CLI entrypoints `index.ts` and `cli.ts`. Tests live in `src/__tests__/` and follow the source module names, for example `src/__tests__/scheduler.test.ts`. The web dashboard is a single static file at `src/web/index.html`; built output goes to `dist/`. Longer-form design and API docs live in `docs/`, and `ARCHITECTURE.md` explains the dependency flow between modules. Runtime artifacts such as `.cc-manager.db` and `.worktrees/` should not be treated as source.

## Build, Test, and Development Commands
Use Node.js 20+.

- `npm install`: install dependencies and enable the repo’s git hooks via `prepare`.
- `npm run dev`: run the app from source with `tsx`.
- `npm run build`: compile TypeScript to `dist/` and copy the web UI asset.
- `npm test`: run the Node test runner against `src/__tests__/*.test.ts`.
- `npx tsc --noEmit`: run the strict type check used by CI and the pre-commit hook.
- `npm run start -- --repo /path/to/repo`: run the built server locally.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF, and 2-space indentation. Keep source in TypeScript under `src/`; do not add plain `.js` source files there. Use Node ESM import paths with explicit `.js` extensions, for example `import { Store } from './store.js';`. Match existing file naming: kebab-case module files and `*.test.ts` for tests. Prefer explicit types and keep `strict`-mode compatibility. For the dashboard, keep `src/web/index.html` framework-free and self-contained.

## Testing Guidelines
Add or update targeted tests in `src/__tests__/` whenever behavior changes. Keep test filenames aligned with the module under test and cover both success and failure paths for scheduler, store, server, or worktree behavior. Before opening a PR, run `npx tsc --noEmit`, `npm test`, and `npm run build` if your change affects runtime packaging.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commits, usually with a scope: `feat(scheduler): ...`, `fix(pipeline): ...`, `docs: ...`. Keep commits focused and descriptive. PRs should answer: what changed, why it changed, and how to test it. Follow `.github/pull_request_template.md`: confirm tests pass, types compile, `console.log` calls are removed, and docs are updated when needed.
