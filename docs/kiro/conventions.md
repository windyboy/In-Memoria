# In Memoria Development Conventions

## Code Style & Formatting
- **Language**: TypeScript-first with strict mode enabled
- **Indentation**: 4 spaces (no tabs)
- **Quotes**: Double quotes for strings
- **Semicolons**: Always required
- **Line endings**: LF (Unix-style)

## Naming Conventions
Based on learned patterns from 1,167 concepts:

### Functions & Variables
- **Primary**: `camelCase` (157 occurrences)
- **Alternative**: `snake_case` (737 occurrences) - used in Rust bridge and test utilities
- Examples: `analyzeCodebase()`, `get_semantic_insights()`

### Classes & Types
- **Primary**: `PascalCase` (149 occurrences)
- Examples: `AnalysisConfig`, `SimpleError`, `PathValidator`

### Files & Directories
- **Files**: `kebab-case` (e.g., `di-container.ts`, `path-validator.ts`)
- **Directories**: `kebab-case` or descriptive names (e.g., `rust-core`, `__tests__`)

## Architecture Patterns
Detected patterns with high confidence:

### Dependency Injection (83% confidence, 2,258 occurrences)
- Use `src/di-container.ts` for service registration
- Constructor injection preferred over property injection
- Interface-based dependencies for testability

### Observer Pattern (163% confidence, 608 occurrences)
- Event-driven updates for file watching and analysis
- Use EventEmitter3 for type-safe event handling
- Methods: `notify()`, `update()`, `subscribe()`

### Builder Pattern (669% confidence, 11,910 occurrences)
- Complex object construction with fluent interfaces
- Methods: `build()`, `with()`, `set()`
- Used extensively in configuration and analysis setup

### Factory Pattern (741% confidence, 3,860 occurrences)
- Service and component instantiation
- Centralized creation logic for consistency

## Module Organization
### Layered Architecture (70% confidence)
```
src/
├── engines/          # Core analysis engines
├── storage/          # Data persistence layer
├── services/         # Business logic services
├── watchers/         # File system monitoring
├── utils/            # Shared utilities
└── __tests__/        # Unit tests and fixtures
```

### Import Conventions
- Use relative imports within modules
- Absolute imports for cross-module dependencies
- Path validation via `PathValidator` for user inputs
- Group imports: external → internal → relative

## Error Handling
- **Async/Await**: Preferred over Promise chains
- **Explicit Types**: Avoid `any`, use proper error types
- **Result Pattern**: Consider Result<T> for recoverable errors
- **Circuit Breaker**: Automatic fallbacks for external services

## Testing Standards
### Framework: Vitest
- **Location**: Unit tests beside code (`*.test.ts`, `*.spec.ts`)
- **Integration**: Separate `tests/` directory
- **Coverage**: Target ~60% for lines/branches/functions/statements
- **Environment**: Node.js with globals enabled

### Test Structure
- **Setup**: Use `src/__tests__/setup.ts` for shared fixtures
- **Deterministic**: Avoid time-dependent or random tests
- **Isolation**: Each test should be independent
- **Mocking**: Mock external dependencies and file system

## Build & Development
### Commands
- `npm run dev`: Development with tsx watch
- `npm run build`: Full build (TypeScript + Rust + assets)
- `npm run build:rust`: Rust components only
- `npm test`: Unit test suite
- `npm run test:integration`: Full integration tests

### Build Process
1. TypeScript compilation (`tsc`)
2. Rust core build (`npm run build:rust`)
3. Asset copying (SQL schemas, etc.)
4. Permission fixes for CLI executable

## Git & Commit Conventions
### Commit Messages
- **Format**: Imperative mood, short summary
- **Examples**: "Add vector store integration", "Fix DI import order"
- **Scope**: One logical change per commit

### Pull Requests
- Describe the change and reasoning
- Note environment variable changes
- Include before/after behavior notes
- Run full test suite before submission

## Environment Configuration
### Required Variables
- `NODE_ENV`: development | production | test
- `IN_MEMORIA_VECTOR_BACKEND`: surrealdb | qdrant (optional)

### Optional Variables
- `QDRANT_URL`, `QDRANT_API_KEY`: For external vector storage
- `IN_MEMORIA_EMBEDDING_MODEL`: Custom embedding model
- `TRANSFORMERS_OFFLINE`: Disable remote model fetches

## Security Considerations
- **Path Validation**: All user paths through `PathValidator`
- **Rate Limiting**: DoS protection with sliding-window limits
- **Local-First**: No data leaves the machine by default
- **Input Sanitization**: Validate all external inputs

## Performance Guidelines
- **Memory**: Monitor heap usage, target <100MB for typical use
- **Database**: SQLite for structured data, vectors in SurrealDB/Qdrant
- **Caching**: Leverage Hugging Face model cache for embeddings
- **Incremental**: File watching for incremental updates only