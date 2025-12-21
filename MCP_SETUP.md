# In-Memoria MCP Server Setup Guide

This guide walks you through setting up the In-Memoria MCP server for use with AI assistants like Claude Desktop, GitHub Copilot, and other MCP-compatible tools.

## Prerequisites

- Node.js 18+ installed
- npm or npx available
- AI assistant that supports MCP (Claude Desktop, GitHub Copilot, etc.)

## Quick Setup

### 1. Install In-Memoria

```bash
# Install globally (recommended)
npm install -g in-memoria

# Or use directly with npx (no installation needed)
npx in-memoria --version
```

### 2. Test the Installation

```bash
# Check if installation worked
in-memoria --version

# Test the MCP server (should show available tools)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | in-memoria server
```

## AI Assistant Integration

### Claude Desktop

Add In-Memoria to your Claude Desktop configuration:

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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

**Alternative with global installation**:
```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "in-memoria",
      "args": ["server"],
      "env": {
        "IN_MEMORIA_LOG_LEVEL": "warn"
      }
    }
  }
}
```

### Claude Code CLI

```bash
# Add In-Memoria as an MCP server
claude mcp add in-memoria -- npx in-memoria server

# Or with global installation
claude mcp add in-memoria -- in-memoria server
```

### GitHub Copilot (VS Code)

In-Memoria works with GitHub Copilot through custom instructions. This repository includes:

1. **Automatic Instructions**: `.github/copilot-instructions.md` provides automatic guidance
2. **Chat Modes**: `.github/chatmodes/` contains specialized modes:
   - `inmemoria-explorer` - Intelligent codebase navigation
   - `inmemoria-feature` - Feature implementation with patterns
   - `inmemoria-review` - Code review with consistency checking

To use in VS Code:
1. Command Palette → "Chat: Configure Chat Modes..."
2. Select a mode from `.github/chatmodes/`

### Kiro IDE

Add to your Kiro MCP configuration (`.kiro/settings/mcp.json`):

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

## Configuration Options

### Environment Variables

Set these before starting the MCP server:

```bash
# Logging level (error, warn, info, debug)
export IN_MEMORIA_LOG_LEVEL=warn

# Custom database location
export IN_MEMORIA_DB_PATH=/path/to/custom/db

# SurrealDB sync for crash safety (recommended)
export SURREAL_SYNC_DATA=true

# Embedding model settings
export IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
export IN_MEMORIA_EMBEDDING_DIMENSION=384
export IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=true

# Hugging Face cache configuration (use your existing cache)
export IN_MEMORIA_EMBEDDING_CACHE_DIR=C:\Users\windy\.cache\huggingface\hub
# Alternative: Use standard Hugging Face environment variables
export HUGGINGFACE_HUB_CACHE=C:\Users\windy\.cache\huggingface\hub
export HF_HOME=C:\Users\windy\.cache\huggingface

# Disable remote model downloads (use local cache only)
export TRANSFORMERS_OFFLINE=true
```

### Project-Specific Setup

You can run the MCP server scoped to a specific project:

```bash
# Start server for specific project
in-memoria server /path/to/your/project

# Or let tools receive project paths dynamically (recommended)
in-memoria server
```

### Using Your Existing Hugging Face Cache

If you've already downloaded models using `huggingface-hub` (like you did with `hf download`), In-Memoria can use your existing cache:

**Quick Start (Windows):**

Use the provided helper scripts:
```powershell
# PowerShell
.\setup-embedding-cache.ps1

# Or CMD
setup-embedding-cache.bat
```

**Manual Setup - Windows (PowerShell):**
```powershell
# Set environment variables to use your existing cache
$env:HUGGINGFACE_HUB_CACHE="C:\Users\windy\.cache\huggingface\hub"
$env:TRANSFORMERS_OFFLINE="true"
$env:IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY="true"

# Start the MCP server
npx in-memoria server
```

**Manual Setup - Windows (CMD):**
```cmd
set HUGGINGFACE_HUB_CACHE=C:\Users\windy\.cache\huggingface\hub
set TRANSFORMERS_OFFLINE=true
set IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=true

npx in-memoria server
```

**For permanent configuration**, add these to your system environment variables or create a `.env` file in your project directory:

```env
HUGGINGFACE_HUB_CACHE=C:\Users\windy\.cache\huggingface\hub
TRANSFORMERS_OFFLINE=true
IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=true
IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
IN_MEMORIA_EMBEDDING_DIMENSION=384
```

**Verify your cache location:**
Your model should be at:
```
C:\Users\windy\.cache\huggingface\hub\models--Xenova--all-MiniLM-L6-v2\snapshots\[hash]\
```

## Available Tools

The MCP server provides 8 tools organized into 3 categories:

### Core Analysis (2 tools)
- `analyze_codebase` - Deep analysis of files/directories
- `search_codebase` - Multi-mode search (semantic/text/pattern)

### Intelligence (5 tools)
- `learn_codebase_intelligence` - Build intelligence database
- `get_project_blueprint` - Instant project context
- `get_semantic_insights` - Query learned code symbols
- `get_pattern_recommendations` - Get coding patterns ⚠️ (basic implementation)
- `predict_coding_approach` - Implementation guidance ⚠️ (basic implementation)

### Monitoring (1 tool)
- `get_intelligence_metrics` - Analytics on learned concepts

## First Usage Workflow

1. **Start your AI assistant** with In-Memoria configured
2. **Get project context**: Ask for project blueprint
3. **Learn the codebase**: If recommended, run learning
4. **Use intelligence**: Search, analyze, and get insights

Example conversation with Claude:
```
You: "What's the structure of this codebase?"
Claude: *calls get_project_blueprint*
Claude: "I can see this is a TypeScript project with React frontend and Express API. Let me learn more about it."
Claude: *calls learn_codebase_intelligence*
Claude: "Now I have full intelligence about your codebase. What would you like to work on?"
```

## Troubleshooting

### Common Issues

**"Command not found: in-memoria"**
- Install globally: `npm install -g in-memoria`
- Or use npx: `npx in-memoria server`

**"Invalid path" error**
- Check that the path exists and is accessible
- Use absolute paths or ensure working directory is correct

**MCP server not connecting**
- Check your AI assistant's MCP configuration
- Verify the command and arguments are correct
- Check logs for error messages

**Learning takes too long**
- Large codebases (100k+ files) can take time on first analysis
- Use `force: false` to avoid re-learning when not needed
- Consider excluding build artifacts and node_modules

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# Set debug level
export IN_MEMORIA_LOG_LEVEL=debug

# Start server with debug output
in-memoria server
```

### Health Check

Test if the server is working:

```bash
# Check system status
in-memoria status

# Test learning on a small directory
in-memoria learn ./src --dry-run
```

## Performance Tips

1. **Use learning status**: Always check `get_project_blueprint` first
2. **Avoid re-learning**: Only use `force: true` when codebase changes significantly
3. **Limit search results**: Use `limit` parameter in search tools
4. **Project scoping**: Run server scoped to specific projects for better performance

## Security Notes

- All data stays local (SQLite + SurrealDB for vectors)
- No telemetry or phone-home functionality
- Path validation prevents access outside project boundaries
- Rate limiting protects against DoS attacks

## Support

- **Documentation**: [README.md](README.md) and [AGENT.md](AGENT.md)
- **Issues**: [GitHub Issues](https://github.com/windyboy/In-Memoria/issues)
- **Discord**: [discord.gg/6mGsM4qkYm](https://discord.gg/6mGsM4qkYm)
- **Email**: [talk@windyboy.me](mailto:talk@windyboy.me)

---

**Next Steps**: Once set up, see [AGENT.md](AGENT.md) for detailed tool usage patterns and best practices.