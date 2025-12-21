In-Memoria/docs/MCP_SETUP.md
# In-Memoria MCP Server Setup Guide

## Overview

In-Memoria is an intelligent MCP (Model Context Protocol) server that provides codebase intelligence through semantic analysis, pattern recognition, and smart navigation. It learns from your codebase and provides contextual insights to help with development tasks.

## Features

- **Three-Layer Architecture**: Clean separation between interface, service, and storage layers
- **Dependency Injection**: Centralized service management through DI container
- **Service Layer**: Four core services (Analysis, Learning, Search, Diagnostic) with clear boundaries
- **Semantic Code Search**: Find code by meaning, not just keywords
- **Pattern Recognition**: Discover and apply coding patterns from your codebase
- **Intelligent Code Analysis**: Understand code complexity, languages, and frameworks
- **Smart File Routing**: Navigate to relevant files based on problem descriptions
- **Coding Approach Suggestions**: Get implementation guidance based on learned patterns
- **Vector Search**: Fast semantic search using embeddings (supports Qdrant or SurrealDB)
- **Architectural Guardrails**: Build-time verification enforces design principles

## Prerequisites

### Required
- **Node.js**: Version 18 or higher
- **npm** or **bun**: For package management
- **Git**: For cloning the repository

### Optional (Recommended)
- **Qdrant**: Vector database for scalable semantic search
  - Install via Docker: `docker run -p 6333:6333 qdrant/qdrant`
  - Or use cloud-hosted Qdrant
- **Python**: For some analysis features (auto-detected)

## Architecture

In-Memoria follows a **three-layer architecture** with dependency injection for clean separation of concerns:

1. **Interface Layer** - CLI commands and MCP tools act as pure adapters with no business logic
2. **Service Layer** - Four core services managed through DI container:
   - `AnalysisService` - Read-only codebase analysis and metrics
   - `LearningService` - Write-only learning operations (enforces single writer principle)
   - `SearchService` - Unified semantic, text, and pattern-based search
   - `DiagnosticService` - System health and diagnostic information
3. **Storage Layer** - SQLite for structured data, unified vector store abstraction (Qdrant or SurrealDB)

All business logic flows through the service layer, ensuring maintainability and testability. Architectural guardrails enforce layer separation and prevent regression.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/In-Memoria.git
cd In-Memoria
```

### 2. Install Dependencies

```bash
# Using npm
npm install

# Or using bun (recommended for better performance)
bun install
```

### 3. Build the Project

```bash
npm run build
```

### 4. Verify Installation

```bash
# Test basic functionality
node dist/index.js --help

# Or with bun
bun run index.js --help
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Vector Database Configuration
IN_MEMORIA_VECTOR_BACKEND=qdrant  # or 'surreal' for local storage
QDRANT_URL=http://localhost:6333  # Qdrant endpoint
QDRANT_API_KEY=your_api_key       # If required
QDRANT_COLLECTION=in-memoria      # Collection name

# Performance Configuration
IN_MEMORIA_BATCH_SIZE=50          # File processing batch size
IN_MEMORIA_MAX_CONCURRENT=10      # Max concurrent operations
IN_MEMORIA_EMBEDDING_CACHE_SIZE=1000  # Embedding cache size
IN_MEMORIA_EMBEDDING_CACHE_DIR=~/.cache/huggingface/hub  # Optional: prefer Hugging Face cache location

# Logging
IN_MEMORIA_LOG_LEVEL=info         # error, warn, info, debug
IN_MEMORIA_PERFORMANCE_LOGGING=true  # Enable performance metrics

# Database
IN_MEMORIA_DB_FILENAME=in-memoria.db  # SQLite database filename
```

### Configuration File (Optional)

You can also create a `config.json` file:

```json
{
  "vectorBackend": "qdrant",
  "qdrant": {
    "url": "http://localhost:6333",
    "apiKey": "your_api_key",
    "collection": "in-memoria"
  },
  "performance": {
    "batchSize": 50,
    "maxConcurrentFiles": 10
  },
  "logging": {
    "level": "info",
    "enablePerformanceLogging": true
  }
}
```

## MCP Client Setup

### Claude Desktop

1. **Locate Configuration File**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add In-Memoria Server**:

```json
{
  "mcpServers": {
    "in-memoria": {
      "command": "node",
      "args": ["/path/to/in-memoria/dist/index.js", "mcp"],
      "env": {
        "IN_MEMORIA_VECTOR_BACKEND": "qdrant",
        "QDRANT_URL": "http://localhost:6333",
        "QDRANT_COLLECTION": "in-memoria"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

### VS Code + Claude Extension

1. **Install Claude Extension** for VS Code
2. **Configure MCP Server** in VS Code settings:

```json
{
  "claude.mcp.servers": {
    "in-memoria": {
      "command": "node",
      "args": ["/path/to/in-memoria/dist/index.js", "mcp"],
      "env": {
        "IN_MEMORIA_VECTOR_BACKEND": "qdrant",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

### Other MCP Clients

For other MCP-compatible clients, use this server configuration:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/in-memoria/dist/index.js", "mcp"],
  "env": {
    "IN_MEMORIA_VECTOR_BACKEND": "qdrant",
    "QDRANT_URL": "http://localhost:6333",
    "QDRANT_COLLECTION": "in-memoria"
  }
}
```

## Initial Learning

Before using In-Memoria effectively, you need to learn from your codebase:

### Learn from a Project

```bash
# Learn from current directory
in-memoria learn .

# Learn from specific directory
in-memoria learn /path/to/your/project

# Force re-learning (useful after major changes)
in-memoria learn . --force

# Learn with progress updates
in-memoria learn . --progress
```

### What Learning Does

1. **Code Analysis**: Analyzes all supported files in the project
2. **Semantic Extraction**: Extracts concepts, functions, classes, and relationships
3. **Pattern Discovery**: Identifies coding patterns and conventions
4. **Vector Embeddings**: Creates searchable embeddings (stored in Qdrant or locally)
5. **Project Blueprint**: Stores project structure, entry points, and architecture

### Learning Output

```
🧠 Starting intelligent learning from: /path/to/project

📁 Database path resolved to: /path/to/project/in-memoria.db
🔍 Phase 1: Analyzing codebase structure...
🧠 Phase 2: Learning semantic concepts...
🔄 Phase 3: Discovering coding patterns...
🔗 Phase 4: Analyzing relationships...
💾 Phase 5: Storing intelligence...
🔍 Phase 6: Building semantic search index...
🗺️  Phase 7: Building feature map...
💾 Phase 8: Storing project blueprint...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Concepts:  1,234
🔍 Patterns:  89
🗺️  Features:  45
📁 Files:     156
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Available MCP Tools

### Core Analysis Tools

#### `analyze_codebase`
Analyze files or directories for insights.

```typescript
// Analyze a specific file
await use_mcp_tool('in-memoria', 'analyze_codebase', {
  path: '/path/to/file.ts'
});

// Analyze entire directory
await use_mcp_tool('in-memoria', 'analyze_codebase', {
  path: '/path/to/directory'
});
```

Returns: Languages, frameworks, complexity, concepts, patterns.

#### `search_codebase`
Search for code semantically or by text.

```typescript
// Semantic search (finds by meaning)
await use_mcp_tool('in-memoria', 'search_codebase', {
  query: 'authentication logic',
  type: 'semantic',
  limit: 10
});

// Text search (fast keyword matching)
await use_mcp_tool('in-memoria', 'search_codebase', {
  query: 'loginUser',
  type: 'text'
});
```

### Intelligence Tools

#### `get_project_blueprint`
Get instant project context.

```typescript
await use_mcp_tool('in-memoria', 'get_project_blueprint', {
  path: '/path/to/project',
  includeFeatureMap: true
});
```

Returns: Tech stack, entry points, key directories, architecture, learning status.

#### `predict_coding_approach`
Get implementation suggestions.

```typescript
await use_mcp_tool('in-memoria', 'predict_coding_approach', {
  problemDescription: 'Add user authentication',
  context: { currentFile: 'src/auth.js' },
  includeFileRouting: true
});
```

Returns: Approach, confidence, patterns, file routing suggestions.

#### `get_pattern_recommendations`
Get pattern suggestions for consistency.

```typescript
await use_mcp_tool('in-memoria', 'get_pattern_recommendations', {
  problemDescription: 'Create API endpoint',
  currentFile: 'src/routes/users.js',
  includeRelatedFiles: true
});
```

Returns: Patterns, examples, confidence scores, related files.

#### `learn_codebase_intelligence`
Deep learning from codebase (use `auto_learn_if_needed` instead).

#### `auto_learn_if_needed`
Smart learning that runs only when needed.

```typescript
await use_mcp_tool('in-memoria', 'auto_learn_if_needed', {
  path: '/path/to/project',
  includeProgress: true
});
```

### Monitoring Tools

#### `get_system_status`
Check database and learning state.

#### `get_intelligence_metrics`
View concept and pattern counts.

#### `get_performance_status`
Check vector database health.

#### `health_check`
Verify setup and configuration.

## Usage Examples

### Example 1: Starting a New Feature

```typescript
// 1. Get project context
const blueprint = await use_mcp_tool('in-memoria', 'get_project_blueprint', {
  path: './src',
  includeFeatureMap: true
});

// 2. Get implementation approach
const approach = await use_mcp_tool('in-memoria', 'predict_coding_approach', {
  problemDescription: 'Add user profile editing feature',
  includeFileRouting: true
});

// 3. Get pattern recommendations
const patterns = await use_mcp_tool('in-memoria', 'get_pattern_recommendations', {
  problemDescription: 'Profile editing with validation',
  currentFile: approach.fileRouting.suggestedStartPoint
});
```

### Example 2: Understanding Unfamiliar Code

```typescript
// Analyze the code
const analysis = await use_mcp_tool('in-memoria', 'analyze_codebase', {
  path: './src/auth'
});

// Find related concepts
const insights = await use_mcp_tool('in-memoria', 'get_semantic_insights', {
  query: 'authentication'
});

// Search for usage examples
const examples = await use_mcp_tool('in-memoria', 'search_codebase', {
  query: 'auth.login',
  type: 'text'
});
```

## Troubleshooting

### Common Issues

#### 1. "Vector database not initialized"

**Cause**: Qdrant collection not created or connection failed.

**Solution**:
```bash
# Check Qdrant status
curl http://localhost:6333/health

# Re-run learning
in-memoria learn /path/to/project --force
```

#### 2. "No intelligence data available"

**Cause**: Learning hasn't been run or database is missing.

**Solution**:
```bash
# Run initial learning
in-memoria learn .

# Check database exists
ls -la in-memoria.db
```

#### 3. "Failed to connect to Qdrant"

**Cause**: Qdrant not running or wrong URL.

**Solution**:
```bash
# Start Qdrant
docker run -p 6333:6333 qdrant/qdrant

# Check environment variables
echo $QDRANT_URL
echo $IN_MEMORIA_VECTOR_BACKEND
```

#### 4. "MCP server not responding"

**Cause**: Server crashed or configuration error.

**Solution**:
```bash
# Check server logs
node dist/index.js mcp 2>&1

# Verify configuration
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Performance Issues

#### Slow Learning
- Reduce batch size: `IN_MEMORIA_BATCH_SIZE=25`
- Limit concurrent operations: `IN_MEMORIA_MAX_CONCURRENT=5`
- Use SSD storage for database

#### High Memory Usage
- Reduce embedding cache: `IN_MEMORIA_EMBEDDING_CACHE_SIZE=500`
- Process smaller directories at a time

### Database Issues

#### Corrupt Database
```bash
# Remove and re-learn
rm in-memoria.db
in-memoria learn . --force
```

#### Large Database
- Use external Qdrant for vectors
- Archive old projects: `mv old-project old-project-archive`

## Advanced Configuration

### Custom Embedding Models

```bash
# Use different model
IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
IN_MEMORIA_EMBEDDING_DIMENSION=384

# Adjust pooling strategy
IN_MEMORIA_EMBEDDING_POOLING=mean  # or 'cls'
IN_MEMORIA_EMBEDDING_NORMALIZE=true

# Control embedding cache location (Hugging Face-style layout)
# Priority: IN_MEMORIA_EMBEDDING_CACHE_DIR > HUGGINGFACE_HUB_CACHE > HF_HOME/hub
IN_MEMORIA_EMBEDDING_CACHE_DIR=~/.cache/huggingface/hub
HUGGINGFACE_HUB_CACHE=~/.cache/huggingface/hub
HF_HOME=~/.cache/huggingface

# Force offline/local-only embeddings (requires cached assets in the Hugging Face cache)
IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=true
# TRANSFORMERS_OFFLINE is recognized for compatibility, but TRANSFORMERS_CACHE is intentionally ignored
```

### Multiple Projects

Each project gets its own database and vector collection:

```
/project1/
  in-memoria.db
  # Qdrant collection: project1-intelligence

/project2/
  in-memoria.db
  # Qdrant collection: project2-intelligence
```

### CI/CD Integration

```yaml
# .github/workflows/learn.yml
name: Learn Codebase
on: [push, pull_request]

jobs:
  learn:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npx in-memoria learn .
        env:
          IN_MEMORIA_VECTOR_BACKEND: qdrant
          QDRANT_URL: ${{ secrets.QDRANT_URL }}
```

## Contributing

### Development Setup

```bash
# Clone and setup
git clone https://github.com/your-org/In-Memoria.git
cd In-Memoria
bun install

# Development build
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Adding New Tools

1. Add tool definition in `src/mcp-server/tools/`
2. Update validation schemas in `src/mcp-server/validation.ts`
3. Add to server routing in `src/mcp-server/server.ts`
4. Update documentation

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/In-Memoria/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/In-Memoria/discussions)
- **Documentation**: [Full API Docs](./API_REFERENCE.md)

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
