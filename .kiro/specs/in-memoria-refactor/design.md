# In-Memoria Refactor Design Document

## Overview

This design document outlines the three-phase architectural refactor of In-Memoria to transform it from a complex, multi-purpose system into a focused, maintainable CLI + MCP Server infrastructure component. The refactor follows the principle of "先聚合，再删除，先抽象，再收敛" (first aggregate then delete, first abstract then converge) to ensure low-risk, rollback-capable changes.

The current In-Memoria codebase has grown complex with scattered business logic, multiple runtime models, and unclear service boundaries. This refactor will create a system that can be described in one sentence: "In-Memoria learns from codebases and provides semantic analysis and search capabilities."

## Architecture

### Current State Analysis

The existing architecture includes:
- Mixed business logic in CLI and MCP layers
- Multiple engines with overlapping responsibilities
- Scattered data access patterns
- Complex service interactions
- Legacy modules (watchers, automation-tools, monitoring-tools, documentation-generator)
- Multiple vector backend support
- Unclear service boundaries

### Target Architecture

The new architecture implements a strict three-layer approach:

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                          │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   CLI Commands  │           │     MCP Tools           │  │
│  │   (Pure Adapters│           │   (Pure Adapters)       │  │
│  │    No Logic)    │           │     No Logic)           │  │
│  └─────────────────┘           └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │
│  │ AnalysisService │ │ LearningService │ │ SearchService │ │
│  │   (Read Only)   │ │  (Write Only)   │ │  (Read Only)  │ │
│  └─────────────────┘ └─────────────────┘ └───────────────┘ │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │DiagnosticService│           │     DI Container        │  │
│  │   (Read Only)   │           │   (Orchestration)       │  │
│  └─────────────────┘           └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Storage Layer                            │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │   SQLite DB     │           │   Single Vector Store   │  │
│  │ (4 tables only) │           │   (No Multi-Backend)    │  │
│  └─────────────────┘           └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Phase Implementation Strategy

**Phase 1: Foundation & Service Layer (Safe)**
- Create DI Container and Service Layer
- Freeze CLI/MCP contracts
- No deletions, only additions

**Phase 2: Storage Convergence (Data)**
- Implement single writer principle
- Simplify database schema
- Make learning idempotent

**Phase 3: Cleanup & Delivery (Slim)**
- Delete legacy modules
- Enforce interface whitelist
- Implement guardrails

## Components and Interfaces

### 1. Dependency Injection Container

The DI Container provides the single initialization point and manages service lifecycles:

```typescript
interface DIContainer {
  initializeDIContainer(config: { projectPath: string }): Promise<Container>;
  getService<T>(key: ServiceKey<T>): T;
  dispose(): Promise<void>;
}

interface Container {
  analysisService: AnalysisService;
  learningService: LearningService;
  searchService: SearchService;
  diagnosticService: DiagnosticService;
}
```

### 2. Service Layer Interfaces

**AnalysisService (Read-Only)**
```typescript
interface AnalysisService {
  analyzeCodebase(projectPath: string): Promise<CodebaseAnalysis>;
  getLanguageMetrics(projectPath: string): Promise<LanguageMetrics>;
  getComplexityMetrics(projectPath: string): Promise<ComplexityMetrics>;
  extractConcepts(projectPath: string): Promise<SemanticConcept[]>;
}
```

**LearningService (Write-Only)**
```typescript
interface LearningService {
  learnFromCodebase(projectPath: string, options?: LearningOptions): Promise<LearningResult>;
  updateProjectMetadata(projectPath: string, metadata: ProjectMetadata): Promise<void>;
  storeSemanticConcepts(concepts: SemanticConcept[]): Promise<void>;
  storeDeveloperPatterns(patterns: DeveloperPattern[]): Promise<void>;
}
```

**SearchService (Read-Only)**
```typescript
interface SearchService {
  searchSemantic(query: string, options?: SearchOptions): Promise<SemanticSearchResult[]>;
  searchPatterns(query: string, options?: SearchOptions): Promise<PatternSearchResult[]>;
  searchText(query: string, options?: SearchOptions): Promise<TextSearchResult[]>;
}
```

**DiagnosticService (Read-Only)**
```typescript
interface DiagnosticService {
  getLearningStatus(projectPath: string): Promise<LearningStatus>;
  getSystemMetrics(): Promise<SystemMetrics>;
  getIntelligenceMetrics(projectPath: string): Promise<IntelligenceMetrics>;
  getHealthStatus(): Promise<HealthStatus>;
}
```

### 3. Pure Interface Adapters

CLI and MCP interfaces will be pure adapters with no business logic:

```typescript
// CLI Adapter Example
async function handleLearnCommand(args: LearnArgs): Promise<void> {
  const container = await initializeDIContainer({ projectPath: args.path });
  const result = await container.learningService.learnFromCodebase(args.path, {
    force: args.force
  });
  console.log(formatLearningResult(result));
}

// MCP Tool Adapter Example
async function handleLearnCodebaseIntelligence(params: LearnParams): Promise<LearnResult> {
  const container = await initializeDIContainer({ projectPath: params.path });
  return await container.learningService.learnFromCodebase(params.path, params);
}
```

## Data Models

### Core Data Models

```typescript
interface ProjectMetadata {
  projectPath: string;
  lastLearned: Date;
  version: string;
  languages: string[];
  frameworks: string[];
}

interface SemanticConcept {
  id: string;
  name: string;
  type: ConceptType;
  confidence: number;
  context: string;
  relationships: ConceptRelationship[];
}

interface DeveloperPattern {
  id: string;
  name: string;
  category: PatternCategory;
  frequency: number;
  examples: CodeExample[];
}

interface LearningResult {
  success: boolean;
  conceptsLearned: number;
  patternsDiscovered: number;
  duration: number;
  errors: string[];
}
```

### Simplified Database Schema

The refactored system will use only four SQLite tables:

```sql
-- Core semantic concepts discovered in the codebase
CREATE TABLE semantic_concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Developer patterns and conventions
CREATE TABLE developer_patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  examples TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optional feature mapping
CREATE TABLE feature_map (
  id TEXT PRIMARY KEY,
  feature_name TEXT NOT NULL,
  file_paths TEXT, -- JSON array
  confidence REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Project metadata and learning state
CREATE TABLE project_metadata (
  project_path TEXT PRIMARY KEY,
  last_learned DATETIME NOT NULL,
  version TEXT,
  languages TEXT, -- JSON array
  frameworks TEXT, -- JSON array
  stats TEXT -- JSON object
);
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property 1: Interface Layer Purity**
*For any* CLI command or MCP tool invocation, the interface layer should contain no business logic and should only call Service Layer methods with parameter transformation
**Validates: Requirements 1.1, 4.1**

**Property 2: Service Layer Isolation**
*For any* service operation, services should not call each other directly and should maintain strict read/write boundaries according to their designated roles
**Validates: Requirements 1.3, 3.1, 3.2**

**Property 3: Single Writer Principle**
*For any* database write operation, only the LearningService should be allowed to perform INSERT, UPDATE, or DELETE operations on storage systems
**Validates: Requirements 5.1, 5.2**

**Property 4: Container Singleton Behavior**
*For any* service request from the DI Container, the same service instance should be returned and the container should manage exactly four services as singletons
**Validates: Requirements 2.2**

**Property 5: Learning Idempotency**
*For any* learning operation performed multiple times on the same codebase, the results should be identical without data duplication and should only update timestamps
**Validates: Requirements 7.1**

**Property 6: Schema Compliance**
*For any* database operation, the SQLite database should contain only the four specified tables (semantic_concepts, developer_patterns, feature_map, project_metadata)
**Validates: Requirements 6.1**

**Property 7: Error Standardization**
*For any* error condition, all exceptions should be caught and re-thrown as one of the five specified error types (ValidationError, PathError, LearningError, StorageError, SearchError)
**Validates: Requirements 10.1**

**Property 8: Interface Contract Stability**
*For any* MCP tool or CLI command, the interface definitions should remain identical to the frozen baseline throughout the refactor
**Validates: Requirements 4.1**

**Property 9: Code Simplification Metrics**
*For any* measurement of the final codebase, the file count should be reduced by at least 60% and lines of code by at least 50% compared to the baseline
**Validates: Requirements 12.1, 12.2**

**Property 10: Legacy Module Elimination**
*For any* file system check, the specified legacy directories (watchers, automation-tools, monitoring-tools, documentation-generator) should not exist after Phase 3
**Validates: Requirements 8.1**

## Error Handling

### Standardized Error Hierarchy

The refactored system will implement a unified error hierarchy:

```typescript
abstract class InMemoriaError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends InMemoriaError {
  readonly code = 'VALIDATION_ERROR';
  readonly category = 'validation';
}

class PathError extends InMemoriaError {
  readonly code = 'PATH_ERROR';
  readonly category = 'path';
}

class LearningError extends InMemoriaError {
  readonly code = 'LEARNING_ERROR';
  readonly category = 'learning';
}

class StorageError extends InMemoriaError {
  readonly code = 'STORAGE_ERROR';
  readonly category = 'storage';
}

class SearchError extends InMemoriaError {
  readonly code = 'SEARCH_ERROR';
  readonly category = 'search';
}
```

### Error Handling Strategy

All service methods will implement consistent error handling:

```typescript
async function serviceMethod(): Promise<Result> {
  try {
    // Service logic
    return result;
  } catch (error) {
    if (error instanceof InMemoriaError) {
      throw error; // Re-throw our errors
    }
    // Convert external errors to our hierarchy
    throw new StorageError(`Operation failed: ${error.message}`, error);
  }
}
```

## Testing Strategy

### Dual Testing Approach

The implementation will use both unit testing and property-based testing:

**Unit Testing:**
- Test each service in isolation with mocked dependencies
- Test DI Container initialization and service registration
- Test interface adapters for correct parameter transformation
- Test error handling and conversion
- Test database schema migrations

**Property-Based Testing:**
- Use **fast-check** as the property-based testing library for TypeScript
- Configure each property-based test to run a minimum of 100 iterations
- Each property-based test will be tagged with comments referencing the design document properties

**Property-Based Test Requirements:**
- Each correctness property must be implemented by a single property-based test
- Tests must be tagged using the format: `**Feature: in-memoria-refactor, Property {number}: {property_text}**`
- Tests should generate random project paths, configurations, and operations to verify properties hold across all inputs

### Test Data Generation

Property-based tests will use generators for:
- Random project directory structures
- Random codebase content and metadata
- Random learning configurations
- Random search queries and parameters
- Random error conditions

### Integration Testing

Integration tests will verify:
- Full learning-to-search workflows
- CLI command execution and output formatting
- MCP tool schema compliance
- Database migration correctness
- Performance characteristics under load

### Architectural Compliance Testing

Specialized tests will verify:
- No business logic exists in interface layers
- Service isolation and dependency rules
- Single writer principle enforcement
- Error hierarchy compliance
- Code simplification metrics

The testing strategy ensures that the refactor maintains functionality while achieving the architectural goals of simplification and clarity.

## Implementation Phases

### Phase 1: Foundation & Service Layer
- Create DI Container with service registration
- Implement four core services with clear boundaries
- Create pure interface adapters for CLI and MCP
- Freeze existing contracts to prevent regression
- Add comprehensive unit tests for new components

### Phase 2: Storage Convergence
- Implement single writer principle in LearningService
- Migrate to simplified four-table schema
- Make learning process idempotent with ProgressController
- Refactor SemanticEngine to pure calculation utility
- Add integration tests for data consistency

### Phase 3: Cleanup & Delivery
- Delete legacy modules and directories
- Implement interface whitelisting
- Add architectural guardrails and linting rules
- Verify code simplification metrics
- Complete final integration testing

Each phase is designed to be independently deployable and rollback-capable, ensuring low-risk delivery of the architectural transformation.