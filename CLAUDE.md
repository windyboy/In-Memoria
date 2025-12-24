# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

In Memoria is an MCP (Model Context Protocol) server that provides persistent intelligence for AI coding assistants. It learns from codebases, extracts patterns, and provides semantic search, smart file routing, and architectural insights across sessions.

**Tech Stack:**
- **Rust** (via napi-rs): High-performance AST parsing, semantic analysis, pattern learning
- **TypeScript/Node.js**: MCP server, CLI, service orchestration
- **SQLite**: Local-first storage with built-in vector index for semantic search
- **Tree-sitter**: Multi-language AST parsing (12 languages)
- **@xenova/transformers**: Embeddings for semantic search (default: `Xenova/all-MiniLM-L6-v2`)

## Key Commands

### Development
```bash
# Install dependencies
bun install

# Build everything (includes architectural verification)
bun run build

# Build TypeScript only (faster for TS-only changes)
bun run build:ts

# Build Rust only
bun run build:rust

# Development mode (watch + reload)
bun run dev

# Type checking
bun run typecheck
```

### Testing
```bash
# Run unit tests
bun test
# or
bun run test:unit

# Run tests in watch mode
bun run test:watch

# Run integration tests (requires build first)
bun run test:integration

# Run all tests
bun run test:all

# Test Rust code
cd rust-core && cargo test

# Check Rust code quality
cd rust-core && cargo clippy
```

### Architecture Verification
```bash
# Verify architectural constraints (runs automatically on build)
bun run verify-architecture

# Pre-commit checks (architecture + typecheck + unit tests)
bun run pre-commit
```

### CLI Usage
```bash
# Learn from a codebase
bunx in-memoria learn ./path/to/project [--force]

# Start MCP server
bunx in-memoria server

# Analyze code
bunx in-memoria analyze ./path/to/file-or-dir

# Check status
bunx in-memoria status

# Rebuild vector index
bunx in-memoria rebuild-index

# Debug with MCP inspector
bun run debug
```

## Architecture

### Three-Layer Architecture with Dependency Injection

In Memoria follows a **strict three-layer architecture** enforced by build-time verification:

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                           │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   CLI Commands  │           │   MCP Server & Tools     │  │
│  │  (Pure Adapters)│           │    (Pure Adapters)       │  │
│  │   src/cli/      │           │      src/mcp/            │  │
│  └─────────────────┘           └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │
│  │ AnalysisService │ │ LearningService │ │ SearchService │ │
│  │   (Read Only)   │ │  (Write Only)   │ │  (Read Only)  │ │
│  └─────────────────┘ └─────────────────┘ └───────────────┘ │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │DiagnosticService│           │     DI Container        │  │
│  │   (Read Only)   │           │   (Orchestration)        │  │
│  └─────────────────┘           └─────────────────────────┘  │
│                    src/core/                                │
├─────────────────────────────────────────────────────────────┤
│                    Storage Layer                            │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   SQLite DB     │           │   SQLite Vector Index   │  │
│  │ (4 tables only) │           │   (semantic index)      │  │
│  │  src/storage/   │           │   src/storage/          │  │
│  └─────────────────┘           └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Rust Core (napi)   │
                    │  • AST Parser        │
                    │  • Pattern Learner   │
                    │  • Semantic Engine   │
                    │  • Blueprint System  │
                    │    rust-core/src/    │
                    └─────────────────────┘
```

### Architectural Constraints (Enforced by Build)

**CRITICAL**: These constraints are **automatically verified** during `bun run build`. Violations will fail the build.

1. **Layer Separation**: CLI layer (`src/cli/`) CANNOT import from core layer (`src/core/`) except:
   - `src/core/bootstrap.ts` (entry point for DI container)
   - `src/core/errors.ts` (shared error types)

2. **Service Isolation**: Services (`src/core/services/`) CANNOT import each other directly. Use DI container for orchestration.

3. **Single Writer Pattern**: ONLY `LearningService` performs database writes. All other services are read-only.

4. **No File Watching**: `fs.watch`, `fs.watchFile`, and `chokidar` are **prohibited**. All operations are on-demand only.

### Key Architectural Patterns

#### Dependency Injection Container
- **Location**: `src/core/container/container.ts`
- **Purpose**: Centralized service lifecycle management, prevents circular dependencies
- **Usage**: All CLI commands and MCP tools get services via container, not direct imports

**Example:**
```typescript
// ✅ CORRECT: Use DI container
import { createContainer } from '../core/bootstrap.js';
const container = await createContainer({ projectPath: '.' });
const analysisService = await container.get(ServiceKeys.AnalysisService);

// ❌ WRONG: Direct service import from CLI layer
import { AnalysisService } from '../core/services/AnalysisService.js';
```

#### Service Layer Organization
- **AnalysisService** (`src/core/services/AnalysisService.ts`): Read-only codebase analysis and metrics
- **LearningService** (`src/core/services/LearningService.ts`): Write-only learning operations (single writer)
- **SearchService** (`src/core/services/SearchService.ts`): Unified semantic, text, and pattern-based search
- **DiagnosticService** (`src/core/services/DiagnosticService.ts`): System health and diagnostics

#### Rust Core Integration
- **Bridge**: `src/utils/rust-bindings.ts` wraps native Rust bindings
- **Modules**: Semantic analysis, pattern learning, blueprint generation, complexity analysis
- **Performance**: Use Rust for compute-intensive operations; TypeScript for orchestration

### Security & Resilience

- **PathValidator** (`src/utils/path-validator.ts`): Path traversal protection, project boundary enforcement
- **RateLimiter** (`src/utils/rate-limiter.ts`): Sliding-window rate limiting (default: 100 req/min for MCP tools)
- **CircuitBreaker** (`src/utils/circuit-breaker.ts`): Automatic fallback to local storage when external services fail

## Directory Structure

```
src/
├── cli/                    # CLI commands (analyze, learn, status, rebuild-index)
├── core/                   # Service layer + DI container
│   ├── container/          # Dependency injection container
│   ├── services/           # Four core services (Analysis, Learning, Search, Diagnostic)
│   ├── bootstrap.ts        # Container initialization
│   └── errors.ts           # Shared error types
├── mcp/                    # MCP server and tools
│   ├── server.ts           # MCP server implementation
│   ├── tools/              # 8 MCP tools for AI assistants
│   └── adapters/           # Unified adapter layer
├── storage/                # Database and vector storage
│   ├── sqlite-db.ts        # SQLite database
│   ├── vector-store.ts     # Vector index with sqlite-vec support
│   └── repositories/       # Data access layer
├── utils/                  # Shared utilities
│   ├── semantic-engine.ts  # Rust semantic analysis wrapper
│   ├── pattern-engine.ts   # Rust pattern learning wrapper
│   ├── embedding-engine.ts # Transformers embeddings
│   ├── path-validator.ts   # Path security
│   ├── rate-limiter.ts     # Rate limiting
│   └── circuit-breaker.ts  # Resilience patterns
└── index.ts                # CLI entry point

rust-core/
├── src/
│   ├── analysis/           # Semantic analysis, blueprint, complexity
│   ├── patterns/           # Pattern learning and prediction
│   ├── parsing/            # Tree-sitter parsing manager
│   ├── types/              # Core types and errors
│   └── lib.rs              # napi-rs bindings
└── Cargo.toml
```

## Important Development Notes

### Working with Services

When adding functionality:
1. Determine if it's read-only (Analysis/Search/Diagnostic) or write (Learning)
2. Add methods to the appropriate service
3. **DO NOT** import services directly into each other
4. Use DI container to orchestrate multi-service operations
5. CLI/MCP layers access services ONLY through container

### Working with Rust

1. **When to use Rust**: AST parsing, pattern detection, heavy computation
2. **When to use TypeScript**: MCP integration, CLI, orchestration, I/O
3. **Boundary crossing**: Keep TypeScript ↔ Rust calls minimal; pass owned data
4. **Build process**: `bun run build:rust` compiles Rust and generates TypeScript bindings
5. **Testing**: Both `bun test` (TS) and `cargo test` (Rust) must pass

### Vector Search Configuration

Environment variables:
- `IN_MEMORIA_VECTOR_BACKEND`: `none`, `builtin` (default), or `vec`
- `IN_MEMORIA_SQLITE_VEC_PATH`: Path to sqlite-vec extension (if using `vec` backend)
- `HUGGINGFACE_HUB_CACHE`: Reuse HF model cache
- `TRANSFORMERS_OFFLINE=true`: Offline mode for embeddings

Vector data lives in `in-memoria-vectors.db` (separate from main DB).

### Testing Strategy

- **Unit tests**: Fast, isolated tests in `src/__tests__/`
- **Integration tests**: Real MCP server tests in `tests/integration/`
- **Rust tests**: Run with `cargo test` in `rust-core/`
- **Manual testing**: Use `bun run debug` to inspect MCP server with official inspector

Current test pass rates:
- TypeScript unit: 118/120 (98.3%)
- MCP integration: 23/23 (100%)
- Rust: Zero clippy warnings

### Common Patterns

#### Adding a new CLI command
1. Create file in `src/cli/`
2. Import `createContainer` from `src/core/bootstrap.js`
3. Get services via container
4. Never import services directly
5. Add command to `src/index.ts`

#### Adding a new MCP tool
1. Create tool definition in `src/mcp/tools/`
2. Use unified adapter pattern (see `src/mcp/adapters/unified-adapter.ts`)
3. Get services through container passed to adapter
4. Apply rate limiting if needed
5. Register tool in `src/mcp/server.ts`

#### Modifying architecture
1. Update service in `src/core/services/`
2. Run `bun run verify-architecture` to check constraints
3. Update tests
4. Build will fail if architectural rules are violated

## Building for Release

```bash
# Build all platforms
bun run build:all-platforms

# Prepare platform-specific packages
bun run prepare:platform-packages

# Publish (after testing)
bun publish
```

## Environment Configuration

Default paths:
- Database: `<project>/in-memoria.db`
- Vector index: `<project>/in-memoria-vectors.db`
- Embeddings: HuggingFace cache or `.cache/huggingface`

## Getting Help

- Discord: https://discord.gg/6mGsM4qkYm (@pi_22by7)
- Email: talk@windyboy.me
- Issues: https://github.com/windyboy/In-Memoria/issues
- Docs: See `README.md`, `CONTRIBUTING.md`, `AGENT.md`, `SECURITY.md`
