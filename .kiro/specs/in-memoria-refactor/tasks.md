# Implementation Plan

## Current Status Summary

**Phase 1**: ✅ COMPLETED - Foundation & Service Layer established
**Phase 2**: ✅ COMPLETED - Storage convergence and single writer principle implemented  
**Phase 3**: 🔄 IN PROGRESS - Cleanup & delivery phase with significant progress

**Key Achievements:**
- ✅ All 4 core services implemented (Analysis, Learning, Search, Diagnostic)
- ✅ DI Container and bootstrap infrastructure complete
- ✅ CLI and MCP adapters converted to pure interfaces
- ✅ Single writer principle enforced in LearningService
- ✅ Database schema simplified to 4 tables
- ✅ Learning process made idempotent
- ✅ Legacy modules removed (watchers, automation-tools, etc.)
- ✅ Directory structure achieved target (core/, storage/, mcp/, cli/, utils/)
- ✅ Dependencies minimized (19 total, down from 23)

**Current Issues:**
- ❌ 53 TypeScript compilation errors from file removals
- ❌ File count reduction: 14.3% achieved (need 60%, 45 more files to remove)
- ❌ Lines of code reduction: 8.2% achieved (need 50%, 13,194 more lines to remove)
- ⚠️ TODO items in MCP tools violating single writer principle

**Next Steps:** Fix compilation errors, complete single writer enforcement, aggressive file consolidation

## Architecture Analysis

**Current Contracts:**
- Existing CLI commands: `learn`, `analyze`, `server`, `status` (frozen during Phase 1)
- Existing MCP tools: Multiple tools with JSON schemas (frozen during Phase 1)
- Current service structure: Single `learning-service.ts` with mixed responsibilities
- Current engines: `semantic-engine.ts`, `search-engine.ts`, `pattern-engine.ts` with overlapping concerns
- Current storage: Multiple tables with scattered write access

**Why This Change Is Safe:**
- Three-phase approach allows independent rollback at each stage
- Phase 1 only adds new code without deleting existing functionality
- Interface contracts are frozen to prevent breaking changes
- Service layer provides clean abstraction over existing engines
- Single writer principle eliminates race conditions and data corruption

**Affected Contracts:**
- CLI interface (enhanced with pure adapters, no breaking changes)
- MCP tool schemas (frozen, then enhanced through service layer)
- Database schema (simplified in Phase 2 with migration)
- Service boundaries (clarified and enforced)

## Phase 1: Foundation & Service Layer (The "Safe" Phase)

- [x] 1. Create DI Container infrastructure
  - Implement `src/core/container/container.ts` with service registration
  - Create `src/core/container/service-keys.ts` for type-safe service resolution
  - Implement `initializeDIContainer({ projectPath })` as single entry point
  - Add container lifecycle management (initialization, disposal)
  - _Requirements: 2.1, 2.2, 2.3_

- [ ]* 1.1 Write property test for container singleton behavior
  - **Property 4: Container Singleton Behavior**
  - **Validates: Requirements 2.2**

- [x] 2. Implement AnalysisService (read-only)
  - Create `src/core/services/AnalysisService.ts` with read-only operations
  - Implement `analyzeCodebase()`, `getLanguageMetrics()`, `getComplexityMetrics()`, `extractConcepts()`
  - Integrate with existing `semantic-engine.ts` for analysis logic
  - Ensure no database write operations in service methods
  - _Requirements: 3.1_

- [ ]* 2.1 Write property test for AnalysisService read-only behavior
  - **Property 2: Service Layer Isolation**
  - **Validates: Requirements 3.1**

- [x] 3. Implement LearningService (write-only)
  - Create `src/core/services/LearningService.ts` as single writer
  - Implement `learnFromCodebase()`, `updateProjectMetadata()`, `storeSemanticConcepts()`, `storeDeveloperPatterns()`
  - Integrate with existing storage systems as the only write entry point
  - Add ProgressController integration for status tracking
  - _Requirements: 3.2_

- [ ]* 3.1 Write property test for single writer principle
  - **Property 3: Single Writer Principle**
  - **Validates: Requirements 3.2, 5.1, 5.2**

- [x] 4. Implement SearchService (read-only)
  - Create `src/core/services/SearchService.ts` with read-only operations
  - Implement `searchSemantic()`, `searchPatterns()`, `searchText()`
  - Integrate with existing `search-engine.ts` for query logic
  - Ensure no database write operations in service methods
  - _Requirements: 3.1_

- [x] 5. Implement DiagnosticService (read-only)
  - Create `src/core/services/DiagnosticService.ts` with read-only operations
  - Implement `getLearningStatus()`, `getSystemMetrics()`, `getIntelligenceMetrics()`, `getHealthStatus()`
  - Provide system health and statistics without modifying state
  - Integrate with existing diagnostic capabilities
  - _Requirements: 3.1_

- [x] 6. Create pure CLI adapters
  - Modify `src/cli/learn.ts` to use LearningService through DI Container
  - Modify `src/cli/analyze.ts` to use AnalysisService through DI Container
  - Modify `src/cli/status.ts` to use DiagnosticService through DI Container
  - Ensure CLI adapters contain no business logic, only parameter transformation
  - _Requirements: 1.1, 4.1_

- [ ]* 6.1 Write property test for interface layer purity
  - **Property 1: Interface Layer Purity**
  - **Validates: Requirements 1.1, 4.1**

- [x] 7. Create pure MCP adapters
  - Modify existing MCP tools to use services through DI Container
  - Ensure MCP adapters contain no business logic, only parameter transformation
  - Freeze existing MCP tool schemas to prevent breaking changes
  - Map all existing MCP functionality through service layer
  - _Requirements: 1.1, 4.1_

- [ ]* 7.1 Write property test for interface contract stability
  - **Property 8: Interface Contract Stability**
  - **Validates: Requirements 4.1**

- [x] 8. Create bootstrap infrastructure
  - Implement `src/core/bootstrap.ts` for system initialization
  - Integrate DI Container with existing application startup
  - Ensure initialization does not trigger heavy computation or database writes
  - Add graceful shutdown handling
  - _Requirements: 2.3_

- [x] 9. Phase 1 checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Storage Convergence (The "Data" Phase)

- [x] 10. Implement single writer enforcement
  - Audit codebase to identify all database write operations
  - Move all INSERT, UPDATE, DELETE operations to LearningService
  - Remove write operations from AnalysisService, SearchService, DiagnosticService
  - Update existing engines to be pure calculation utilities
  - _Requirements: 5.1, 5.2_

- [x] 11. Refactor SemanticEngine to pure utility
  - Modify `src/engines/semantic-engine.ts` to be stateless calculation utility
  - Remove all database write operations from SemanticEngine
  - Ensure SemanticEngine only returns analysis results
  - Update LearningService to handle all storage operations
  - _Requirements: 5.2_

- [x] 12. Implement simplified database schema
  - Create migration script to consolidate to four tables: semantic_concepts, developer_patterns, feature_map, project_metadata
  - Implement `src/storage/migrations/` directory with schema migration
  - Drop unused legacy tables through migration
  - Update all storage operations to use simplified schema
  - _Requirements: 6.1_

- [ ]* 12.1 Write property test for schema compliance
  - **Property 6: Schema Compliance**
  - **Validates: Requirements 6.1**

- [x] 13. Implement idempotent learning process





  - Modify learning operations to be idempotent (no data duplication)
  - Implement timestamp-only updates for repeated learning
  - Add ProgressController integration for all learning operations
  - Ensure graceful handling of SIGINT during learning
  - _Requirements: 7.1_

- [ ]* 13.1 Write property test for learning idempotency
  - **Property 5: Learning Idempotency**
  - **Validates: Requirements 7.1**

- [x] 14. Consolidate vector storage to single backend










  - Remove multi-backend vector support
  - Implement single vector backend through LearningService
  - Ensure all vector operations go through unified interface
  - Update configuration to use single vector implementation
  - _Requirements: 6.1_

- [x] 15. Phase 2 checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Cleanup & Delivery (The "Slim" Phase)

- [x] 16. Delete legacy modules





  - Remove `src/watchers/` directory completely
  - Remove `src/automation-tools/` directory completely (if exists)
  - Remove `src/monitoring-tools/` directory completely (if exists)
  - Remove `src/documentation-generator/` directory completely (if exists)
  - Remove legacy SearchEngine and old service classes
  - _Requirements: 8.1_

- [ ]* 16.1 Write property test for legacy module elimination
  - **Property 10: Legacy Module Elimination**
  - **Validates: Requirements 8.1**

- [x] 17. Implement CLI command whitelist





  - Ensure only `server`, `learn`, `analyze`, `status` commands exist
  - Remove any additional CLI commands or flags
  - Update CLI help and documentation to reflect simplified interface
  - Verify no daemon or watcher functionality remains
  - _Requirements: 9.1_

- [x] 18. Implement MCP tool whitelist





  - Ensure only specified MCP tools exist: analyze_codebase, learn_codebase_intelligence, search_codebase, get_project_blueprint, get_pattern_recommendations, get_intelligence_metrics
  - Remove any additional MCP tools
  - Update MCP server registration to reflect simplified tool set
  - Verify tool schemas match frozen baseline
  - _Requirements: 9.2_

- [x] 19. Implement standardized error handling





  - Create unified error hierarchy: ValidationError, PathError, LearningError, StorageError, SearchError
  - Update all services to use standardized error types
  - Implement error translation for external library errors
  - Ensure consistent error handling across CLI and MCP interfaces
  - _Requirements: 10.1_

- [ ]* 19.1 Write property test for error standardization
  - **Property 7: Error Standardization**
  - **Validates: Requirements 10.1**

- [x] 20. Implement architectural guardrails





  - Add linter rule to disallow imports from src/cli into src/core
  - Add linter rule to disallow fs.watch usage anywhere in project
  - Create pre-commit hooks to enforce architectural constraints
  - Add build-time verification of service isolation
  - _Requirements: 13.1, 13.2_

- [x] 21. Verify code simplification metrics (PARTIAL COMPLETION)
  - Measure and verify file count reduction of at least 60% (❌ 14.3% achieved, need 45 more files removed)
  - Measure and verify lines of code reduction of at least 50% (❌ 8.2% achieved, need 13,194 more lines removed)
  - Audit and minimize npm dependencies to essential packages only (✅ COMPLETED)
  - Ensure src/ directory contains only: core/, storage/, mcp/, cli/, utils/, index.ts (✅ COMPLETED)
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ]* 21.1 Write property test for code simplification metrics
  - **Property 9: Code Simplification Metrics**
  - **Validates: Requirements 12.1, 12.2**

- [x] 22. Fix compilation errors from Phase 3 changes





  - Fix TypeScript compilation errors (53 errors in 23 files)
  - Remove references to deleted files (QdrantVectorDB, DocumentationGenerator, etc.)
  - Fix import paths and type mismatches
  - Update vector store factory calls to match new signatures
  - Fix CLI error handling type issues
  - _Requirements: 8.1, 12.4_

- [x] 23. Complete single writer principle enforcement





  - Fix TODO items in intelligence-tools.ts that violate single writer principle
  - Move direct database writes to LearningService methods
  - Remove work session and project decision storage violations
  - Ensure all storage operations go through LearningService
  - _Requirements: 5.1, 5.2_

- [x] 24. Aggressive file consolidation to meet metrics





  - Consolidate diagnostic files (diagnostic-system.ts, health-monitor.ts, logging-monitor.ts, performance-monitor.ts)
  - Simplify backend adapter pattern (remove multi-backend abstractions)
  - Merge storage utility files (backend-config.ts, backend-factories.ts, backend-registry.ts, vector-factory.ts)
  - Consolidate MCP tools (merge core-analysis.ts and intelligence-tools.ts)
  - Remove unused test infrastructure files
  - _Requirements: 12.1, 12.2_

- [x] 25. Update project structure to target architecture





  - Reorganize remaining files into target structure: src/core/, src/storage/, src/mcp/, src/cli/, src/utils/
  - Ensure each remaining file has single, clear purpose
  - Update import paths to reflect new structure
  - Verify no circular dependencies exist
  - _Requirements: 12.4, 12.5_

- [x] 26. Verify final simplification metrics





  - Measure final file count reduction (target: ≤39 files, 60% reduction)
  - Measure final lines of code reduction (target: ≤15,796 lines, 50% reduction)
  - Verify all compilation errors are resolved
  - Confirm all architectural constraints are met
  - _Requirements: 12.1, 12.2_

- [x] 27. Create comprehensive integration tests





  - Implement full "Learn -> Search" cycle test on sample repository
  - Add CLI snapshot tests to verify output format consistency
  - Add MCP tool schema validation tests
  - Test error handling across all interfaces
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 28. Final checkpoint - Ensure all tests pass and metrics are met





  - Ensure all tests pass, ask the user if questions arise.
  - Verify all code simplification metrics are achieved
  - Confirm architectural guardrails are working
  - Validate that the system can be described in one sentence: "In-Memoria learns from codebases and provides semantic analysis and search capabilities"

## Verification Tasks

- [x] 29. Write comprehensive unit tests for all services






  - Test AnalysisService with mocked dependencies
  - Test LearningService with mocked storage
  - Test SearchService with mocked dependencies
  - Test DiagnosticService with mocked dependencies
  - _Requirements: 11.1_

- [ ]* 30. Write integration tests for full workflows
  - Test complete learning workflow from CLI
  - Test complete search workflow from MCP
  - Test error handling across service boundaries
  - Test system recovery from failures
  - _Requirements: 11.2_

- [ ]* 31. Write architectural compliance tests
  - Test that services don't call each other directly
  - Test that interface layers contain no business logic
  - Test that only LearningService performs write operations
  - Test that all errors conform to standardized hierarchy
  - _Requirements: 1.3, 1.1, 5.1, 10.1_