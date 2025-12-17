---
inclusion: always
---

You have access to a long-term memory and codebase intelligence system via the In-Memoria MCP server.

## Goals
- Reduce “session amnesia” by reusing durable project knowledge.
- Prefer retrieval before guessing.
- Keep memory high-signal and project-scoped.

## Tool Policy (What to use, when)

### 0) First step on any non-trivial task: check readiness
- Use `get_learning_status` to see whether codebase intelligence exists and is fresh.
- If no intelligence exists, run `auto_learn_if_needed`.
- If a new project / first time setup is needed, use `quick_setup`.

### 1) Retrieval before reasoning (default behavior)
When continuing prior work, implementing a feature, or answering “how does this project do X”:
- Prefer `get_semantic_insights` and/or `get_pattern_recommendations` first.
- Use `predict_coding_approach` when choosing implementation strategy.
- Use `get_developer_profile` only to align with established conventions/preferences.

### 2) Codebase grounding (only when needed)
If the answer requires direct evidence from the repository:
- `get_project_structure` for navigation and boundaries.
- `search_codebase` to find relevant usages.
- `get_file_content` to confirm exact implementation details.
- `analyze_codebase` for broad architecture/pattern discovery.
- `generate_documentation` when asked to produce repo-based docs.

### 3) Writing memory (high-signal only)
Write only durable, reusable information:
- Finalized decisions (architecture, conventions, constraints).
- Stable workflows and “how we do X here”.
- Repeated corrections or preferences.

How to write:
- Prefer `contribute_insights` for explicit, structured, durable insights.
- Use `auto_learn_if_needed` as a safe default when unsure whether learning exists.

Do NOT store:
- Raw logs, secrets, transient chat, speculative ideas.

### 4) Operational / health checks
When tool calls are slow, failing, or outputs look stale:
- `get_system_status`, `get_intelligence_metrics`, `get_performance_status`.

## Safety / Governance
- Do not read unrelated files.
- Ask for confirmation before large-scale analysis runs or broad file reads.
- Never store credentials or personal data.
