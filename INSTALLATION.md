# In Memoria Installation Guide

Complete installation guide for In Memoria - persistent intelligence infrastructure for AI coding assistants.

**Current Version:** 0.7.0

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [For End Users](#for-end-users)
  - [For Development](#for-development)
  - [Platform-Specific Packages](#platform-specific-packages)
- [First Run Configuration](#first-run-configuration)
- [AI Assistant Integration](#ai-assistant-integration)
- [Environment Configuration](#environment-configuration)
- [Verification & Testing](#verification--testing)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

### For End Users

- **Node.js 18+** (LTS versions 20 or 24+ recommended)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify: `node --version`
- **npm** (comes with Node.js)
  - Verify: `npm --version`

### For Development

All of the above, plus:

- **Bun runtime** (for faster development)
  - Install: `curl -fsSL https://bun.sh/install | bash`
  - Verify: `bun --version`
- **Rust 1.70+** (for building Rust core)
  - Install: [rustup.rs](https://rustup.rs/)
  - Verify: `rustc --version`
- **Git** for version control
  - Verify: `git --version`

### Platform Requirements

- **macOS**: macOS 10.15+ (Apple Silicon and Intel supported)
- **Linux**: Ubuntu 20.04+, Debian 11+, or equivalent
- **Windows**: Windows 10/11 with WSL2 or native support

---

## Installation Methods

### For End Users

Choose one of the following installation methods:

#### Option 1: Global Installation (Recommended)

Install In Memoria globally to use it from anywhere:

```bash
npm install -g in-memoria
```

Verify installation:

```bash
in-memoria --version
# Should output: 0.7.0
```

#### Option 2: Use with npx (No Installation)

Run In Memoria directly without installation:

```bash
npx in-memoria --version
npx in-memoria server
```

This is perfect for:
- Trying In Memoria before committing
- CI/CD pipelines
- Temporary usage

#### Option 3: Project-Local Installation

Install In Memoria as a project dependency:

```bash
cd your-project
npm install in-memoria
```

Run with npx:

```bash
npx in-memoria server
```

Or add to your `package.json` scripts:

```json
{
  "scripts": {
    "memoria": "in-memoria server"
  }
}
```

### For Development

Clone and build from source:

```bash
# 1. Clone the repository
git clone https://github.com/windyboy/In-Memoria.git
cd In-Memoria

# 2. Switch to Node.js 20 LTS or 24+ (if using nvm)
nvm use 20  # or nvm use 24

# 3. Install dependencies with bun
bun install

# 4. Build the Rust core
bun run build:rust

# 5. Build TypeScript
bun run build:ts

# 6. Run tests to verify
bun test

# 7. Test the CLI
node dist/index.js --version

# 8. Start development mode (watch + reload)
bun run dev
```

**Note:** We use `bun` for development because it's faster. End users can use `npm` as usual.

### Platform-Specific Packages

In Memoria includes optional platform-specific packages for better performance. These are automatically installed based on your platform:

- `@in-memoria/darwin-arm64` - macOS Apple Silicon (M1/M2/M3)
- `@in-memoria/darwin-x64` - macOS Intel
- `@in-memoria/linux-x64` - Linux x64
- `@in-memoria/win32-x64` - Windows x64

These packages contain pre-compiled Rust binaries. If installation fails, In Memoria will fall back to JavaScript implementations.

---

## First Run Configuration

### Automatic Setup

On first run, In Memoria automatically:

1. **Creates local database** at `<project>/in-memoria.db`
2. **Initializes vector store** (built-in SQLite-based by default)
3. **Downloads embedding model** (Xenova/all-MiniLM-L6-v2, ~25MB)
   - Cached at `~/.cache/huggingface/` for reuse

### First Learning Run

Before using In Memoria with your AI assistant, learn your codebase:

```bash
# Learn your project (run from project root)
in-memoria learn .

# Or specify a path
in-memoria learn /path/to/your/project

# With options
in-memoria learn . --verbose  # Show detailed progress
in-memoria learn . --quick    # Fast mode (skip deep analysis)
in-memoria learn . --force    # Force re-learning
```

**What happens during learning:**
- Scans your codebase files
- Extracts code structure and patterns using Tree-sitter
- Generates semantic embeddings for vector search
- Stores intelligence in local SQLite database
- Takes 1-5 minutes for typical projects (10k-50k LOC)

### Check Learning Status

```bash
in-memoria status

# Or for specific project
in-memoria status /path/to/project
```

### Rebuild Vector Index

If you need to rebuild the vector search index:

```bash
in-memoria rebuild-index

# Force rebuild
in-memoria rebuild-index --force
```

---

## AI Assistant Integration

In Memoria works with multiple AI assistants through the Model Context Protocol (MCP). See [MCP_SETUP.md](MCP_SETUP.md) for detailed integration guides.

### Quick Integration Examples

#### Claude Desktop

Add to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "npx",
      "args": ["in-memoria", "server"],
      "env": {
        "IN_MEMORIA_LOG_LEVEL": "warn"
      }
    }
  }
}
```

Or with global installation:

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "in-memoria",
      "args": ["server"]
    }
  }
}
```

Restart Claude Desktop to load the server.

#### Claude Code CLI

```bash
# Add In Memoria as an MCP server
claude mcp add in-memoria -- npx in-memoria server

# Or with global installation
claude mcp add in-memoria -- in-memoria server
```

#### GitHub Copilot (VS Code)

In Memoria provides custom instructions for GitHub Copilot:

1. **Automatic Instructions:** `.github/copilot-instructions.md` provides guidance
2. **Chat Modes:** `.github/chatmodes/` contains specialized modes:
   - `inmemoria-explorer` - Intelligent codebase navigation
   - `inmemoria-feature` - Feature implementation with learned patterns
   - `inmemoria-review` - Code review with consistency checking

To use in VS Code:
1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Select "Chat: Configure Chat Modes..."
3. Select a mode from `.github/chatmodes/`

#### Kiro IDE

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "npx",
      "args": ["in-memoria", "server"],
      "env": {
        "IN_MEMORIA_LOG_LEVEL": "warn"
      },
      "disabled": false,
      "autoApprove": [
        "get_project_blueprint",
        "analyze_codebase",
        "search_codebase"
      ]
    }
  }
}
```

### Testing MCP Connection

Test if your AI assistant can connect to In Memoria:

```bash
# Start server manually
in-memoria server

# In another terminal, test with MCP inspector
npx @modelcontextprotocol/inspector node dist/index.js server
```

The inspector provides a web UI to test MCP tools.

---

## Environment Configuration

In Memoria is configured through environment variables. All are optional with sensible defaults.

### Core Configuration

```bash
# Logging level (error, warn, info, debug)
export IN_MEMORIA_LOG_LEVEL=warn

# Custom database path (absolute path)
export IN_MEMORIA_DB_PATH=/custom/path/to/database.db

# Custom database filename (kept in project root)
export IN_MEMORIA_DB_FILENAME=my-memoria.db
```

### Vector Search Configuration

```bash
# Vector backend (builtin, vec, none)
# - builtin (default): SQLite-based cosine similarity search
# - vec: Use sqlite-vec extension for faster vector search
# - none: Disable vector search entirely
export IN_MEMORIA_VECTOR_BACKEND=builtin

# Path to sqlite-vec extension (required if using 'vec')
export IN_MEMORIA_SQLITE_VEC_PATH=/path/to/vec0.so
```

**Installing sqlite-vec Extension** (Optional - for faster vector search):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.3-loadable-macos-aarch64.tar.gz | tar xz
export IN_MEMORIA_SQLITE_VEC_PATH=$(pwd)/vec0.dylib

# macOS (Intel)
curl -L https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.3-loadable-macos-x86_64.tar.gz | tar xz
export IN_MEMORIA_SQLITE_VEC_PATH=$(pwd)/vec0.dylib

# Linux (x86_64)
curl -L https://github.com/asg017/sqlite-vec/releases/latest/download/sqlite-vec-v0.1.3-loadable-linux-x86_64.tar.gz | tar xz
export IN_MEMORIA_SQLITE_VEC_PATH=$(pwd)/vec0.so

# Windows (x86_64)
# Download from: https://github.com/asg017/sqlite-vec/releases/latest
# Extract vec0.dll and set path:
# set IN_MEMORIA_SQLITE_VEC_PATH=C:\path\to\vec0.dll

# Enable vec backend
export IN_MEMORIA_VECTOR_BACKEND=vec
```

**Note**: The `builtin` backend (default) works well for most use cases. Use `vec` for large codebases (100k+ files) where vector search performance matters.

### Embedding Model Configuration

```bash
# Embedding model (HuggingFace model name)
export IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Embedding dimension (must match model)
export IN_MEMORIA_EMBEDDING_DIMENSION=384

# HuggingFace cache directory
export HUGGINGFACE_HUB_CACHE=/custom/cache/path

# Offline mode (use cached models only)
export TRANSFORMERS_OFFLINE=true
```

### Advanced Configuration

```bash
# Rate limiting (requests per minute)
export IN_MEMORIA_RATE_LIMIT=100

# Circuit breaker threshold
export IN_MEMORIA_CIRCUIT_BREAKER_THRESHOLD=5

# Enable debug logging for Rust core
export RUST_LOG=debug
```

### Configuration Files

You can also use a `.env` file in your project root:

```bash
# .env
IN_MEMORIA_LOG_LEVEL=info
IN_MEMORIA_VECTOR_BACKEND=builtin
IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

---

## Verification & Testing

### Verify Installation

```bash
# Check version
in-memoria --version

# Should output: 0.7.0
```

### Test CLI Commands

```bash
# Check status (should show no projects learned yet)
in-memoria status

# Learn a small directory
mkdir test-project
cd test-project
echo "console.log('hello')" > index.js
in-memoria learn . --verbose

# Analyze the project
in-memoria analyze .

# Check status again (should show learned project)
in-memoria status
```

### Test MCP Server

Test that the MCP server responds correctly:

```bash
# Start server and send a test request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | in-memoria server

# Should output JSON with list of 8 MCP tools
```

Expected tools:
1. `analyze_codebase` - Deep file/directory analysis
2. `search_codebase` - Multi-mode search
3. `learn_codebase_intelligence` - Build intelligence database
4. `get_project_blueprint` - Instant project context
5. `get_semantic_insights` - Query learned concepts
6. `get_pattern_recommendations` - Pattern suggestions (basic)
7. `predict_coding_approach` - Implementation guidance (basic)
8. `get_intelligence_metrics` - System analytics

### Test with AI Assistant

1. Start your AI assistant with In Memoria configured
2. Ask: "What's the structure of this codebase?"
3. The assistant should call `get_project_blueprint`
4. If recommended, ask the assistant to learn the codebase
5. Try semantic search: "Find authentication code"

### Run Integration Tests (Development)

```bash
cd In-Memoria
bun run build
bun run test:integration
```

---

## Troubleshooting

### Installation Issues

#### "Command not found: in-memoria"

**Solution 1:** Install globally
```bash
npm install -g in-memoria
```

**Solution 2:** Use npx
```bash
npx in-memoria server
```

**Solution 3:** Check npm global path
```bash
npm config get prefix
# Add <prefix>/bin to your PATH
```

#### "Cannot find module 'better-sqlite3'"

The native SQLite module failed to build.

**Solution:**
```bash
# Rebuild native modules
npm rebuild better-sqlite3

# Or reinstall
npm uninstall in-memoria
npm install -g in-memoria
```

#### "Sharp installation failed"

Sharp (image processing) is optional but may cause warnings.

**Solution:**
```bash
# Install platform-specific sharp manually
npm install --platform=darwin --arch=arm64 sharp

# Or ignore if you don't need image analysis
```

### Runtime Issues

#### "Invalid path" error

In Memoria validates all paths for security.

**Common causes:**
- Using absolute paths (use relative paths from project root)
- Path outside project boundaries
- Path traversal attempts (`../..`)

**Solution:**
```bash
# Use relative paths
in-memoria learn .
in-memoria learn ./src

# Or specify project root
in-memoria server /path/to/project
```

#### "Learning takes too long"

Large codebases (100k+ files) take time on first analysis.

**Solutions:**
```bash
# Use quick mode (skip deep analysis)
in-memoria learn . --quick

# Exclude large directories
echo "node_modules/
dist/
.git/" > .gitignore

# Use incremental learning (default)
in-memoria learn .  # Only processes new/changed files
```

#### "Vector search returns empty results"

**Check vector backend:**
```bash
# Ensure vectors are enabled
echo $IN_MEMORIA_VECTOR_BACKEND
# Should be 'builtin' or 'vec', not 'none'

# If using sqlite-vec, verify extension path
echo $IN_MEMORIA_SQLITE_VEC_PATH
# Should point to valid vec0.so/vec0.dylib file
```

**Rebuild index:**
```bash
in-memoria rebuild-index --force
```

#### "MCP server not connecting"

**Check configuration:**
1. Verify command in AI assistant config
2. Test server manually: `in-memoria server`
3. Check logs: `IN_MEMORIA_LOG_LEVEL=debug in-memoria server`

**Common issues:**
- Wrong command path (use full path or ensure in PATH)
- Missing `npx` or `in-memoria` in command
- JSON syntax errors in config file

#### "Model download fails"

Embedding model download requires internet.

**Solutions:**
```bash
# Use cached model
export HUGGINGFACE_HUB_CACHE=/path/to/existing/cache

# Enable offline mode (if model already cached)
export TRANSFORMERS_OFFLINE=true

# Disable vectors entirely
export IN_MEMORIA_VECTOR_BACKEND=none
```

### Platform-Specific Issues

#### macOS: "Cannot verify developer"

**Solution:**
```bash
# Allow the binary
xattr -dr com.apple.quarantine /path/to/in-memoria
```

#### Windows: "Access denied"

**Solution:** Run terminal as Administrator for global install

#### Linux: "Permission denied"

**Solution:**
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then reinstall
npm install -g in-memoria
```

### Getting Help

If you're still experiencing issues:

- **Documentation:** [README.md](README.md), [AGENT.md](AGENT.md), [MCP_SETUP.md](MCP_SETUP.md)
- **GitHub Issues:** [github.com/windyboy/In-Memoria/issues](https://github.com/windyboy/In-Memoria/issues)
- **Discord:** [discord.gg/6mGsM4qkYm](https://discord.gg/6mGsM4qkYm) (@pi_22by7)
- **Email:** [talk@windyboy.me](mailto:talk@windyboy.me)

When reporting issues, include:
- Operating system and version
- Node.js version (`node --version`)
- In Memoria version (`in-memoria --version`)
- Error message or unexpected behavior
- Steps to reproduce

---

## Next Steps

### For End Users

1. **Learn your codebase:** `in-memoria learn .`
2. **Configure AI assistant:** See [MCP_SETUP.md](MCP_SETUP.md)
3. **Start using:** Ask your AI assistant about your code
4. **Explore features:** See [README.md](README.md) for examples

### For AI Assistant Integration

1. **Complete setup:** Follow [MCP_SETUP.md](MCP_SETUP.md) for your specific AI tool
2. **Test connection:** Verify MCP tools are available
3. **Learn workflow:** See [AGENT.md](AGENT.md) for tool usage patterns
4. **Best practices:** Read tool descriptions for optimal usage

### For Contributors

1. **Development setup:** Follow "For Development" section above
2. **Read guidelines:** See [CONTRIBUTING.md](CONTRIBUTING.md)
3. **Understand architecture:** See [CLAUDE.md](CLAUDE.md)
4. **Join community:** Discord and GitHub discussions

### For Learning More

- **Architecture:** [CLAUDE.md](CLAUDE.md) - Three-layer architecture, DI container
- **Security:** [SECURITY.md](SECURITY.md) - Security policy and reporting
- **Changes:** [CHANGELOG.md](CHANGELOG.md) - Version history
- **Tool Reference:** [AGENT.md](AGENT.md) - MCP tools documentation

---

## Quick Reference

### Essential Commands

```bash
# Installation
npm install -g in-memoria

# First use
in-memoria learn .

# Check status
in-memoria status

# Start MCP server
in-memoria server

# Get help
in-memoria --help
```

### Essential Environment Variables

```bash
# Basics
export IN_MEMORIA_LOG_LEVEL=warn          # Logging
export IN_MEMORIA_VECTOR_BACKEND=builtin  # Vector search

# Advanced
export TRANSFORMERS_OFFLINE=true          # Offline mode
export IN_MEMORIA_DB_PATH=/custom/db.db   # Custom DB path
```

### Project Files

```
<project>/
├── in-memoria.db         # Intelligence database (auto-created)
├── in-memoria-vectors.db # Vector index (if using sqlite-vec)
└── .gitignore            # Add *.db to exclude from git
```

---

**Installation complete!** You're ready to give your AI coding assistants persistent memory.

For detailed usage and examples, continue to [README.md](README.md).
