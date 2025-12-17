# In Memoria Decision Log Index

## Architecture Decisions

### ADR-001: Hybrid Rust + TypeScript Architecture
**Status**: Implemented  
**Date**: Early 2024  
**Context**: Need for high-performance AST parsing while maintaining MCP integration flexibility  
**Decision**: Rust core for performance-critical operations, TypeScript for MCP server and orchestration  
**Rationale**: Rust provides fast tree-sitter parsing and pattern analysis; TypeScript offers better MCP ecosystem integration  
**Evidence**: `rust-core/` directory with napi-rs bridge, `src/` TypeScript MCP server

### ADR-002: Local-First Storage Strategy
**Status**: Implemented  
**Date**: 2024  
**Context**: Privacy concerns and performance requirements for codebase intelligence  
**Decision**: SQLite for structured data, SurrealDB/SurrealKV for vectors, optional external Qdrant  
**Rationale**: Keep sensitive code data local by default, provide external options for advanced users  
**Evidence**: `src/storage/` with SQLite schemas, SurrealDB integration, Qdrant optional backend

### ADR-003: MCP as Primary Integration Protocol
**Status**: Implemented  
**Date**: 2024  
**Context**: Need to integrate with multiple AI coding assistants  
**Decision**: Build as MCP server with 13 specialized tools  
**Rationale**: MCP provides standardized protocol for AI tool integration across Claude, Copilot, Cursor  
**Evidence**: `@modelcontextprotocol/sdk` dependency, 13 MCP tools in codebase

### ADR-004: Tree-sitter for Multi-Language AST Parsing
**Status**: Implemented  
**Date**: 2024  
**Context**: Need to analyze codebases in multiple programming languages  
**Decision**: Use tree-sitter parsers for 12 languages in Rust core  
**Rationale**: Consistent AST structure across languages, high performance, active ecosystem  
**Evidence**: Rust core with tree-sitter integration, support for TypeScript, Python, Rust, Go, etc.

## Technical Decisions

### TD-001: Dependency Injection Container
**Status**: Implemented  
**Date**: 2024  
**Context**: Need for testable, modular service architecture  
**Decision**: Custom DI container in `src/di-container.ts`  
**Rationale**: Better testability, clear service boundaries, easier mocking  
**Evidence**: 2,258 DI pattern occurrences, constructor injection throughout codebase

### TD-002: Vitest as Testing Framework
**Status**: Implemented  
**Date**: 2024  
**Context**: Need for fast, modern testing with TypeScript support  
**Decision**: Vitest with Node environment and globals enabled  
**Rationale**: Better TypeScript integration than Jest, faster execution, modern API  
**Evidence**: `vitest.config.ts`, 98.3% test pass rate, comprehensive test suite

### TD-003: Path Validation Security Layer
**Status**: Implemented  
**Date**: 2024 (v0.7.0 security hardening)  
**Context**: Security concerns with user-provided file paths  
**Decision**: Mandatory `PathValidator` for all user path inputs  
**Rationale**: Prevent path traversal attacks, enforce project boundaries  
**Evidence**: `PathValidator` class usage throughout codebase, security hardening in v0.7.0

### TD-004: Circuit Breaker Pattern for Resilience
**Status**: Implemented  
**Date**: 2024 (v0.7.0)  
**Context**: Need for graceful degradation when external services fail  
**Decision**: Circuit breaker with automatic fallback to local storage  
**Rationale**: Improve reliability, prevent cascading failures, maintain functionality  
**Evidence**: Circuit breaker implementation, automatic fallbacks in storage layer

## Development Process Decisions

### PD-001: TypeScript Strict Mode
**Status**: Enforced  
**Date**: Early 2024  
**Context**: Need for type safety and code quality  
**Decision**: Strict TypeScript configuration with explicit types  
**Rationale**: Catch errors at compile time, improve code maintainability, better IDE support  
**Evidence**: `tsconfig.json` with strict mode, explicit typing throughout codebase

### PD-002: 4-Space Indentation Standard
**Status**: Enforced  
**Date**: Early 2024  
**Context**: Code formatting consistency  
**Decision**: 4 spaces, double quotes, semicolons required  
**Rationale**: Consistency with existing codebase patterns, readability  
**Evidence**: Consistent formatting across all TypeScript files

### PD-003: Kebab-Case File Naming
**Status**: Enforced  
**Date**: Early 2024  
**Context**: File naming consistency  
**Decision**: kebab-case for files, PascalCase for classes, camelCase for functions  
**Rationale**: URL-safe, consistent with web standards, clear separation from symbols  
**Evidence**: File naming patterns throughout `src/` directory

## Integration Decisions

### ID-001: Local Embeddings with Transformers.js
**Status**: Implemented  
**Date**: 2024  
**Context**: Need for semantic search without external API dependencies  
**Decision**: Use transformers.js with Xenova/all-MiniLM-L6-v2 model  
**Rationale**: Privacy (local processing), no API costs, offline capability  
**Evidence**: `@xenova/transformers` dependency, Hugging Face cache integration

### ID-002: Multi-Backend Vector Storage
**Status**: Implemented  
**Date**: 2024  
**Context**: Different deployment scenarios and performance requirements  
**Decision**: SurrealDB default, optional Qdrant for advanced users  
**Rationale**: Local-first default, scalable option for large codebases  
**Evidence**: `IN_MEMORIA_VECTOR_BACKEND` environment variable, dual storage implementations

## Pending Decisions

### PD-001: Multi-Project Intelligence (Phase 7)
**Status**: Planned  
**Context**: Users working across multiple related projects  
**Decision**: TBD - Cross-project pattern sharing and intelligence  
**Considerations**: Privacy boundaries, storage organization, performance impact

### PD-002: Collaboration Features (Phase 8)
**Status**: Planned  
**Context**: Team usage and shared intelligence  
**Decision**: TBD - Team intelligence sharing mechanisms  
**Considerations**: Conflict resolution, access control, synchronization

## Deprecated Decisions

### DD-001: Tool Consolidation (Phase 4)
**Status**: Completed (v0.5.0)  
**Date**: 2024  
**Context**: Too many similar MCP tools causing confusion  
**Decision**: Merged redundant tools from 16 to 13  
**Outcome**: Better agent experience, clearer tool boundaries  
**Evidence**: Tool count reduction, improved AGENT.md documentation

---

## Decision Categories
- **ADR**: Architecture Decision Records (major structural choices)
- **TD**: Technical Decisions (implementation choices)
- **PD**: Process Decisions (development workflow)
- **ID**: Integration Decisions (external system choices)
- **DD**: Deprecated Decisions (historical context)

## Contributing to Decision Log
When making significant decisions:
1. Document the context and constraints
2. Record the decision and rationale
3. Note implementation evidence
4. Update this index with appropriate category
5. Use `mcp_in_memoria_contribute_insights` to store in system memory