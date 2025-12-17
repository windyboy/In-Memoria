/**
 * Tests for ConfigManager with backend abstraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../config/config.js';
import { createBackendConfigAdapter } from '../storage/backend-config.js';

describe('ConfigManager with Backend Abstraction', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Vector Backend Configuration', () => {
    it('should use default surreal backend configuration', () => {
      const configManager = ConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.vectorBackend.type).toBe('surreal');
      expect(config.vectorBackend.config.type).toBe('surreal');
      expect(config.vectorBackend.config.embeddingConfig).toBeDefined();
      expect(config.vectorBackend.config.performanceSettings).toBeDefined();
      expect(config.vectorBackend.config.connectionParams).toBeDefined();
    });

    it('should get vector backend configuration', () => {
      const configManager = ConfigManager.getInstance();
      const backendConfig = configManager.getVectorBackendConfig();
      
      expect(backendConfig.type).toBe('surreal');
      expect(backendConfig.embeddingConfig.model).toBe('Xenova/all-MiniLM-L6-v2');
      expect(backendConfig.embeddingConfig.dimension).toBe(384);
    });

    it('should get embedding configuration from vector backend', () => {
      const configManager = ConfigManager.getInstance();
      const embeddingConfig = configManager.getEmbeddingConfig();
      
      expect(embeddingConfig.model).toBe('Xenova/all-MiniLM-L6-v2');
      expect(embeddingConfig.dimension).toBe(384);
      expect(embeddingConfig.pooling).toBe('mean');
      expect(embeddingConfig.normalize).toBe(true);
    });

    it('should get backend defaults for different backend types', () => {
      const configManager = ConfigManager.getInstance();
      
      const surrealDefaults = configManager.getBackendDefaults('surreal');
      expect(surrealDefaults.type).toBe('surreal');
      expect(surrealDefaults.connectionParams.namespace).toBe('in-memoria');
      
      const qdrantDefaults = configManager.getBackendDefaults('qdrant');
      expect(qdrantDefaults.type).toBe('qdrant');
      expect(qdrantDefaults.connectionParams.url).toBe('http://localhost:6333');
      expect(qdrantDefaults.connectionParams.collection).toBe('in-memoria');
    });

    it('should set vector backend configuration with validation', () => {
      const configManager = ConfigManager.getInstance();
      
      const result = configManager.setVectorBackendConfig('qdrant', {
        connectionParams: {
          url: 'http://test-qdrant:6333',
          collection: 'test-collection'
        }
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      const config = configManager.getVectorBackendConfig();
      expect(config.type).toBe('qdrant');
      expect(config.connectionParams.url).toBe('http://test-qdrant:6333');
      expect(config.connectionParams.collection).toBe('test-collection');
    });

    it('should validate configuration and return errors for invalid config', () => {
      const configManager = ConfigManager.getInstance();
      
      const result = configManager.setVectorBackendConfig('qdrant', {
        connectionParams: {
          url: 'invalid-url',
          collection: ''
        }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Variable Processing', () => {
    it('should load configuration from environment variables using adapters', () => {
      // Set environment variables
      process.env.IN_MEMORIA_VECTOR_BACKEND = 'qdrant';
      process.env.QDRANT_URL = 'http://env-qdrant:6333';
      process.env.QDRANT_COLLECTION = 'env-collection';
      process.env.IN_MEMORIA_EMBEDDING_MODEL = 'test-model';
      process.env.IN_MEMORIA_EMBEDDING_DIMENSION = '512';
      
      // Create a new ConfigManager instance to pick up env vars
      const configManager = new (ConfigManager as any)();
      
      const config = configManager.getVectorBackendConfig();
      expect(config.type).toBe('qdrant');
      expect(config.connectionParams.url).toBe('http://env-qdrant:6333');
      expect(config.connectionParams.collection).toBe('env-collection');
      expect(config.embeddingConfig.model).toBe('test-model');
      expect(config.embeddingConfig.dimension).toBe(512);
    });

    it('should handle invalid backend type in environment gracefully', () => {
      process.env.IN_MEMORIA_VECTOR_BACKEND = 'invalid-backend';
      
      // Create a new ConfigManager instance
      const configManager = new (ConfigManager as any)();
      
      // Should fall back to default (surreal)
      const backendType = configManager.getVectorBackendType();
      expect(backendType).toBe('surreal');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate complete configuration', () => {
      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateConfig();
      
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      
      if (!validation.valid) {
        console.log('Validation errors:', validation.errors);
        console.log('Validation warnings:', validation.warnings);
      }
    });

    it('should provide enhanced error messages', () => {
      const configManager = ConfigManager.getInstance();
      
      // Set invalid configuration
      configManager.updateConfig({
        performance: {
          batchSize: -1,
          maxConcurrentFiles: 0,
          fileOperationTimeout: 30000,
          cacheSize: 1000
        }
      });
      
      const validation = configManager.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('batch size'))).toBe(true);
      expect(validation.errors.some(err => err.includes('concurrent files'))).toBe(true);
    });
  });

  describe('Configuration Help', () => {
    it('should provide configuration help', () => {
      const configManager = ConfigManager.getInstance();
      const help = configManager.getConfigurationHelp();
      
      expect(help).toBeInstanceOf(Array);
      expect(help.length).toBeGreaterThan(0);
      expect(help.some(line => line.includes('Environment Variables'))).toBe(true);
      expect(help.some(line => line.includes('Vector Backend Configuration'))).toBe(true);
    });

    it('should provide backend-specific configuration help', () => {
      const configManager = ConfigManager.getInstance();
      
      const surrealHelp = configManager.getBackendConfigurationHelp('surreal');
      expect(surrealHelp.some(line => line.includes('SURREAL'))).toBe(true);
      
      const qdrantHelp = configManager.getBackendConfigurationHelp('qdrant');
      expect(qdrantHelp.some(line => line.includes('QDRANT'))).toBe(true);
      
      const invalidHelp = configManager.getBackendConfigurationHelp('invalid');
      expect(invalidHelp.some(line => line.includes('Unknown backend type'))).toBe(true);
    });
  });

  describe('Sanitized Configuration', () => {
    it('should provide sanitized configuration for logging', () => {
      const configManager = ConfigManager.getInstance();
      
      // Set configuration with sensitive data
      configManager.setVectorBackendConfig('qdrant', {
        connectionParams: {
          url: 'http://qdrant:6333',
          apiKey: 'secret-api-key',
          collection: 'test'
        }
      });
      
      const sanitized = configManager.getSanitizedConfig();
      
      expect(sanitized).toHaveProperty('vectorBackend');
      expect(sanitized.vectorBackend).toHaveProperty('type', 'qdrant');
      expect(sanitized.vectorBackend).toHaveProperty('config');
      
      // Should not contain sensitive information
      const configStr = JSON.stringify(sanitized);
      expect(configStr).not.toContain('secret-api-key');
    });
  });
});