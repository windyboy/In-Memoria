# Data Consistency and Integrity Features

This document describes the comprehensive data consistency and integrity system implemented for the vector backend abstraction layer.

## Overview

The data consistency and integrity system ensures that data stored across different vector backends maintains consistent formats, preserves semantic relationships, and provides migration support between backend types. This system addresses Requirements 6.1, 6.3, and 6.5 from the vector backend abstraction specification.

## Key Components

### 1. DataIntegrityValidator

Provides comprehensive validation and normalization of data before storage:

- **Metadata Validation**: Ensures all code metadata follows consistent schema and constraints
- **Embedding Validation**: Validates vector embeddings for correct dimensions and numeric values
- **Search Results Validation**: Verifies consistency of search results across backends
- **Data Checksums**: Generates and verifies checksums for integrity checking

```typescript
import { DataIntegrityValidator } from './storage/data-integrity.js';

const validator = new DataIntegrityValidator(embeddingConfig);
const result = validator.validateCodeMetadata(metadata);
if (result.valid) {
  // Use normalized data
  const normalizedMetadata = result.normalizedData;
}
```

### 2. SemanticRelationshipManager

Manages and preserves semantic relationships between code entities:

- **Relationship Tracking**: Maintains relationships between files, functions, classes, and languages
- **Export/Import**: Supports relationship preservation during migrations
- **Statistics**: Provides insights into relationship patterns

```typescript
import { SemanticRelationshipManager } from './storage/data-integrity.js';

const manager = new SemanticRelationshipManager();
manager.addRelationship('sourceId', 'targetId', 'function');
const relationships = manager.getRelationships('sourceId', 'function');
```

### 3. DataMigrationManager

Handles data migration between different vector backends:

- **Batch Processing**: Migrates data in configurable batches for efficiency
- **Integrity Verification**: Validates data integrity during migration
- **Progress Tracking**: Provides real-time migration progress updates
- **Error Handling**: Comprehensive error reporting and recovery

```typescript
import { DataMigrationManager, MigrationUtils } from './storage/data-migration.js';

const context = MigrationUtils.createMigrationContext('surreal', 'qdrant');
const migrationResult = await migrationManager.migrateData(
  sourceBackend,
  targetBackend,
  context
);
```

### 4. DataConsistencyManager

Unified interface for all data consistency operations:

- **Validation and Normalization**: Validates data before storage
- **Consistency Checks**: Performs comprehensive data consistency audits
- **Issue Repair**: Automatically repairs common consistency issues
- **Migration Coordination**: Manages migrations with full consistency checks

```typescript
import { createDataConsistencyManager } from './storage/data-consistency.js';

const manager = createDataConsistencyManager(embeddingConfig);
const validated = await manager.validateAndNormalizeForStorage(code, metadata);
```

## Features

### Data Format Validation

- **Schema Compliance**: Ensures all metadata follows the defined schema
- **Type Validation**: Validates field types and constraints
- **Normalization**: Automatically normalizes data formats (e.g., file paths, language names)
- **Default Values**: Applies default values for missing optional fields

### Embedding Validation

- **Dimension Consistency**: Ensures embeddings match expected dimensions
- **Numeric Validation**: Validates that all embedding values are finite numbers
- **Quality Checks**: Detects suspicious patterns (zero vectors, identical values)
- **Format Normalization**: Ensures consistent embedding formats across backends

### Semantic Relationship Preservation

- **File Relationships**: Tracks relationships between code entities and files
- **Function/Class Relationships**: Maintains hierarchical code structure relationships
- **Language Relationships**: Groups code by programming language
- **Migration Preservation**: Ensures relationships are maintained during migrations

### Data Migration Support

- **Backend Agnostic**: Supports migration between any supported backend types
- **Batch Processing**: Configurable batch sizes for optimal performance
- **Integrity Verification**: Validates data integrity before, during, and after migration
- **Progress Monitoring**: Real-time progress tracking with ETA calculations
- **Error Recovery**: Comprehensive error handling with detailed reporting

### Consistency Checking and Repair

- **Comprehensive Audits**: Checks metadata, embeddings, relationships, and checksums
- **Issue Classification**: Categorizes issues by type and severity
- **Automated Repair**: Provides automated repair options for common issues
- **Dry Run Mode**: Preview repairs before applying them
- **Backup Support**: Optional backup creation before repairs

## Integration

### ConsistencyAwareVectorStore

A wrapper that adds data consistency features to any vector backend:

```typescript
import { createConsistencyAwareVectorStore } from './storage/data-consistency-integration.js';

const vectorStore = createConsistencyAwareVectorStore(backendConfig, embeddingConfig);

// All operations now include automatic validation
await vectorStore.storeCodeEmbedding(code, metadata);

// Perform consistency checks
const checkResult = await vectorStore.performConsistencyCheck();

// Migrate to another backend
const migrationResult = await vectorStore.migrateToBackend(targetBackend);
```

### Environment-based Configuration

```typescript
import { createConsistencyAwareVectorStoreFromEnv } from './storage/data-consistency-integration.js';

// Automatically configures from environment variables
const vectorStore = createConsistencyAwareVectorStoreFromEnv();
```

## Configuration

### Data Format Specification

The system uses a versioned data format specification:

```typescript
interface DataFormatSpec {
  version: string;                    // Format version (e.g., "1.0.0")
  embeddingDimension: number;         // Expected embedding dimension
  metadataSchema: MetadataValidationRules;  // Validation rules
  semanticRelationships: string[];    // Supported relationship types
  checksumAlgorithm: 'sha256' | 'md5'; // Checksum algorithm
}
```

### Migration Context

Migration behavior is controlled through context configuration:

```typescript
interface MigrationContext {
  sourceBackend: string;      // Source backend type
  targetBackend: string;      // Target backend type
  dataFormatVersion: string;  // Data format version
  preserveIds: boolean;       // Whether to preserve original IDs
  batchSize: number;          // Migration batch size
  validateIntegrity: boolean; // Enable integrity validation
}
```

## Error Handling

The system provides comprehensive error handling with standardized error types:

- **ValidationError**: Data validation failures
- **OperationError**: Migration or consistency operation failures
- **ConfigurationError**: Configuration-related issues

All errors include detailed context and suggested fixes.

## Performance Considerations

- **Batch Processing**: All operations support configurable batch sizes
- **Lazy Validation**: Validation is performed only when necessary
- **Caching**: Relationship and validation results are cached for performance
- **Progress Tracking**: Minimal overhead progress tracking for long operations

## Best Practices

1. **Always Validate**: Use consistency-aware wrappers for automatic validation
2. **Regular Checks**: Perform periodic consistency checks on production data
3. **Test Migrations**: Use dry-run mode to test migrations before execution
4. **Monitor Progress**: Use progress callbacks for long-running operations
5. **Backup Data**: Always backup before performing repairs or migrations

## Examples

See `src/storage/data-consistency-integration.ts` for comprehensive usage examples including:

- Basic data validation and storage
- Consistency checking and repair
- Data migration between backends
- Batch validation and storage

## Testing

Comprehensive test suite available in `src/storage/__tests__/data-consistency.test.ts` covering:

- Data validation scenarios
- Relationship management
- Migration utilities
- Consistency checking
- Error handling

Run tests with:
```bash
npm test -- --run src/storage/__tests__/data-consistency.test.ts
```