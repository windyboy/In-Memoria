---
inclusion: always
---

# In Memoria MCP Tools

8 codebase intelligence tools available.

## Working Tools (8) - All Fixed!
- `mcp_in_memoria_get_project_blueprint` - Tech stack + learning status ✅
- `mcp_in_memoria_learn_codebase_intelligence` - Build intelligence (~30-60s) ✅
- `mcp_in_memoria_search_codebase` - Search semantic/text/pattern with database fallback ✅
- `mcp_in_memoria_analyze_codebase` - Analyze files/directories ✅
- `mcp_in_memoria_get_semantic_insights` - Query learned concepts ✅
- `mcp_in_memoria_get_intelligence_metrics` - System health ✅
- `mcp_in_memoria_get_pattern_recommendations` - Pattern recommendations from codebase ✅
- `mcp_in_memoria_predict_coding_approach` - Intelligent file routing and approach prediction ✅

## Recent Fixes (Restart MCP server to apply)
1. **Search with fallback** - Added database fallback when vector search fails
2. **Pattern recommendations** - Now returns actual patterns from the codebase
3. **Coding approach** - Provides intelligent file suggestions based on problem description
4. **Database access** - Exposed database through AnalysisService for read operations

## Usage

**Always start with:**
```typescript
const blueprint = await mcp_in_memoria_get_project_blueprint();
if (blueprint.learningStatus.recommendation === 'learning_recommended') {
  await mcp_in_memoria_learn_codebase_intelligence({ path: '.' });
}
```

**Then search/analyze:**
```typescript
await mcp_in_memoria_search_codebase({ query: 'auth', type: 'semantic' });
await mcp_in_memoria_analyze_codebase({ path: './src' });
```

**Get intelligent recommendations:**
```typescript
await mcp_in_memoria_get_pattern_recommendations({ problemDescription: 'create a new service' });
await mcp_in_memoria_predict_coding_approach({ problemDescription: 'add MCP tool' });
```

All 8 tools are now fully functional!