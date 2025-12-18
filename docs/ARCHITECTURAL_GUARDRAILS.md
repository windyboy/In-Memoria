# Architectural Guardrails

This document describes the architectural constraints and verification mechanisms implemented to maintain the In-Memoria refactor's architectural integrity.

## Overview

The architectural guardrails enforce the three-layer architecture and prevent regression to the complex, tightly-coupled system that existed before the refactor.

## Architectural Constraints

### 1. Layer Separation
- **CLI Layer**: Cannot import from `src/core/*`. Must use DI container through bootstrap.
- **MCP Layer**: Cannot import from `src/core/*` directly. Must use DI container through adapters.
- **Service Layer**: Services cannot import each other directly (except DiagnosticService reading from others).

### 2. File Watching Prohibition
- No `fs.watch` or `fs.watchFile` usage anywhere in the codebase
- No `chokidar` imports or usage
- Prevents return to complex watcher-based architecture

### 3. Interface Layer Purity
- CLI commands should contain minimal business logic
- MCP adapters should only perform parameter transformation
- Business logic belongs in the Service Layer

## Verification Scripts

### 1. Runtime Verification (`scripts/verify-architecture.ts`)

Checks for immediate architectural violations:
- CLI imports from core layer
- File watching usage
- Direct service-to-service imports

**Usage:**
```bash
npm run verify-architecture
```

### 2. Build-time Verification (`scripts/build-time-verification.ts`)

Comprehensive architectural analysis:
- Service isolation scoring
- Interface layer purity analysis
- Dependency graph validation
- Code metrics calculation

**Usage:**
```bash
npm run verify-build
```

## Pre-commit Hooks

The pre-commit hook (`.git/hooks/pre-commit`) automatically runs:
1. Architectural verification
2. TypeScript type checking
3. Unit tests

This prevents commits that violate architectural constraints.

## Integration with Build Process

The build process includes architectural verification:
```bash
npm run build  # Includes verify-architecture check
```

## Metrics and Thresholds

### Service Isolation Score
- **Target**: ≥80%
- **Measures**: Percentage of services that don't import other services directly

### Interface Purity Score
- **Target**: ≥80%
- **Measures**: Percentage of interface files without complex business logic

## Violation Types

### `no-cli-core-imports`
CLI files importing from core layer. Use DI container instead.

### `no-fs-watch`
Usage of `fs.watch` or `fs.watchFile`. File watching is prohibited.

### `no-chokidar`
Import of chokidar library. File watching is prohibited.

### `no-service-coupling`
Services importing each other directly. Use DI container for orchestration.

### `layer-violation`
Business logic in interface layers or other architectural boundary violations.

## Fixing Violations

### CLI Core Imports
**Before:**
```typescript
import { AnalysisService } from '../core/services/AnalysisService.js';
```

**After:**
```typescript
import { initializeDIContainer } from '../core/bootstrap.js';
const container = await initializeDIContainer({ projectPath });
const result = await container.analysisService.analyzeCodebase(projectPath);
```

### Service Coupling
**Before:**
```typescript
import { LearningService } from './LearningService.js';
```

**After:**
Use DI container for orchestration or restructure to avoid direct dependencies.

### Interface Layer Business Logic
Move complex logic from CLI/MCP adapters to appropriate services.

## Continuous Monitoring

The guardrails provide continuous monitoring through:
- Pre-commit hooks (developer workflow)
- Build-time verification (CI/CD pipeline)
- Manual verification commands (debugging)

## Enforcement Levels

1. **Pre-commit**: Blocks commits with violations
2. **Build-time**: Fails builds with violations
3. **Manual**: Provides detailed violation reports

This multi-level enforcement ensures architectural integrity is maintained throughout the development lifecycle.