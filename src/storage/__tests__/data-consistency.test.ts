/**
 * Tests for Data Consistency and Integrity System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  DataConsistencyManager,
  DataConsistencyUtils,
  createDataConsistencyManager
} from '../data-consistency.js';
import { 
  DataIntegrityValidator,
  SemanticRelationshipManager
} from '../data-integrity.js';
// MigrationUtils removed in Phase 3 - data migration functionality consolidated
import { CodeMetadata, SemanticSearchResult } from '../vector-store.js';
import { EmbeddingConfig } from '../vector-types.js';

describe('DataIntegrityValidator', () => {
  let validator: DataIntegrityValidator;
  let embeddingConfig: EmbeddingConfig;

  beforeEach(() => {
    embeddingConfig = {
      model: 'test-model',
      dimension: 384,
      cacheSize: 100,
      pooling: 'mean',
      normalize: true
    };
    validator = new DataIntegrityValidator(embeddingConfig);
  });

  describe('validateCodeMetadata', () => {
    it('should validate correct metadata', () => {
      const metadata: CodeMetadata = {
        id: 'test-id',
        filePath: '/test/file.ts',
        language: 'typescript',
        complexity: 5,
        lineCount: 100,
        lastModified: new Date(),
        functionName: 'testFunction'
      };

      const result = validator.validateCodeMetadata(metadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject metadata with missing required fields', () => {
      const metadata = {
        id: 'test-id',
        // Missing filePath, language, lastModified
        complexity: 5,
        lineCount: 100
      } as CodeMetadata;

      const result = validator.validateCodeMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('filePath'))).toBe(true);
    });

    it('should normalize metadata and provide warnings', () => {
      const metadata: CodeMetadata = {
        id: 'test-id',
        filePath: '\\test\\file.ts', // Windows-style path
        language: 'TypeScript', // Mixed case
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
        // Missing optional fields that have defaults
      };

      const result = validator.validateCodeMetadata(metadata);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      const normalized = result.normalizedData as CodeMetadata;
      expect(normalized.filePath).toBe('/test/file.ts'); // Normalized path
      expect(normalized.language).toBe('typescript'); // Normalized case
      expect(normalized.complexity).toBe(1); // Default value applied
    });

    it('should validate field constraints', () => {
      const metadata: CodeMetadata = {
        id: '', // Empty ID should fail constraint
        filePath: '/test/file.ts',
        language: 'typescript',
        complexity: -1, // Negative complexity should fail
        lineCount: 0, // Zero line count should fail
        lastModified: new Date()
      };

      const result = validator.validateCodeMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('id'))).toBe(true);
      expect(result.errors.some(error => error.includes('complexity'))).toBe(true);
      expect(result.errors.some(error => error.includes('lineCount'))).toBe(true);
    });
  });

  describe('validateEmbedding', () => {
    it('should validate correct embedding', () => {
      const embedding = new Array(384).fill(0).map(() => Math.random());
      
      const result = validator.validateEmbedding(embedding);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject embedding with wrong dimension', () => {
      const embedding = new Array(256).fill(0.5); // Wrong dimension
      
      const result = validator.validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('dimension'))).toBe(true);
    });

    it('should reject embedding with invalid values', () => {
      const embedding = new Array(384).fill(0);
      embedding[0] = NaN;
      embedding[1] = Infinity;
      embedding[2] = 'invalid' as any;
      
      const result = validator.validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about suspicious patterns', () => {
      // All zeros (zero vector)
      const zeroEmbedding = new Array(384).fill(0);
      const zeroResult = validator.validateEmbedding(zeroEmbedding);
      expect(zeroResult.valid).toBe(false);
      expect(zeroResult.errors.some(error => error.includes('zero vector'))).toBe(true);

      // All identical values
      const identicalEmbedding = new Array(384).fill(0.5);
      const identicalResult = validator.validateEmbedding(identicalEmbedding);
      expect(identicalResult.valid).toBe(true);
      expect(identicalResult.warnings.some(warning => warning.includes('identical values'))).toBe(true);
    });
  });

  describe('validateSearchResults', () => {
    it('should validate correct search results', () => {
      const results: SemanticSearchResult[] = [
        {
          id: 'result-1',
          code: 'function test() {}',
          metadata: {
            id: 'test-1',
            filePath: '/test/file1.ts',
            language: 'typescript',
            lastModified: new Date(),
            complexity: 1,
            lineCount: 1
          },
          similarity: 0.95
        },
        {
          id: 'result-2',
          code: 'const x = 1;',
          metadata: {
            id: 'test-2',
            filePath: '/test/file2.ts',
            language: 'typescript',
            lastModified: new Date(),
            complexity: 1,
            lineCount: 1
          },
          similarity: 0.85
        }
      ];

      const result = validator.validateSearchResults(results);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid search results', () => {
      const results: SemanticSearchResult[] = [
        {
          id: '', // Invalid empty ID
          code: 'function test() {}',
          metadata: {
            id: 'test-1',
            filePath: '/test/file1.ts',
            language: 'typescript',
            lastModified: new Date(),
            complexity: 1,
            lineCount: 1
          },
          similarity: 1.5 // Invalid similarity > 1
        }
      ];

      const result = validator.validateSearchResults(results);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('id'))).toBe(true);
      expect(result.warnings.some(warning => warning.includes('similarity'))).toBe(true);
    });
  });

  describe('checksum operations', () => {
    it('should generate consistent checksums', () => {
      const data = { code: 'test', metadata: { id: 'test' } };
      
      const checksum1 = validator.generateDataChecksum(data);
      const checksum2 = validator.generateDataChecksum(data);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toBeTruthy();
    });

    it('should verify data integrity', () => {
      const data = { code: 'test', metadata: { id: 'test' } };
      const checksum = validator.generateDataChecksum(data);
      
      expect(validator.verifyDataIntegrity(data, checksum)).toBe(true);
      
      // Modify data
      const modifiedData = { ...data, code: 'modified' };
      expect(validator.verifyDataIntegrity(modifiedData, checksum)).toBe(false);
    });
  });
});

describe('SemanticRelationshipManager', () => {
  let manager: SemanticRelationshipManager;

  beforeEach(() => {
    manager = new SemanticRelationshipManager();
  });

  it('should add and retrieve relationships', () => {
    manager.addRelationship('source1', 'target1', 'function');
    manager.addRelationship('source1', 'target2', 'function');
    manager.addRelationship('source2', 'target1', 'class');

    const relationships = manager.getRelationships('source1', 'function');
    expect(relationships).toContain('target1');
    expect(relationships).toContain('target2');
    expect(relationships).toHaveLength(2);

    const classRelationships = manager.getRelationships('source2', 'class');
    expect(classRelationships).toContain('target1');
    expect(classRelationships).toHaveLength(1);
  });

  it('should remove entity relationships', () => {
    manager.addRelationship('source1', 'target1', 'function');
    manager.addRelationship('source1', 'target2', 'function');
    manager.addRelationship('target1', 'source1', 'reverse');

    manager.removeEntityRelationships('source1');

    expect(manager.getRelationships('source1')).toHaveLength(0);
    expect(manager.getRelationships('target1')).not.toContain('source1');
  });

  it('should export and import relationships', () => {
    manager.addRelationship('source1', 'target1', 'function');
    manager.addRelationship('source2', 'target2', 'class');

    const exported = manager.exportRelationships();
    expect(Object.keys(exported)).toHaveLength(2);

    const newManager = new SemanticRelationshipManager();
    newManager.importRelationships(exported);

    expect(newManager.getRelationships('source1', 'function')).toContain('target1');
    expect(newManager.getRelationships('source2', 'class')).toContain('target2');
  });

  it('should provide relationship statistics', () => {
    manager.addRelationship('source1', 'target1', 'function');
    manager.addRelationship('source1', 'target2', 'function');
    manager.addRelationship('source2', 'target1', 'class');

    const stats = manager.getRelationshipStats();
    expect(stats.totalRelationships).toBe(3);
    expect(stats.uniqueEntities).toBe(4); // source1, source2, target1, target2
    expect(stats.relationshipTypes).toContain('function');
    expect(stats.relationshipTypes).toContain('class');
  });
});

describe('DataConsistencyManager', () => {
  let manager: DataConsistencyManager;
  let embeddingConfig: EmbeddingConfig;

  beforeEach(() => {
    embeddingConfig = {
      model: 'test-model',
      dimension: 384,
      cacheSize: 100,
      pooling: 'mean',
      normalize: true
    };
    manager = new DataConsistencyManager(embeddingConfig);
  });

  describe('validateAndNormalizeForStorage', () => {
    it('should validate and normalize data for storage', async () => {
      const code = 'function test() { return 42; }';
      const metadata: CodeMetadata = {
        id: 'test-id',
        filePath: '\\test\\file.ts',
        language: 'TypeScript',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      };
      const embedding = new Array(384).fill(0).map(() => Math.random());

      const result = await manager.validateAndNormalizeForStorage(code, metadata, embedding);

      expect(result.validationResults.metadata.valid).toBe(true);
      expect(result.validationResults.embedding?.valid).toBe(true);
      expect(result.metadata.filePath).toBe('/test/file.ts'); // Normalized
      expect(result.metadata.language).toBe('typescript'); // Normalized
    });

    it('should reject invalid data', async () => {
      const code = 'function test() { return 42; }';
      const metadata = {
        id: '', // Invalid empty ID
        filePath: '/test/file.ts',
        language: 'typescript'
        // Missing required lastModified
      } as CodeMetadata;

      await expect(
        manager.validateAndNormalizeForStorage(code, metadata)
      ).rejects.toThrow('Metadata validation failed');
    });
  });

  describe('factory function', () => {
    it('should create data consistency manager', () => {
      const manager = createDataConsistencyManager(embeddingConfig);
      expect(manager).toBeInstanceOf(DataConsistencyManager);
    });
  });
});

// MigrationUtils removed in Task 24 consolidation - only SurrealDB backend supported per requirement 6.1

describe('DataConsistencyUtils', () => {
  describe('createDefaultRepairOptions', () => {
    it('should create default repair options', () => {
      const options = DataConsistencyUtils.createDefaultRepairOptions();
      
      expect(options.autoFix).toBe(false);
      expect(options.backupBeforeRepair).toBe(true);
      expect(options.repairTypes).toContain('validation');
      expect(options.repairTypes).toContain('relationship');
      expect(options.repairTypes).toContain('checksum');
      expect(options.dryRun).toBe(false);
    });
  });

  describe('filterIssuesBySeverity', () => {
    it('should filter issues by severity', () => {
      const issues = [
        { type: 'validation', severity: 'error', itemId: '1', description: 'Error 1' },
        { type: 'validation', severity: 'warning', itemId: '2', description: 'Warning 1' },
        { type: 'checksum', severity: 'error', itemId: '3', description: 'Error 2' }
      ] as any[];

      const errors = DataConsistencyUtils.filterIssuesBySeverity(issues, 'error');
      const warnings = DataConsistencyUtils.filterIssuesBySeverity(issues, 'warning');

      expect(errors).toHaveLength(2);
      expect(warnings).toHaveLength(1);
    });
  });

  describe('groupIssuesByType', () => {
    it('should group issues by type', () => {
      const issues = [
        { type: 'validation', severity: 'error', itemId: '1', description: 'Error 1' },
        { type: 'validation', severity: 'warning', itemId: '2', description: 'Warning 1' },
        { type: 'checksum', severity: 'error', itemId: '3', description: 'Error 2' }
      ] as any[];

      const grouped = DataConsistencyUtils.groupIssuesByType(issues);

      expect(grouped.validation).toHaveLength(2);
      expect(grouped.checksum).toHaveLength(1);
    });
  });

  describe('generateConsistencyReport', () => {
    it('should generate consistency report', () => {
      const result = {
        consistent: false,
        issues: [
          { type: 'validation', severity: 'error', itemId: '1', description: 'Error 1' },
          { type: 'checksum', severity: 'warning', itemId: '2', description: 'Warning 1' }
        ],
        summary: {
          totalItems: 100,
          validItems: 98,
          invalidItems: 2,
          relationshipIssues: 1,
          checksumMismatches: 1
        }
      } as any;

      const report = DataConsistencyUtils.generateConsistencyReport(result);

      expect(report).toContain('ISSUES FOUND');
      expect(report).toContain('Total Items: 100');
      expect(report).toContain('Valid Items: 98');
      expect(report).toContain('VALIDATION Issues: 1');
      expect(report).toContain('CHECKSUM Issues: 1');
    });
  });
});