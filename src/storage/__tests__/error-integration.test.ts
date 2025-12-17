import { describe, it, expect } from 'vitest';
import {
  VectorStoreError,
  ConnectionError,
  ValidationError,
  OperationError,
  ConfigurationError,
  createErrorTranslator,
  normalizeError
} from '../vector-errors.js';

describe('Error Handling Integration', () => {
  it('should demonstrate complete error handling workflow', () => {
    // Simulate a SurrealDB connection error
    const surrealError = new Error('Connection failed to database');
    const surrealTranslator = createErrorTranslator('surreal');
    const translatedError = surrealTranslator.translate(surrealError);

    expect(translatedError).toBeInstanceOf(ConnectionError);
    expect(translatedError.code).toBe('VECTOR_CONNECTION_ERROR');
    expect(translatedError.category).toBe('connection');
    expect(translatedError.retryable).toBe(true);
    expect(translatedError.message).toContain('SurrealDB connection failed');

    // Test log-safe serialization
    const logSafe = translatedError.toLogSafeObject();
    expect(logSafe.code).toBe('VECTOR_CONNECTION_ERROR');
    expect(logSafe.retryable).toBe(true);
    expect((logSafe.cause as any)?.message).toBe('Connection failed to database');
  });

  it('should demonstrate Qdrant error translation', () => {
    // Simulate a Qdrant HTTP 404 error
    const qdrantError = new Error('Collection not found') as any;
    qdrantError.status = 404;
    
    const qdrantTranslator = createErrorTranslator('qdrant');
    const translatedError = qdrantTranslator.translate(qdrantError);

    expect(translatedError).toBeInstanceOf(ValidationError);
    expect(translatedError.code).toBe('VECTOR_VALIDATION_ERROR');
    expect(translatedError.category).toBe('validation');
    expect(translatedError.retryable).toBe(false);
    expect(translatedError.message).toContain('Qdrant resource not found');
  });

  it('should demonstrate error normalization for unknown backends', () => {
    const unknownError = new Error('Some database error');
    const normalized = normalizeError(unknownError, 'unknown-backend');

    expect(normalized).toBeInstanceOf(OperationError);
    expect(normalized.code).toBe('VECTOR_OPERATION_ERROR');
    expect(normalized.message).toContain('Unknown backend error');
  });

  it('should demonstrate context sanitization', () => {
    const sensitiveContext = {
      apiKey: 'secret-key-123',
      password: 'my-password',
      connectionString: 'mongodb://user:pass@host',
      normalField: 'safe-value'
    };

    const error = new ConnectionError('Test error', undefined, sensitiveContext);
    const logSafe = error.toLogSafeObject();

    expect((logSafe.context as any)?.apiKey).toBe('[REDACTED]');
    expect((logSafe.context as any)?.password).toBe('[REDACTED]');
    expect((logSafe.context as any)?.normalField).toBe('safe-value');
  });

  it('should demonstrate error chaining and cause preservation', () => {
    const rootCause = new Error('Network timeout');
    const wrappedError = new ConnectionError('Database connection failed', rootCause);
    
    expect(wrappedError.cause).toBe(rootCause);
    expect(wrappedError.message).toContain('Database connection failed');
    
    const logSafe = wrappedError.toLogSafeObject();
    expect((logSafe.cause as any)?.name).toBe('Error');
    expect((logSafe.cause as any)?.message).toBe('Network timeout');
  });

  it('should demonstrate retryability detection', () => {
    const translator = createErrorTranslator('surreal');
    
    // Retryable errors
    expect(translator.isRetryable(new Error('Connection timeout'))).toBe(true);
    expect(translator.isRetryable(new Error('Network unavailable'))).toBe(true);
    expect(translator.isRetryable(new Error('Rate limit exceeded'))).toBe(true);
    
    // Non-retryable errors
    expect(translator.isRetryable(new Error('Invalid syntax'))).toBe(false);
    expect(translator.isRetryable(new Error('Permission denied'))).toBe(false);
  });
});