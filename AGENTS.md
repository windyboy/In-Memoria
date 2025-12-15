# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript MCP server, CLI entry (`index.ts`), engines, storage, watchers, services, and utilities; `src/__tests__/` contains unit specs and setup.
- `rust-core/` contains the napi-rs bridge and high-performance parsers/embedding logic; build artifacts are generated into `dist/`.
- `tests/` houses integration runners and scripts that exercise the built server; `docs/`, `assets/`, and `scripts/` store supporting material and build helpers.

## Build, Test, and Development Commands
- `npm install` to fetch dependencies (Node 18+ required); `npm run build:rust` builds the Rust core; `npm run build` runs TypeScript compile, Rust build, asset copy, and permission fix into `dist/`.
- `npm run dev` launches `tsx watch` on `src/index.ts` for quick iteration; `npm start` runs the built server (`dist/index.js server`).
- Testing shortcuts: `npm test` or `npm run test:unit` for Vitest suites; `npm run test:coverage` reports V8 coverage; `npm run test:integration` builds then runs integration flows from `tests/`.
- `npm run typecheck` performs strict TS checks without emitting; use `npm run build:all-platforms` only when you need multi-platform binaries.

## Coding Style & Naming Conventions
- TypeScript-first, strict mode on; prefer explicit types, async/await, and clear error handling over `any` or unchecked `throw`.
- File names use kebab-case; symbols use `camelCase` for functions/variables and `PascalCase` for classes/types. Keep imports path-safe via `PathValidator` when handling user input.
- Follow existing formatting: double quotes, semicolons, and 4-space indents; keep modules small and compose via dependency injection (see `src/di-container.ts`).

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`) with Node environment, globals enabled, and coverage thresholds at ~60% for lines/branches/functions/statements.
- Unit tests live beside code under `src/**/*.{test,spec}.ts`; integration flows reside in `tests/`. Use `setup.ts` in `src/__tests__/` for shared fixtures/mocks.
- Prefer deterministic tests; integration suites may require SQLite access and optional vector backends (Qdrant/SurrealDB) configured via env vars before running.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative summaries (e.g., `Add vector store integration`, `Fix DI import order`). Keep them focused on one change set.
- Pull requests should describe the change, note relevant env/config updates (e.g., `IN_MEMORIA_VECTOR_BACKEND`, `QDRANT_URL`, `SURREAL_SYNC_DATA`), and include before/after notes or logs when touching runtime behavior.
- Always run `npm test` (and `npm run test:integration` if affected) before submitting; update docs in `docs/` or `README.md` when changing CLI flags, storage defaults, or server behaviors.
