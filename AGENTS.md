# Agent Development Guidelines for In Memoria

## Build, Lint & Test Commands

### Build Commands
- **Full build**: `npm run build` (TypeScript + Rust core)
- **TypeScript only**: `npm run build:ts`
- **Rust only**: `npm run build:rust`
- **Type check**: `npm run typecheck` or `tsc --noEmit`

### Test Commands
- **All unit tests**: `npm test` or `vitest run`
- **Single test file**: `vitest run src/__tests__/specific-test.test.ts`
- **Integration tests**: `npm run test:integration`
- **Full test suite**: `npm run test:all`
- **Rust tests**: `cd rust-core && cargo test`
- **Rust linting**: `cd rust-core && cargo clippy`

### Development
- **Dev server**: `npm run dev`
- **MCP server**: `npm start`

## Code Style Guidelines

### TypeScript Standards
- **Target**: ES2022 with strict mode enabled
- **Modules**: ES modules with `.js` extensions in imports
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Types**: Explicit typing required, avoid `any`, use proper generics
- **Imports**: Group by external libraries first, then internal modules
- **Error handling**: Use proper error types, async/await patterns, avoid try/catch in library code
- **Documentation**: JSDoc for public APIs with examples

### Rust Standards
- **Error handling**: Use `Result<T, E>` types, avoid `.unwrap()` in library code
- **Ownership**: Follow Rust ownership patterns, minimize cloning
- **Naming**: snake_case for functions/variables, PascalCase for types
- **Documentation**: Document all public APIs with examples
- **Performance**: Minimize allocations, use zero-copy where possible

### General Patterns
- **Functional programming**: Prefer pure functions and immutability
- **Separation of concerns**: Clear boundaries between modules
- **Testing**: Write tests for all new functionality using Vitest (TS) or built-in Rust tests
- **Performance**: Profile critical paths, use circuit breakers for external calls

## GitHub Copilot Instructions

**CRITICAL: Path Parameter Usage**
ALWAYS provide absolute paths to In-Memoria tools. NEVER rely on default values.

### Why This Matters
In MCP server context, `process.cwd()` is unpredictable and may point to the wrong directory (like `/home/user` instead of your project). Always specify the path explicitly to avoid analyzing the wrong codebase or creating databases in unexpected locations.

```typescript
// ❌ WRONG - May use incorrect directory
await use_mcp_tool('in-memoria', 'get_project_blueprint', {
  includeFeatureMap: true
});

// ✅ CORRECT - Always specify path explicitly
await use_mcp_tool('in-memoria', 'get_project_blueprint', {
  path: '/absolute/path/to/project',  // Use workspace root
  includeFeatureMap: true
});
```

### Core Workflow
1. **Start every session**: Call `get_project_blueprint()` with absolute path
2. **Check learning status**: If `recommendation === 'learning_recommended'`, call `auto_learn_if_needed()`
3. **Use semantic search**: Prefer `search_codebase(type='semantic')` over text search
4. **Follow patterns**: Use `get_pattern_recommendations()` before implementing features
5. **Contribute insights**: Record architectural decisions with `contribute_insights()`

### Tool Priority
1. `get_project_blueprint` - Instant context + learning status
2. `auto_learn_if_needed` - Smart learning with staleness detection
3. `predict_coding_approach` - Implementation guidance with file routing
4. `get_pattern_recommendations` - Consistency with existing code
5. `search_codebase(type='semantic')` - Find code by meaning
6. `analyze_codebase` - Understand files/directories
7. `get_semantic_insights` - Explore learned concepts

## Development Workflow

### Before Implementation
1. **Load context**: Read `.opencode/context/core/standards/code.md` (MANDATORY)
2. **Check patterns**: Use `get_pattern_recommendations()` for consistency
3. **Plan approach**: Use `predict_coding_approach()` for guidance
4. **Request approval**: Get user approval before major changes

### During Implementation
1. **Incremental execution**: Implement one step at a time
2. **Validate each step**: Run type checks, linting, and tests
3. **Follow standards**: Adhere to TypeScript/Rust guidelines above
4. **Error handling**: Use proper error types and patterns

### After Implementation
1. **Run full test suite**: `npm run test:all`
2. **Type check**: `npm run typecheck`
3. **Rust quality**: `cd rust-core && cargo clippy && cargo test`
4. **Contribute insights**: Record any architectural decisions learned

## Embedding Model Configuration

Configure the transformer.js model used for semantic embeddings:

```bash
# Use a larger, more accurate model (768 dimensions)
export IN_MEMORIA_EMBEDDING_MODEL="Xenova/all-mpnet-base-v2"

# Use a smaller, faster model (384 dimensions) 
export IN_MEMORIA_EMBEDDING_MODEL="Xenova/paraphrase-MiniLM-L6-v2"

# Custom dimension override (if auto-detection fails)
export IN_MEMORIA_EMBEDDING_DIMENSION="768"

# Configure embedding cache size
export IN_MEMORIA_EMBEDDING_CACHE_SIZE="2000"

# Change pooling strategy (mean or cls)
export IN_MEMORIA_EMBEDDING_POOLING="cls"

# Disable L2 normalization
export IN_MEMORIA_EMBEDDING_NORMALIZE="false"
```

**Supported Models**:
- `Xenova/all-MiniLM-L6-v2` (384d, default) - Good balance of speed and accuracy
- `Xenova/all-MiniLM-L12-v2` (384d) - Slightly larger, more accurate
- `Xenova/all-mpnet-base-v2` (768d) - More accurate but slower
- `Xenova/paraphrase-MiniLM-L6-v2` (384d) - Optimized for semantic similarity
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384d) - Multilingual support

## Quality Gates

- ✅ **TypeScript**: `tsc --noEmit` passes
- ✅ **Tests**: All tests pass (`npm run test:all`)
- ✅ **Rust**: `cargo clippy` and `cargo test` pass
- ✅ **Patterns**: Follow existing code patterns and conventions
- ✅ **Documentation**: Public APIs documented with examples
- ✅ **Error handling**: Proper error types, no unwrap/panic in libraries</content>
<parameter name="filePath">AGENTS.md