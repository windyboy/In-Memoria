# Requirements Document

## Introduction

The In-Memoria project requires a three-phase architectural refactor to converge into a focused, maintainable CLI + MCP Server infrastructure component. This refactor follows the principle of "先聚合，再删除" (first aggregate, then delete) to ensure low-risk, rollback-capable changes. The goal is to create a system that provides only learning, analysis, and search capabilities with clear service boundaries and unified data flow.

## Glossary

- **Service_Layer**: The core application services (AnalysisService, LearningService, SearchService, DiagnosticService)
- **DI_Container**: Dependency injection container managing service singletons
- **MCP_Tools**: Model Context Protocol tools with frozen schemas
- **CLI_Interface**: Command-line interface with frozen argument structures
- **Storage_System**: SQLite + single vector backend implementation
- **Learning_Process**: Unified, idempotent codebase analysis and storage process
- **Legacy_Modules**: Modules to be removed in Phase 3 (watchers, automation-tools, monitoring-tools, documentation-generator)
- **ProgressController**: Unified progress tracking for all learning operations

## Global Architecture Constraints (Non-Negotiable)

### Requirement 1

**User Story:** As a system architect, I need maximum simplification constraints that apply to all phases and the final deliverable.

#### Acceptance Criteria

1. WHEN CLI and MCP interfaces operate THEN they SHALL use the exact same Service_Layer methods with absolutely no business logic in the interface layer
2. WHEN the system runs THEN it SHALL NOT run background watchers or persistent processes except the MCP stdio server itself
3. WHEN services are designed THEN they SHALL NOT import or call each other directly in a circular manner and SHALL be orchestrated or strictly layered
4. WHEN storage is accessed THEN only Service_Layer components SHALL be allowed to bypass this constraint
5. WHEN new features are proposed THEN they SHALL be rejected unless they align strictly with the core learning/analysis/search mission and reduce overall complexity

## Phase 1: Foundation & Service Layer (The "Safe" Phase)

### Requirement 2

**User Story:** As an architect, I need a single point of initialization for the new service layer.

#### Acceptance Criteria

1. WHEN the system initializes THEN it SHALL export a single `initializeDIContainer({ projectPath })` function
2. WHEN the container is created THEN it SHALL manage AnalysisService, LearningService, SearchService, and DiagnosticService as Singletons
3. WHEN the container initializes THEN it SHALL NOT trigger any database writes or heavy computation
4. WHEN services are accessed THEN they SHALL be retrieved through the DI_Container exclusively
5. WHEN the container is used THEN it SHALL provide clean dependency resolution without circular references

### Requirement 3

**User Story:** As a developer, I need clear separation of concerns between services.

#### Acceptance Criteria

1. WHEN AnalysisService operates THEN it SHALL return code metrics and metadata only and MUST NOT write to database
2. WHEN SearchService operates THEN it SHALL perform read-only queries and MUST NOT write to database
3. WHEN DiagnosticService operates THEN it SHALL return system health and stats and MUST NOT write to database
4. WHEN LearningService operates THEN it SHALL be the ONLY service allowed to invoke Storage write methods
5. WHEN services interact THEN they SHALL maintain strict read/write boundaries without cross-service calls

### Requirement 4

**User Story:** As an MCP user, I need the tool interface to remain identical during the refactor.

#### Acceptance Criteria

1. WHEN MCP tools are accessed THEN existing MCP Tool definitions and JSON Schema SHALL be frozen and match legacy implementation exactly
2. WHEN CLI commands are used THEN command arguments for learn, analyze, and server SHALL be frozen
3. WHEN new Service methods are created THEN they SHALL be mapped to frozen interfaces via Pure Adapters with no logic in the adapter
4. WHEN the refactor progresses THEN existing integrations SHALL continue working without modification
5. WHEN interface changes are needed THEN they SHALL be explicitly approved and documented

## Phase 2: Storage Convergence (The "Data" Phase)

### Requirement 5

**User Story:** As a data engineer, I need to prevent database locks and race conditions through single writer principle.

#### Acceptance Criteria

1. WHEN the codebase is searched THEN INSERT, UPDATE, DELETE SQL statements SHALL exist ONLY within LearningService or its repository layer
2. WHEN vector operations occur THEN vector store upsert operations SHALL exist ONLY within LearningService
3. WHEN SemanticEngine is refactored THEN it SHALL become a pure calculation utility that is stateless or be removed entirely
4. WHEN data writes happen THEN they SHALL be coordinated through the single LearningService entry point
5. WHEN concurrent operations occur THEN the single writer pattern SHALL prevent race conditions

### Requirement 6

**User Story:** As a maintainer, I need a simple, understandable database structure.

#### Acceptance Criteria

1. WHEN the database schema is finalized THEN SQLite SHALL contain ONLY semantic_concepts, developer_patterns, feature_map, and project_metadata tables
2. WHEN schema migration occurs THEN a migration script SHALL exist to drop unused legacy tables
3. WHEN vector storage is used THEN it SHALL use a single, unified backend implementation with no runtime switching
4. WHEN storage is accessed THEN the simplified schema SHALL support all required functionality
5. WHEN data is persisted THEN it SHALL follow the consolidated table structure exclusively

### Requirement 7

**User Story:** As a user, I want to be able to re-run "learn" without errors.

#### Acceptance Criteria

1. WHEN `in-memoria learn` runs on an already learned codebase THEN it SHALL update the timestamp but not duplicate data
2. WHEN learning processes execute THEN they SHALL use ProgressController to report status to CLI and MCP
3. WHEN learning processes are interrupted THEN they SHALL handle SIGINT gracefully and close DB connections without corruption
4. WHEN learning is repeated THEN the process SHALL be idempotent and produce consistent results
5. WHEN learning state is queried THEN the system SHALL accurately report progress and completion status

## Phase 3: Cleanup & Delivery (The "Slim" Phase)

### Requirement 8

**User Story:** As a developer, I want maximum code simplification with no distractions.

#### Acceptance Criteria

1. WHEN legacy cleanup occurs THEN src/watchers, src/automation-tools, src/monitoring-tools, and src/documentation-generator directories SHALL be physically deleted
2. WHEN old components are removed THEN legacy SearchEngine and old Service classes SHALL be deleted
3. WHEN the cleanup is complete THEN no legacy modules SHALL remain in the codebase
4. WHEN the refactor finishes THEN the codebase SHALL have significantly reduced file count and conceptual complexity by at least 50%
5. WHEN maintenance occurs THEN developers SHALL find a simplified, focused codebase structure with minimal cognitive overhead

### Requirement 9

**User Story:** As a product owner, I want to enforce maximum simplification of the feature set.

#### Acceptance Criteria

1. WHEN CLI commands are finalized THEN only server, learn, analyze, and status SHALL exist with no additional commands or flags
2. WHEN MCP tools are finalized THEN only analyze_codebase, learn_codebase_intelligence, search_codebase, get_project_blueprint, get_pattern_recommendations, and get_intelligence_metrics SHALL exist with no additional tools
3. WHEN the system operates THEN no daemon, watcher, or persistent service functionality SHALL exist
4. WHEN features are accessed THEN they SHALL be limited strictly to the core learning/analysis/search capabilities with no feature creep
5. WHEN the product is delivered THEN it SHALL have a clear, single-sentence description: "In-Memoria learns from codebases and provides semantic analysis and search capabilities"

### Requirement 10

**User Story:** As a consumer, I need predictable error codes.

#### Acceptance Criteria

1. WHEN validation errors occur THEN all exceptions SHALL be caught and re-thrown as ValidationError
2. WHEN path errors occur THEN all exceptions SHALL be caught and re-thrown as PathError
3. WHEN learning errors occur THEN all exceptions SHALL be caught and re-thrown as LearningError
4. WHEN storage errors occur THEN all exceptions SHALL be caught and re-thrown as StorageError
5. WHEN search errors occur THEN all exceptions SHALL be caught and re-thrown as SearchError

## Verification & Testing

### Requirement 11

**User Story:** As a quality assurance engineer, I need comprehensive test coverage for the refactored system.

#### Acceptance Criteria

1. WHEN unit tests are implemented THEN all 4 Services SHALL have isolated unit tests with mocked Storage
2. WHEN integration tests are implemented THEN a full "Learn -> Search" cycle test SHALL pass on a sample repository
3. WHEN CLI tests are implemented THEN CLI output format SHALL match the approved snapshot
4. WHEN test coverage is measured THEN it SHALL meet or exceed current levels
5. WHEN tests are executed THEN they SHALL verify the architectural constraints are enforced

### Requirement 12

**User Story:** As a maintainer, I need maximum code simplification to achieve the smallest possible codebase.

#### Acceptance Criteria

1. WHEN the refactor is complete THEN the total number of TypeScript files SHALL be reduced by at least 60% from the current count
2. WHEN the refactor is complete THEN the total lines of code SHALL be reduced by at least 50% from the current count
3. WHEN the refactor is complete THEN the number of npm dependencies SHALL be minimized to only essential packages
4. WHEN the refactor is complete THEN the src/ directory structure SHALL contain only core/, storage/, mcp/, cli/, utils/, and index.ts
5. WHEN the refactor is complete THEN every remaining file SHALL have a clear, single purpose that directly supports learning/analysis/search

### Requirement 13

**User Story:** As a developer, I need architectural guardrails to prevent regression and complexity creep.

#### Acceptance Criteria

1. WHEN linting occurs THEN a linter rule SHALL disallow imports from src/cli into src/core
2. WHEN linting occurs THEN a linter rule SHALL disallow fs.watch usage anywhere in the project
3. WHEN code is committed THEN architectural constraints SHALL be automatically verified
4. WHEN violations occur THEN the build SHALL fail with clear error messages
5. WHEN the refactor is complete THEN guardrails SHALL prevent future architectural drift and complexity increases