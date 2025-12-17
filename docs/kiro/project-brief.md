# In Memoria Project Brief

## Overview
**In Memoria** is a Model Context Protocol (MCP) server that provides persistent codebase intelligence for AI coding assistants, solving the "session amnesia" problem where AI tools forget context between sessions.

## Core Problem
AI coding assistants start from scratch every session, requiring developers to repeatedly explain:
- Project architecture and patterns
- Naming conventions and coding style
- Previous architectural decisions
- Feature locations and implementations

## Solution
A hybrid Rust + TypeScript system that learns from actual codebases and provides persistent intelligence through MCP integration.

## Key Capabilities
- **Project Blueprints**: Instant context (tech stack, entry points, architecture) in <200 tokens
- **Pattern Learning**: Statistical analysis of actual coding patterns and conventions
- **Smart File Routing**: Maps feature requests to specific files automatically
- **Semantic Search**: Finds code by meaning across semantic/text/pattern modes
- **Work Context**: Tracks sessions and architectural decisions persistently
- **13 MCP Tools**: Organized into Core Analysis, Intelligence, Automation, and Monitoring

## Architecture
```
AI Tool (Claude/Copilot) ←→ TypeScript MCP Server ←→ Rust Core (AST/Patterns)
                                      ↓
                            SQLite + SurrealDB (Local Storage)
```

## Current Status (v0.7.0)
- **Intelligence**: 1,167 concepts, 23 patterns learned
- **Test Coverage**: 98.3% unit tests, comprehensive integration
- **Integrations**: Claude Desktop/Code, GitHub Copilot, Cursor
- **Maturity**: Functional but early-stage, actively developed

## Target Users
- Individual developers seeking consistent AI assistance
- Development teams wanting shared codebase intelligence
- AI tool users frustrated with repetitive context explanation

## Success Metrics
- Reduced time explaining project context to AI tools
- Improved AI suggestion relevance and consistency
- Faster onboarding for new team members
- Persistent architectural knowledge across sessions

## Repository Structure
- `src/`: TypeScript MCP server, CLI, engines, storage, services
- `rust-core/`: High-performance AST parsing and pattern analysis
- `tests/`: Integration test suites
- `docs/`: Documentation and guides
- `dist/`: Build artifacts (generated)

## Development Status
Active development by [@windyboy](https://github.com/windyboy) with community contributions welcome. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.