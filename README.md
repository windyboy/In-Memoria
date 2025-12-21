# In Memoria

[![npm version](https://img.shields.io/npm/v/in-memoria.svg)](https://www.npmjs.com/package/in-memoria)
[![npm downloads](https://img.shields.io/npm/dm/in-memoria.svg)](https://www.npmjs.com/package/in-memoria)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/discord/1431193342200516630?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/6mGsM4qkYm)

**Giving AI coding assistants a memory that actually persists.**

## Quick Demo

[![asciicast](https://asciinema.org/a/ZyD2bAZs1cURnqoFc3VHXemJx.svg)](https://asciinema.org/a/ZyD2bAZs1cURnqoFc3VHXemJx)

_Watch In Memoria in action: learning a codebase, providing instant context, and routing features to files._

---

## The Problem: Session Amnesia

You know the drill. You fire up Claude, Copilot, or Cursor to help with your codebase. You explain your architecture. You describe your patterns. You outline your conventions. The AI gets it, helps you out, and everything's great.

Then you close the window.

Next session? Complete amnesia. You're explaining the same architectural decisions again. The same naming conventions. The same "no, we don't use classes here, we use functional composition" for the fifteenth time.

**Every AI coding session starts from scratch.**

This isn't just annoying, it's inefficient. These tools re-analyze your codebase on every interaction, burning tokens and time. They give generic suggestions that don't match your style. They have no memory of what worked last time, what you rejected, or why.

## The Solution: Persistent Intelligence

In Memoria is an MCP server that learns from your actual codebase and remembers across sessions. It builds persistent intelligence about your code (patterns, architecture, conventions, decisions) that AI assistants can query through the Model Context Protocol.

Think of it as giving your AI pair programmer a notepad that doesn't get wiped clean every time you restart the session.

**Current version: 0.7.0** - [See what's changed](CHANGELOG.md)

### What It Does

- **Learns your patterns** - Analyzes your code to understand naming conventions, architectural choices, and structural preferences
- **Instant project context** - Provides tech stack, entry points, and architecture in <200 tokens (no re-analysis needed)
- **Smart file routing** - Routes vague requests like "add password reset" directly to relevant files
- **Semantic search** - Finds code by meaning, not just keywords
- **Work memory** - Tracks current tasks and architectural decisions across sessions
- **Pattern prediction** - Suggests how you'd solve similar problems based on your history

### Example Workflow

```bash
# First time: Learn your codebase
npx in-memoria learn ./my-project

# Start the MCP server
npx in-memoria server

# Now in Claude/Copilot:
You: "Add password reset functionality"
AI: *queries In Memoria*
    "Based on your auth patterns in src/auth/login.ts, I'll use your
     established JWT middleware pattern and follow your Result<T>
     error handling convention..."

# Next session (days later):
You: "Where did we put the password reset code?"
AI: *queries In Memoria*
    "In src/auth/password-reset.ts, following the pattern we
     established in our last session..."
```

No re-explaining. No generic suggestions. Just continuous, context-aware assistance.

## Quick Start

### Installation

```bash
# Install globally
npm install -g in-memoria

# Or use directly with npx
npx in-memoria --help
```

### Connect to Your AI Tool

**📖 Complete Setup Guide**: See [MCP_SETUP.md](MCP_SETUP.md) for detailed instructions for all AI assistants.

**Claude Desktop** - Add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "npx",
      "args": ["in-memoria", "server"]
    }
  }
}
```

**Claude Code CLI**:

```bash
claude mcp add in-memoria -- npx in-memoria server
```

**Kiro IDE** - Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "npx",
      "args": ["in-memoria", "server"],
      "disabled": false,
      "autoApprove": ["get_project_blueprint", "analyze_codebase"]
    }
  }
}
```

**GitHub Copilot** - See [MCP_SETUP.md](MCP_SETUP.md) for integration details

### Learn Your Codebase

```bash
# Analyze and learn from your project
npx in-memoria learn ./my-project

# Or let AI agents trigger learning automatically
# (Just start the server and let auto_learn_if_needed handle it)
npx in-memoria server
```

## How It Works

In Memoria is built on Rust + TypeScript, using the Model Context Protocol to connect AI tools to persistent codebase intelligence.

### Architecture

In Memoria follows a **three-layer architecture** with dependency injection for clean separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                           │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   CLI Commands  │           │   MCP Server & Tools     │  │
│  │  (Pure Adapters)│           │    (Pure Adapters)       │  │
│  └─────────────────┘           └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │
│  │ AnalysisService │ │ LearningService │ │ SearchService │ │
│  │   (Read Only)   │ │  (Write Only)   │ │  (Read Only)  │ │
│  └─────────────────┘ └─────────────────┘ └───────────────┘ │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │DiagnosticService │           │     DI Container        │  │
│  │   (Read Only)   │           │   (Orchestration)        │  │
│  └─────────────────┘           └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Storage Layer                            │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   SQLite DB     │           │   Vector Store          │  │
│  │ (4 tables only)│           │   (Qdrant/SurrealDB)    │  │
│  └─────────────────┘           └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Rust Core (napi)   │
                    │  • AST Parser        │
                    │  • Pattern Learner  │
                    │  • Semantic Engine   │
                    │  • Blueprint System │
                    └─────────────────────┘
```

**Key Architectural Principles:**
- **Layer Separation**: Interface layer (CLI/MCP) cannot import from core layer directly
- **Service Isolation**: Services cannot import each other directly; orchestrated through DI container
- **Single Writer**: Only `LearningService` performs write operations
- **No File Watching**: Background watchers prohibited; all operations are on-demand
- **Architectural Guardrails**: Build-time verification enforces architectural constraints

### The Core Components

**Rust Layer** - Fast, native processing:

- Tree-sitter AST parsing for 12 languages (TypeScript, JavaScript, Python, PHP, Rust, Go, Java, C/C++, C#, Svelte, SQL)
- Blueprint analyzer (detects project structure, entry points, architecture patterns)
- Pattern learner (statistical analysis of your coding style)
- Semantic engine (understands code relationships and concepts)

**TypeScript Layer** - MCP server and orchestration:

- **Dependency Injection Container** - Centralized service lifecycle management with type-safe resolution
- **Service Layer** - Four core services (Analysis, Learning, Search, Diagnostic) with clear boundaries
  - `AnalysisService` - Read-only codebase analysis and metrics
  - `LearningService` - Write-only learning operations (single writer principle)
  - `SearchService` - Unified semantic, text, and pattern-based search
  - `DiagnosticService` - System health and diagnostic information
- **PathValidator** - Security hardening with path traversal protection and project boundary enforcement
- **RateLimiter** - DoS protection with configurable sliding-window rate limiting for MCP tools
- **CircuitBreaker** - Resilience with automatic fallback to local storage when external services fail
- **Architectural Guardrails** - Build-time verification scripts enforce layer separation and design principles
- 13 specialized MCP tools for AI assistants (organized into 4 categories with extensible registry)
- SQLite for structured data, unified vector store abstraction (Qdrant or SurrealDB)
- Smart routing that maps features to files

**Storage** - Local-first:

- Everything stays on your machine
- SQLite for structured data, SurrealDB with SurrealKV backend for persistent vector embeddings
- Local transformers.js for embeddings (Xenova/all-MiniLM-L6-v2) that read/write from the Hugging Face cache
  - **Cache priority**: `IN_MEMORIA_EMBEDDING_CACHE_DIR` → `HUGGINGFACE_HUB_CACHE` → `HF_HOME/hub`
  - **Use existing cache**: If you've downloaded models with `hf download`, set `HUGGINGFACE_HUB_CACHE` to your cache directory
  - **Offline mode**: Set `TRANSFORMERS_OFFLINE=true` to disable remote fetches and use local cache only

### What Makes It Different

This isn't just another RAG system or static rules engine:

- **Learns from actual code** - Not manually-defined rules, but statistical patterns from your real codebase
- **Predicts your approach** - Based on how you've solved similar problems before
- **Token efficient** - Responses optimized to minimize LLM context usage (<200 tokens for project context)
- **Routes to files** - "Add login" → automatically suggests `src/auth/login.ts`
- **Remembers context** - Tracks work sessions, tasks, and architectural decisions
- **Multi-mode search** - Semantic (meaning), text (keywords), or pattern-based

## What's New in v0.5.x

We recently completed Phases 1-4 of the implementation roadmap:

### 🗺️ Project Blueprints (Phase 1)

Instant project context without full learning. Ask about a codebase and get tech stack, entry points, key directories, and architecture all in under 200 tokens.

### 💼 Work Context System (Phase 2)

AI agents can now track work sessions, maintain task lists, and record architectural decisions. Resume work exactly where you left off.

### 🧭 Smart File Routing (Phase 3)

Feature-to-file mapping across 10 categories (auth, API, database, UI, etc.). Vague requests like "add password reset" get routed to specific files automatically.

### ⚡ Smooth Progress Tracking (v0.5.3)

No more janky console spam. Progress bars update in-place with consistent 500ms refresh rates.

## MCP Tools for AI Assistants

In Memoria provides **8 specialized tools** that AI assistants can call via MCP. They're organized into 3 categories:

### 🎯 Core Analysis (2 tools)

- `analyze_codebase` - Analyze files/directories with concepts, patterns, complexity
- `search_codebase` - Multi-mode search (semantic/text/pattern)

### 🧠 Intelligence (5 tools)

- `learn_codebase_intelligence` - Deep learning to extract patterns and architecture
- `get_project_blueprint` - Instant project context with tech stack and entry points ⭐ (includes learning status)
- `get_semantic_insights` - Query learned concepts and relationships
- `get_pattern_recommendations` - Get patterns with related files for consistency ⚠️ (basic implementation)
- `predict_coding_approach` - Implementation guidance with file routing ⚠️ (basic implementation)

### 📊 Monitoring (1 tool)

- `get_intelligence_metrics` - Analytics on learned patterns

**Phase 4 Status**: The following tools are mentioned in documentation but not yet implemented:

- ❌ `auto_learn_if_needed` - Use `learn_codebase_intelligence` instead
- ❌ `contribute_insights` - Not yet implemented  
- ❌ `get_developer_profile` - Not yet implemented
- ❌ `get_system_status` - Not yet implemented
- ❌ `get_performance_status` - Not yet implemented

**Current Implementation Status**:
- ✅ Core analysis tools are fully functional
- ✅ Learning and blueprint tools work well
- ⚠️ Pattern recommendations return basic responses (service layer incomplete)
- ⚠️ Coding approach prediction returns basic responses (service layer incomplete)

> **For AI agents**: See [`AGENT.md`](AGENT.md) for complete tool reference with usage patterns and decision trees.

## GitHub Copilot Integration

In Memoria works with GitHub Copilot through custom instructions and chat modes.

### Setup

This repository includes:

- `.github/copilot-instructions.md` - Automatic guidance for Copilot
- `.github/chatmodes/` - Three specialized chat modes:
  - 🔍 **inmemoria-explorer** - Intelligent codebase navigation
  - 🚀 **inmemoria-feature** - Feature implementation with patterns
  - 🔎 **inmemoria-review** - Code review with consistency checking

To use in VS Code:

1. Command Palette → "Chat: Configure Chat Modes..."
2. Select a mode from `.github/chatmodes/`

### Example

```typescript
// In Copilot chat:
@workspace "Where is the authentication logic?"
// → Copilot uses In Memoria's semantic search

"Add password reset functionality"
// → Copilot gets approach + file routing + patterns

"Review this code for consistency"
// → Copilot checks against project patterns
```

## Language Support

Native AST parsing via tree-sitter for:

- TypeScript & JavaScript (including JSX/TSX)
- Python
- PHP
- Rust
- Go
- Java
- C & C++
- C#
- Svelte
- SQL
- Kotlin
- Markdown

Build artifacts (`node_modules/`, `dist/`, `.next/`, etc.) are automatically filtered out.

## Status: Work in Progress

**Let's be honest**: In Memoria is early-stage software. It works, but it's not perfect.

### What Works Well

- ✅ Pattern learning from real codebases
- ✅ Semantic search across concepts
- ✅ Project blueprint generation
- ✅ MCP integration with Claude Desktop/Code
- ✅ Cross-platform support (Linux, macOS, Windows)
- ✅ Token-efficient responses
- ✅ Security hardening with path validation and rate limiting
- ✅ Resilience with circuit breaker patterns and automatic fallbacks

### Known Limitations

- ⚠️ Large codebases (100k+ files) can be slow on first analysis
- ⚠️ Pattern accuracy improves with codebase consistency
- ⚠️ Some languages have better tree-sitter support than others
- ⚠️ Documentation could be more comprehensive

### We Need Your Help

This is open-source infrastructure for AI-assisted development. Currently a solo project by [@windyboy](https://github.com/windyboy), but contributions are not just welcome, they're essential.

**Before contributing code**, please:

- Check the [GitHub Projects board](https://github.com/windyboy/In-Memoria/projects) to see what's planned
- Join [Discord](https://discord.gg/6mGsM4qkYm) to discuss your ideas (@pi_22by7)
- [Open an issue](https://github.com/windyboy/In-Memoria/issues) to discuss the feature/fix
- Email me at [talk@windyboy.me](mailto:talk@windyboy.me) for larger contributions

**Ways to contribute**:

- 🐛 **Report bugs** - Found something broken? [Open an issue](https://github.com/windyboy/In-Memoria/issues)
- 💡 **Suggest features** - Have ideas? Discuss on [Discord](https://discord.gg/6mGsM4qkYm) or [GitHub Discussions](https://github.com/windyboy/In-Memoria/discussions)
- 🔧 **Submit PRs** - Code contributions are always appreciated (discuss first!)
- 📖 **Improve docs** - Help make this easier to understand
- 🧪 **Test on your codebase** - Try it out and tell us what breaks
- 💬 **Join the community** - [Discord](https://discord.gg/6mGsM4qkYm) for real-time discussions

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Technical Comparison

**vs GitHub Copilot's memory**:

- Copilot: Basic fact storage, no pattern learning
- In Memoria: Semantic analysis + pattern learning + architectural intelligence + work context

**vs Cursor's rules**:

- Cursor: Static rules, manually defined
- In Memoria: Dynamic learning from actual code + smart file routing + project blueprints

**vs Custom RAG**:

- RAG: Retrieves relevant code snippets
- In Memoria: Understands patterns + predicts approaches + routes to files + tracks work context

## Team Usage

In Memoria works for both individual developers and teams:

**Individual**:

- Learns your personal coding style
- Remembers architectural decisions you've made
- Provides context-aware suggestions

**Team**:

- Share `.in-memoria.db` files to distribute learned patterns
- Onboard new developers with pre-learned codebase intelligence
- Ensure consistent AI suggestions across the team

## Build from Source

```bash
git clone https://github.com/windyboy/In-Memoria
cd In-Memoria
npm install
npm run build
```

**Requirements**:

- Node.js 18+
- Rust 1.70+ (for building from source)
- 2GB RAM minimum

**Development**:

```bash
npm run dev          # Start in development mode
npm test            # Run test suite (98.3% pass rate)
npm run build:rust  # Build Rust components
```

**Quality metrics**:

- 118/120 unit tests passing (98.3%)
- 23/23 MCP integration tests passing (100%)
- Zero clippy warnings in Rust code
- Zero memory leaks verified

## FAQ

**Q: Does this replace my AI coding assistant?**
A: No, it enhances them. In Memoria provides the memory and context that tools like Claude, Copilot, and Cursor can use to give better suggestions.

**Q: What data is collected?**
A: Everything stays local. No telemetry, no phone-home. Your code never leaves your machine. All embeddings are generated locally using transformers.js models.

**Q: How accurate is pattern learning?**
A: It improves with codebase size and consistency. Projects with established patterns see better results than small or inconsistent codebases. The system learns from frequency and repetition.

**Q: What's the performance impact?**
A: Minimal. Initial learning takes time (proportional to codebase size), but subsequent queries are fast. File watching enables incremental updates. Smart filtering skips build artifacts automatically.

**Q: What if analysis fails or produces weird results?**
A: [Open an issue](https://github.com/windyboy/In-Memoria/issues) with details. Built-in timeouts and circuit breakers handle most edge cases, but real-world codebases are messy and we need your feedback to improve.

**Q: Can I use this in production?**
A: You _can_, but remember this is v0.5.x. Expect rough edges. Test thoroughly. Report issues. We're working toward stability but aren't there yet.

**Q: Why Rust + TypeScript?**
A: Rust for performance-critical AST parsing and pattern analysis. TypeScript for MCP server and orchestration. Best of both worlds: fast core, flexible integration layer.

**Q: What about other AI tools (not Claude/Copilot)?**
A: Any tool supporting MCP can use In Memoria. We've tested with Claude Desktop, Claude Code, and GitHub Copilot. Others should work but may need configuration.

## Roadmap

We're following a phased approach:

- ✅ **Phase 1**: Project Blueprint System (v0.5.0)
- ✅ **Phase 2**: Work Context & Session Memory (v0.5.0)
- ✅ **Phase 3**: Smart File Routing (v0.5.0)
- ✅ **Phase 4**: Tool Consolidation (v0.5.0)
- ✅ **Phase 5**: Security Hardening & Architecture Refinement (v0.7.0)
- 🚧 **Phase 6**: Enhanced Vector Search & Embeddings
- 📋 **Phase 7**: Multi-project Intelligence
- 📋 **Phase 8**: Collaboration Features

See [GitHub Projects](https://github.com/windyboy/In-Memoria/projects) for detailed tracking.

## Community & Support

**Project maintained by**: [@windyboy](https://github.com/windyboy)

- 💬 **Discord**: [discord.gg/6mGsM4qkYm](https://discord.gg/6mGsM4qkYm) - Join the community, ask questions, discuss improvements (ping @pi_22by7)
- 📧 **Email**: [talk@windyboy.me](mailto:talk@windyboy.me) - For private inquiries or larger contribution discussions
- 🐛 **Issues**: [GitHub Issues](https://github.com/windyboy/In-Memoria/issues) - Report bugs and request features
- 💡 **Discussions**: [GitHub Discussions](https://github.com/windyboy/In-Memoria/discussions) - General discussions and Q&A
- 📖 **Documentation**: See [AGENT.md](AGENT.md) for AI agent instructions
- 🤝 **Contributing**: Check [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines

**Before contributing**: Please discuss your ideas on Discord, via email, or in an issue before starting work on significant features. This helps ensure alignment with project direction and avoids duplicate efforts.

## License

MIT - see [LICENSE](LICENSE)

Built with ❤️ by [@windyboy](https://github.com/windyboy) for the AI-assisted development community.

---

**Try it**: `npx in-memoria server`

**Latest release**: [v0.7.0](CHANGELOG.md) - Security hardening and architecture improvements

_In memoria: in memory. Because your AI assistant should remember._

**Questions? Ideas?** Join us on [Discord](https://discord.gg/6mGsM4qkYm) or reach out at [talk@windyboy.me](mailto:talk@windyboy.me)
