# In Memoria MCP Tools

8 tools for codebase intelligence via MCP.

## Quick Start

```typescript
// 1. Check project status
const blueprint = await get_project_blueprint();

// 2. Learn if needed
if (blueprint.learningStatus.recommendation === 'learning_recommended') {
  await learn_codebase_intelligence({ path: '.' });
}

// 3. Search and analyze
const results = await search_codebase({ query: 'auth', type: 'semantic' });
const analysis = await analyze_codebase({ path: './src' });
```

## Available Tools

### Core (6 tools - fully working)
- `analyze_codebase` - Analyze files/directories
- `search_codebase` - Search by semantic/text/pattern
- `learn_codebase_intelligence` - Build intelligence database
- `get_project_blueprint` - Get tech stack + learning status
- `get_semantic_insights` - Query learned concepts
- `get_intelligence_metrics` - System health

### Limited (2 tools - placeholder responses)
- `get_pattern_recommendations` - Returns empty
- `predict_coding_approach` - Returns generic response

## Usage

**Start every session:**
```typescript
const blueprint = await get_project_blueprint();
```

**Search code:**
```typescript
// By meaning
await search_codebase({ query: 'user auth', type: 'semantic' });

// By keywords
await search_codebase({ query: 'JWT', type: 'text' });

// By pattern
await search_codebase({ query: 'function.*login', type: 'pattern' });
```

**Analyze code:**
```typescript
await analyze_codebase({ path: './src/auth' });
```

**Learn codebase:**
```typescript
await learn_codebase_intelligence({ path: '.' });
```

That's it. Use the 6 working tools, avoid the 2 limited ones.