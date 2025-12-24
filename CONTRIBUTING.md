# Contributing to In Memoria

Welcome! I'm excited that you're interested in contributing to In Memoria. This document provides guidelines and information for contributors.

**Project Maintainer**: [@windyboy](https://github.com/windyboy) (Piyush Airani)

**Important**: This is currently a solo project. Before starting work on any feature or significant change, please:

1. **Check existing work**: Review [GitHub Projects](https://github.com/windyboy/In-Memoria/projects) to see what's planned
2. **Discuss first**: Reach out via:
   - Discord: [discord.gg/6mGsM4qkYm](https://discord.gg/6mGsM4qkYm) (@pi_22by7)
   - Email: [talk@windyboy.me](mailto:talk@windyboy.me)
   - GitHub Issue: [Create an issue](https://github.com/windyboy/In-Memoria/issues/new)
3. **Get alignment**: Make sure your contribution aligns with the project direction

This helps avoid duplicate work and ensures we're all moving in the same direction!

## 🎯 Project Vision

In Memoria is building the future of persistent AI intelligence for development. We're creating revolutionary infrastructure that enables AI agents to maintain smart, cumulative understanding of codebases across sessions.

### Core Principles

- **Performance First**: Rust for compute-intensive operations, TypeScript for integration
- **Developer Experience**: Simple, intuitive APIs and tools
- **Extensibility**: Plugin architecture for custom intelligence modules
- **Privacy**: Local-first approach with optional cloud features

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (20 LTS recommended, 24+ also supported)
- **Rust 1.70+** with cargo
- **Git** for version control
- **VS Code** (recommended) with Rust-analyzer extension

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR-USERNAME/In-Memoria.git
cd In-Memoria

# 2. Switch to Node.js 20 LTS or 24+ (if using nvm)
nvm use 20  # or nvm use 24

# 3. Install dependencies with bun (faster than npm)
bun install

# 4. Build Rust core
bun run build:rust

# 5. Build TypeScript
bun run build:ts

# 6. Run tests
bun test
cd rust-core && cargo test

# 7. Start development mode (watch + reload)
bun run dev
```

**Note:** We use `bun` for development because it's significantly faster than `npm`. End users can still install the published package with `npm` as usual. See [INSTALLATION.md](INSTALLATION.md) for end-user installation.

### Project Structure Overview

```
In-Memoria/
├── src/                          # TypeScript source code
│   ├── cli/                     # CLI commands (interface layer)
│   ├── core/                    # Service layer + DI container
│   │   ├── container/           # Dependency injection container
│   │   ├── services/            # 4 core services (Analysis, Learning, Search, Diagnostic)
│   │   ├── bootstrap.ts         # Container initialization
│   │   └── errors.ts            # Shared error types
│   ├── mcp/                     # MCP server + tools (interface layer)
│   │   ├── server.ts            # MCP server implementation
│   │   ├── tools/               # Empty (consolidated into adapters)
│   │   └── adapters/            # Unified adapter layer
│   ├── storage/                 # Database + vector storage (storage layer)
│   │   ├── sqlite-db.ts         # SQLite database
│   │   ├── vector-store.ts      # Vector index
│   │   └── repositories/        # Data access layer
│   ├── utils/                   # Shared utilities
│   │   ├── semantic-engine.ts   # Rust semantic analysis wrapper
│   │   ├── pattern-engine.ts    # Rust pattern learning wrapper
│   │   ├── embedding-engine.ts  # Transformers embeddings
│   │   ├── path-validator.ts    # Path security
│   │   ├── rate-limiter.ts      # Rate limiting
│   │   └── circuit-breaker.ts   # Resilience patterns
│   └── index.ts                 # CLI entry point
├── rust-core/                   # High-performance Rust engines
│   ├── src/
│   │   ├── analysis/            # Semantic analysis, blueprint, complexity
│   │   ├── patterns/            # Pattern learning and prediction
│   │   ├── parsing/             # Tree-sitter parsing manager
│   │   ├── types/               # Core types and errors
│   │   └── lib.rs               # napi-rs bindings
│   └── Cargo.toml
├── docs/                        # Documentation
│   ├── ARCHITECTURAL_GUARDRAILS.md  # Architecture verification
│   ├── TESTING.md               # Testing strategy
│   └── ...
└── scripts/                     # Build and verification scripts
    ├── verify-architecture.ts   # Enforce architectural constraints
    └── build-time-verification.ts
```

**Note:** Test files are co-located with source code (e.g., `SearchService.test.ts` alongside `SearchService.ts`), not in separate `__tests__` directories.

## 🛠️ Development Workflow

### 1. Choose Your Contribution

#### Good First Issues

- Fix compiler warnings in Rust code
- Add unit tests for pattern detection
- Improve CLI help text and error messages
- Add examples for MCP tool usage
- Update documentation

#### Core Features (Advanced)

- Complete remaining MCP tool implementations
- Enhance pattern learning algorithms
- Improve semantic analysis accuracy
- Add new language support to tree-sitter integration

### 2. Development Process

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Make your changes
# ... code, test, repeat ...

# 3. Run the full test suite
bun run test:all

# 4. Check code quality
bun run typecheck
bun run verify-architecture  # Verify architectural constraints
cd rust-core && cargo clippy

# 5. Run pre-commit checks (architecture + typecheck + unit tests)
bun run pre-commit

# 6. Commit with conventional commits
git commit -m "feat: add semantic search functionality"

# 7. Push and create pull request
git push origin feature/your-feature-name
```

### 3. Code Quality Standards

#### TypeScript Guidelines

```typescript
// ✅ Good: Descriptive names, proper typing
async function analyzeSemanticConcepts(
  filePath: string,
  content: string
): Promise<SemanticConcept[]> {
  // Implementation...
}

// ❌ Avoid: any types, unclear names
async function doStuff(x: any): Promise<any> {
  // Implementation...
}
```

#### Rust Guidelines

```rust
// ✅ Good: Clear ownership, error handling
pub async fn extract_concepts(
    &mut self,
    file_path: &str
) -> Result<Vec<SemanticConcept>, AnalysisError> {
    // Implementation...
}

// ❌ Avoid: Unwrap in library code
let result = self.parse_file(path).unwrap(); // Don't do this
```

#### General Guidelines

- **Naming**: Use descriptive names for functions, variables, and types
- **Documentation**: Document all public APIs with examples
- **Error Handling**: Use proper error types, never panic in library code
- **Testing**: Write tests for new functionality
- **Performance**: Profile performance-critical code paths

## 🧪 Testing Strategy

### Test Categories

#### Unit Tests

```bash
# TypeScript unit tests (co-located with source files)
bun test

# Watch mode
bun run test:watch

# Rust unit tests
cd rust-core && cargo test
```

#### Integration Tests

```bash
# Build first, then run integration tests
bun run build
bun run test:integration
```

#### Architecture Verification

```bash
# Verify architectural constraints (runs automatically on build)
bun run verify-architecture

# This checks:
# - Layer separation (CLI/MCP cannot import from core directly)
# - Service isolation (services cannot import each other)
# - No file watching (fs.watch/chokidar prohibited)
```

### Writing Tests

#### TypeScript Example

```typescript
// tests/engines/semantic-engine.test.ts
describe("SemanticEngine", () => {
  it("should extract functions from TypeScript code", async () => {
    const engine = new SemanticEngine(mockDatabase, mockVectorDB);
    const concepts = await engine.analyzeFileContent(
      "test.ts",
      'function hello() { return "world"; }'
    );

    expect(concepts).toHaveLength(1);
    expect(concepts[0].type).toBe("function");
    expect(concepts[0].name).toBe("hello");
  });
});
```

#### Rust Example

```rust
// rust-core/src/semantic.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_function_extraction() {
        let mut analyzer = SemanticAnalyzer::new().unwrap();
        let concepts = analyzer
            .analyze_file_content("test.ts".to_string(), "function hello() {}".to_string())
            .await
            .unwrap();

        assert_eq!(concepts.len(), 1);
        assert_eq!(concepts[0].concept_type, "function");
        assert_eq!(concepts[0].name, "hello");
    }
}
```

## 📋 Pull Request Process

### 1. Before Submitting

- [ ] Tests pass: `npm run test:full`
- [ ] Code is formatted: `npm run format`
- [ ] No linting errors: `npm run lint`
- [ ] Rust code compiles cleanly: `cargo clippy`
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated for significant changes

### 2. Pull Request Template

```markdown
## Description

Brief description of changes and motivation.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Performance Impact

- [ ] No performance impact
- [ ] Performance improved
- [ ] Performance impact assessed and acceptable

## Screenshots/Examples

If applicable, add screenshots or code examples.

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
```

### 3. Review Process

1. **Automated Checks**: CI runs tests and quality checks
2. **Code Review**: Maintainers review for correctness and style
3. **Testing**: Manual testing of new features
4. **Approval**: At least one maintainer approval required
5. **Merge**: Squash and merge to main branch

## 🐛 Bug Reports

### Before Filing

1. Search existing issues for duplicates
2. Try the latest version
3. Collect relevant information:
   - Operating system and version
   - Node.js and Rust versions
   - In Memoria version
   - Steps to reproduce
   - Expected vs actual behavior

### Bug Report Template

```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Environment**

- OS: [e.g. macOS 13.0]
- Node.js: [e.g. 20.5.7]
- Rust: [e.g. 1.72.0]
- In Memoria: [e.g. 0.3.2]

**Additional Context**
Add any other context about the problem here.
```

## 💡 Feature Requests

### Process

1. **Discussion**: Open an issue to discuss the feature
2. **Design**: Work with maintainers on design approach
3. **Implementation**: Create pull request with implementation
4. **Review**: Code review and testing
5. **Documentation**: Update docs and examples

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear and concise description of what the problem is.

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions.

**Additional context**
Add any other context or screenshots about the feature request.

**Implementation Considerations**

- Performance impact
- Breaking changes
- Documentation needs
- Testing requirements
```

## 🏗️ Architecture Guidelines

### TypeScript Layer

- **Purpose**: MCP integration, CLI interface, orchestration
- **Patterns**: Dependency injection, error handling, async/await
- **Responsibilities**: API surface, configuration, file I/O

### Rust Layer

- **Purpose**: High-performance analysis, ML algorithms, data processing
- **Patterns**: Result types, ownership, zero-copy where possible
- **Responsibilities**: Parsing, analysis, pattern learning

### Integration Guidelines

- **napi-rs bindings**: Keep interface simple, pass owned data
- **Error handling**: Convert Rust errors to TypeScript errors properly
- **Performance**: Minimize TypeScript ↔ Rust boundary crossings
- **Memory**: Be mindful of memory usage in long-running processes

## 📚 Resources

### Learning Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [napi-rs Guide](https://napi.rs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Rust Book](https://doc.rust-lang.org/book/)

### Project Resources

- [Architecture Decision Records](docs/adr/)
- [API Documentation](docs/api/)
- [Development Roadmap](TODO.md)

## ❓ Getting Help

### Communication Channels

- **Discord**: [discord.gg/6mGsM4qkYm](https://discord.gg/6mGsM4qkYm) - Best for real-time discussions, questions, and brainstorming (@pi_22by7)
- **Email**: [talk@windyboy.me](mailto:talk@windyboy.me) - For private inquiries or detailed technical discussions
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas

### Maintainer Availability

As a solo project, response times may vary:

- **Response Time**: I aim to respond to issues within 48-72 hours (faster on Discord)
- **Review Time**: Pull requests are typically reviewed within a week
- **Release Cycle**: Releases happen when significant features/fixes are ready
- **Best contact**: Discord (@pi_22by7) for fastest response

**Tip**: Join Discord for the quickest feedback and to stay updated on project direction!

## 🙏 Recognition

All contributors are valued and recognized:

- **Contributors list** in README.md
- **Release notes** mentioning significant contributions
- **GitHub contributor graph** showing activity
- **Special recognition** for major contributions
- **Discord role** for active contributors

Your contributions, no matter how small, help build better infrastructure for AI-assisted development!

## 📄 License

By contributing to In Memoria, you agree that your contributions will be licensed under the MIT License. See [LICENSE](LICENSE) file for details.

---

Thank you for your interest in contributing to In Memoria! Whether you're fixing a typo, reporting a bug, or building a major feature, your help is appreciated.

**Remember**: Reach out on [Discord](https://discord.gg/6mGsM4qkYm) (@pi_22by7) before starting significant work. Let's build the future of persistent AI intelligence for development together! 🚀

— Piyush (@windyboy)
