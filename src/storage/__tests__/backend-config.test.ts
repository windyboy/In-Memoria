/**
 * Tests for backend configuration abstraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BackendConfig,
  SurrealBackendConfigAdapter,
  mergeWithDefaults,
  validateAndNormalizeConfig
} from '../backend-unified.js';

describe('Backend Configuration Abstraction', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('SurrealBackendConfigAdapter', () => {
    it('should provide valid default configuration', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const config = adapter.getDefaultConfig();
      
      expect(config.type).toBe('surreal');
      expect(config.connectionParams).toHaveProperty('namespace');
      expect(config.connectionParams).toHaveProperty('database');
      expect(config.embeddingConfig).toHaveProperty('model');
      expect(config.performanceSettings).toHaveProperty('connectionTimeout');
      
      const validation = adapter.validateConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should map environment variables correctly', () => {
      process.env.SURREAL_NAMESPACE = 'test-namespace';
      process.env.SURREAL_DATABASE = 'test-db';
      process.env.IN_MEMORIA_EMBEDDING_MODEL = 'test-model';
      process.env.IN_MEMORIA_BATCH_SIZE = '100';

      const adapter = new SurrealBackendConfigAdapter();
      const config = adapter.mapEnvironmentVariables();

      expect(config.connectionParams.namespace).toBe('test-namespace');
      expect(config.connectionParams.database).toBe('test-db');
      expect(config.embeddingConfig.model).toBe('test-model');
      expect(config.performanceSettings.batchSize).toBe(100);
    });

    it('should sanitize sensitive information for logging', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const config: BackendConfig = {
        type: 'surreal',
        connectionParams: {
          username: 'user',
          password: 'secret123',
          apiKey: 'key123'
        },
        embeddingConfig: { model: 'test-model' },
        performanceSettings: {
          connectionTimeout: 30000,
          operationTimeout: 30000,
          maxRetries: 3,
          batchSize: 50
        }
      };

      const sanitized = adapter.sanitizeForLogging(config);
      expect(sanitized.connectionParams).toHaveProperty('username', 'user');
      expect(sanitized.connectionParams).toHaveProperty('password', '[REDACTED]');
      expect(sanitized.connectionParams).toHaveProperty('apiKey', '[REDACTED]');
    });

    it('should validate configuration and report errors', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const invalidConfig: BackendConfig = {
        type: 'surreal',
        connectionParams: {},
        embeddingConfig: { dimension: -1 }, // Invalid dimension
        performanceSettings: {
          connectionTimeout: -1, // Invalid timeout
          operationTimeout: 30000,
          maxRetries: 3,
          batchSize: 0 // Invalid batch size
        }
      };

      const validation = adapter.validateConfig(invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(error => error.includes('dimension'))).toBe(true);
      expect(validation.errors.some(error => error.includes('timeout'))).toBe(true);
      expect(validation.errors.some(error => error.includes('Batch size'))).toBe(true);
    });
  });

  // QdrantBackendConfigAdapter removed in Task 24 - only SurrealDB supported per requirement 6.1

  describe('Factory Functions', () => {
    it('should create SurrealDB adapter', () => {
      const adapter = new SurrealBackendConfigAdapter();
      expect(adapter).toBeInstanceOf(SurrealBackendConfigAdapter);
    });

    it('should merge configuration with defaults correctly', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const partialConfig: Partial<BackendConfig> = {
        connectionParams: { namespace: 'custom' },
        performanceSettings: { 
          batchSize: 100,
          connectionTimeout: 30000,
          operationTimeout: 30000,
          maxRetries: 3
        }
      };

      const merged = mergeWithDefaults(partialConfig, adapter);
      
      expect(merged.type).toBe('surreal');
      expect(merged.connectionParams.namespace).toBe('custom');
      expect(merged.connectionParams).toHaveProperty('database'); // From defaults
      expect(merged.performanceSettings.batchSize).toBe(100);
      expect(merged.performanceSettings).toHaveProperty('connectionTimeout'); // From defaults
    });

    it('should validate and normalize configuration', () => {
      const partialConfig = {
        type: 'surreal' as const,
        connectionParams: { namespace: 'test' },
        embeddingConfig: { model: 'custom-model' }
      };

      const { config, validation } = validateAndNormalizeConfig(partialConfig);
      
      expect(validation.valid).toBe(true);
      expect(config.type).toBe('surreal');
      expect(config.connectionParams.namespace).toBe('test');
      expect(config.embeddingConfig.model).toBe('custom-model');
      expect(config.performanceSettings).toHaveProperty('connectionTimeout'); // From defaults
    });
  });
});