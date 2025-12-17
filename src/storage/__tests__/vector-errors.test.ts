import { describe, it, expect } from 'vitest';
import {
  VectorStoreError,
  ConnectionError,
  ValidationError,
  OperationError,
  ConfigurationError,
  SurrealErrorTranslator,
  QdrantErrorTranslator,
  createErrorTranslator,
  isVectorStoreError,
  getErrorMessage,
  normalizeError,
  ErrorCategory
} from '../vector-errors.js';

describe('VectorStoreError Base Class', () => {
  class TestError extends VectorStoreError {
    readonly code = 'TEST_ERROR';
    readonly category: ErrorCategory = 'operation';
    readonly retryable = true;
  }

  it('should create error with message and cause', () => {
    const cause = new Error('Original error');
    const context = { testKey: 'testValue' };
    const error = new TestError('Test message', cause, context);

    expect(error.message).toBe('Test message');
    expect(error.cause).toBe(cause);
    expect(error.context).toBe(context);
    expect(error.name).toBe('TestError');
  });

  it('should sanitize sensitive information in context', () => {
    const context = {
      apiKey: 'secret123',
      password: 'mypassword',
      normalField: 'normalValue',
      token: 'bearer123'
    };
    const error = new TestError('Test message', undefined, context);
    const logSafe = error.toLogSafeObject();

    expect(logSafe.context).toEqual({
      apiKey: '[REDACTED]',
      password: '[REDACTED]',
      normalField: 'normalValue',
      token: '[REDACTED]'
    });
  });

  it('should include cause information in log safe object', () => {
    const cause = new Error('Original error');
    const error = new TestError('Test message', cause);
    const logSafe = error.toLogSafeObject();

    expect(logSafe.cause).toEqual({
      name: 'Error',
      message: 'Original error'
    });
  });
});

describe('Specific Error Types', () => {
  it('should create ConnectionError with correct properties', () => {
    const error = new ConnectionError('Network timeout');
    
    expect(error.code).toBe('VECTOR_CONNECTION_ERROR');
    expect(error.category).toBe('connection');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('Connection failed: Network timeout');
  });

  it('should create ValidationError with correct properties', () => {
    const error = new ValidationError('Invalid input');
    
    expect(error.code).toBe('VECTOR_VALIDATION_ERROR');
    expect(error.category).toBe('validation');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Validation failed: Invalid input');
  });

  it('should create OperationError with correct properties', () => {
    const error = new OperationError('Query failed');
    
    expect(error.code).toBe('VECTOR_OPERATION_ERROR');
    expect(error.category).toBe('operation');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('Operation failed: Query failed');
  });

  it('should create OperationError with custom retryable flag', () => {
    const error = new OperationError('Fatal error', undefined, undefined, false);
    
    expect(error.retryable).toBe(false);
  });

  it('should create ConfigurationError with correct properties', () => {
    const error = new ConfigurationError('Missing API key');
    
    expect(error.code).toBe('VECTOR_CONFIGURATION_ERROR');
    expect(error.category).toBe('configuration');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Configuration error: Missing API key');
  });
});

describe('SurrealErrorTranslator', () => {
  const translator = new SurrealErrorTranslator();

  it('should translate connection errors', () => {
    const originalError = new Error('Connection failed to database');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ConnectionError);
    expect(translated.message).toContain('SurrealDB connection failed');
  });

  it('should translate schema conflicts as validation errors', () => {
    const originalError = new Error('Table already exists');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.message).toContain('SurrealDB schema conflict');
  });

  it('should translate initialization errors as configuration errors', () => {
    const originalError = new Error('Vector database not initialized. Call initialize() first.');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ConfigurationError);
    expect(translated.message).toContain('SurrealDB not properly initialized');
  });

  it('should translate embedding errors as operation errors', () => {
    const originalError = new Error('Embedding generation failed');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(OperationError);
    expect(translated.message).toContain('SurrealDB embedding operation failed');
  });

  it('should default to operation error for unknown errors', () => {
    const originalError = new Error('Unknown SurrealDB error');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(OperationError);
    expect(translated.message).toContain('SurrealDB operation failed');
  });

  it('should extract context from errors', () => {
    const originalError = new Error('Test error') as any;
    originalError.code = 'SURREAL_ERROR';
    
    const context = translator.extractContext(originalError);
    
    expect(context.originalErrorName).toBe('Error');
    expect(context.originalErrorMessage).toBe('Test error');
    expect(context.originalErrorCode).toBe('SURREAL_ERROR');
  });
});

describe('QdrantErrorTranslator', () => {
  const translator = new QdrantErrorTranslator();

  it('should translate 404 errors as validation errors', () => {
    const originalError = new Error('Collection not found') as any;
    originalError.status = 404;
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.message).toContain('Qdrant resource not found');
  });

  it('should translate 400 errors as validation errors', () => {
    const originalError = new Error('Bad request') as any;
    originalError.status = 400;
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.message).toContain('Qdrant bad request');
  });

  it('should translate auth errors as connection errors', () => {
    const originalError = new Error('Unauthorized') as any;
    originalError.status = 401;
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ConnectionError);
    expect(translated.message).toContain('Qdrant authentication failed');
  });

  it('should translate server errors as operation errors', () => {
    const originalError = new Error('Internal server error') as any;
    originalError.status = 500;
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(OperationError);
    expect(translated.message).toContain('Qdrant server error');
  });

  it('should translate dimension mismatch as configuration error', () => {
    const originalError = new Error('Collection dimension mismatch detected');
    const translated = translator.translate(originalError);

    expect(translated).toBeInstanceOf(ConfigurationError);
    expect(translated.message).toContain('Qdrant dimension configuration error');
  });

  it('should extract HTTP status from response object', () => {
    const originalError = new Error('Request failed') as any;
    originalError.response = { status: 503 };
    
    const context = translator.extractContext(originalError);
    
    expect(context.httpStatus).toBe(503);
  });
});

describe('Error Factory Functions', () => {
  it('should create SurrealErrorTranslator for surreal backend', () => {
    const translator = createErrorTranslator('surreal');
    expect(translator).toBeInstanceOf(SurrealErrorTranslator);
  });

  it('should create QdrantErrorTranslator for qdrant backend', () => {
    const translator = createErrorTranslator('qdrant');
    expect(translator).toBeInstanceOf(QdrantErrorTranslator);
  });

  it('should create generic translator for unknown backend', () => {
    const translator = createErrorTranslator('unknown');
    const error = new Error('Test error');
    const translated = translator.translate(error);
    
    expect(translated).toBeInstanceOf(OperationError);
    expect(translated.message).toContain('Unknown backend error');
  });
});

describe('Utility Functions', () => {
  it('should identify VectorStoreError instances', () => {
    const vectorError = new ConnectionError('Test');
    const regularError = new Error('Test');
    
    expect(isVectorStoreError(vectorError)).toBe(true);
    expect(isVectorStoreError(regularError)).toBe(false);
    expect(isVectorStoreError('string')).toBe(false);
    expect(isVectorStoreError(null)).toBe(false);
  });

  it('should extract error messages from various types', () => {
    expect(getErrorMessage(new Error('Error message'))).toBe('Error message');
    expect(getErrorMessage('String error')).toBe('String error');
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage(null)).toBe('null');
  });

  it('should normalize Error objects to VectorStoreError', () => {
    const error = new Error('Test error');
    const normalized = normalizeError(error, 'surreal');
    
    expect(normalized).toBeInstanceOf(OperationError);
    expect(normalized.message).toContain('SurrealDB operation failed');
  });

  it('should pass through existing VectorStoreError instances', () => {
    const originalError = new ConnectionError('Test');
    const normalized = normalizeError(originalError);
    
    expect(normalized).toBe(originalError);
  });

  it('should handle non-Error objects', () => {
    const normalized = normalizeError('String error');
    
    expect(normalized).toBeInstanceOf(OperationError);
    expect(normalized.message).toBe('Operation failed: String error');
    expect(normalized.context?.originalError).toBe('String error');
  });
});

describe('Error Retryability Detection', () => {
  const translator = new SurrealErrorTranslator();

  it('should detect retryable error patterns', () => {
    const retryableErrors = [
      new Error('Connection timeout'),
      new Error('Network error'),
      new Error('Temporary unavailable'),
      new Error('Rate limit exceeded'),
      new Error('Service throttled')
    ];

    retryableErrors.forEach(error => {
      expect(translator.isRetryable(error)).toBe(true);
    });
  });

  it('should detect non-retryable error patterns', () => {
    const nonRetryableErrors = [
      new Error('Invalid syntax'),
      new Error('Permission denied'),
      new Error('Schema violation')
    ];

    nonRetryableErrors.forEach(error => {
      expect(translator.isRetryable(error)).toBe(false);
    });
  });
});