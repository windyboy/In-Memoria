/**
 * Enhanced error handling system for vector backend abstraction
 * 
 * This module provides a standardized error hierarchy that normalizes
 * backend-specific errors into consistent types and messages.
 */

/**
 * Error categories for classification and handling
 */
export type ErrorCategory = 'connection' | 'validation' | 'operation' | 'configuration';

/**
 * Base class for all vector store errors
 * 
 * Provides a consistent interface for error handling across all vector backends
 * with standardized error codes, categories, and retry behavior.
 */
export abstract class VectorStoreError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  abstract readonly retryable: boolean;
  
  constructor(
    message: string, 
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a sanitized version of the error for logging
   * Removes sensitive information while preserving debugging context
   */
  toLogSafeObject(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      retryable: this.retryable,
      message: this.message,
      context: this.sanitizeContext(this.context),
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message
      } : undefined
    };
  }

  /**
   * Sanitize context object for safe logging
   * Removes potential sensitive information like API keys, passwords, etc.
   */
  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;
    
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'apikey', 'token', 'secret', 'auth', 'credential'];
    
    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

/**
 * Connection-related errors (network, authentication, etc.)
 * These errors are typically retryable after a delay
 */
export class ConnectionError extends VectorStoreError {
  readonly code = 'VECTOR_CONNECTION_ERROR';
  readonly category: ErrorCategory = 'connection';
  readonly retryable = true;

  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(`Connection failed: ${message}`, cause, context);
  }
}

/**
 * Validation errors (invalid input, schema violations, etc.)
 * These errors are not retryable as they indicate client-side issues
 */
export class ValidationError extends VectorStoreError {
  readonly code = 'VECTOR_VALIDATION_ERROR';
  readonly category: ErrorCategory = 'validation';
  readonly retryable = false;

  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(`Validation failed: ${message}`, cause, context);
  }
}

/**
 * Operation errors (query failures, storage issues, etc.)
 * These errors may be retryable depending on the specific cause
 */
export class OperationError extends VectorStoreError {
  readonly code = 'VECTOR_OPERATION_ERROR';
  readonly category: ErrorCategory = 'operation';
  readonly retryable = true;

  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>,
    retryable: boolean = true
  ) {
    super(`Operation failed: ${message}`, cause, context);
    // Allow override of retryable behavior for specific operation errors
    (this as any).retryable = retryable;
  }
}

/**
 * Configuration errors (invalid settings, missing required config, etc.)
 * These errors are not retryable as they require configuration changes
 */
export class ConfigurationError extends VectorStoreError {
  readonly code = 'VECTOR_CONFIGURATION_ERROR';
  readonly category: ErrorCategory = 'configuration';
  readonly retryable = false;

  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(`Configuration error: ${message}`, cause, context);
  }
}

/**
 * Interface for translating backend-specific errors to standardized errors
 */
export interface ErrorTranslator {
  /**
   * Translate a backend-specific error to a standardized VectorStoreError
   */
  translate(error: Error): VectorStoreError;
  
  /**
   * Determine if an error is retryable based on backend-specific knowledge
   */
  isRetryable(error: Error): boolean;
  
  /**
   * Extract relevant context from a backend-specific error
   */
  extractContext(error: Error): Record<string, unknown>;
}

/**
 * Base implementation of ErrorTranslator with common patterns
 */
export abstract class BaseErrorTranslator implements ErrorTranslator {
  abstract translate(error: Error): VectorStoreError;
  
  isRetryable(error: Error): boolean {
    // Common patterns for retryable errors
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /temporary/i,
      /unavailable/i,
      /rate limit/i,
      /throttle/i
    ];
    
    const message = String(error.message || error || '').toLowerCase();
    return retryablePatterns.some(pattern => pattern.test(message));
  }
  
  extractContext(error: Error): Record<string, unknown> {
    const context: Record<string, unknown> = {
      originalErrorName: error.name,
      originalErrorMessage: String(error.message || error || '')
    };
    
    // Extract additional context from error properties
    if ('code' in error) {
      context.originalErrorCode = (error as any).code;
    }
    
    if ('status' in error) {
      context.httpStatus = (error as any).status;
    }
    
    if ('response' in error && (error as any).response?.status) {
      context.httpStatus = (error as any).response.status;
    }
    
    return context;
  }
}

/**
 * Error translator for SurrealDB-specific errors
 */
export class SurrealErrorTranslator extends BaseErrorTranslator {
  translate(error: Error): VectorStoreError {
    const context = this.extractContext(error);
    const message = String(error.message || error || '');
    
    // SurrealDB-specific error patterns
    if (typeof message === 'string' && (message.includes('Connection') || message.includes('connect'))) {
      return new ConnectionError(
        `SurrealDB connection failed: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && message.includes('already exists')) {
      return new ValidationError(
        `SurrealDB schema conflict: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && (message.includes('not initialized') || message.includes('Call initialize()'))) {
      return new ConfigurationError(
        `SurrealDB not properly initialized: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && (message.includes('Embedding') || message.includes('embedding'))) {
      return new OperationError(
        `SurrealDB embedding operation failed: ${message}`,
        error,
        context
      );
    }
    
    // Default to operation error for unknown SurrealDB errors
    return new OperationError(
      `SurrealDB operation failed: ${message}`,
      error,
      context,
      this.isRetryable(error)
    );
  }
}

/**
 * Error translator for Qdrant-specific errors
 */
export class QdrantErrorTranslator extends BaseErrorTranslator {
  translate(error: Error): VectorStoreError {
    const context = this.extractContext(error);
    const message = String(error.message || error || '');
    
    // Extract HTTP status if available
    const status = (error as any)?.status || (error as any)?.response?.status;
    if (status) {
      context.httpStatus = status;
    }
    
    // Qdrant-specific error patterns
    if (status === 404) {
      return new ValidationError(
        `Qdrant resource not found: ${message}`,
        error,
        context
      );
    }
    
    if (status === 400) {
      return new ValidationError(
        `Qdrant bad request: ${message}`,
        error,
        context
      );
    }
    
    if (status === 401 || status === 403) {
      return new ConnectionError(
        `Qdrant authentication failed: ${message}`,
        error,
        context
      );
    }
    
    if (status >= 500) {
      return new OperationError(
        `Qdrant server error: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && message.includes('collection') && message.includes('dimension')) {
      return new ConfigurationError(
        `Qdrant collection dimension mismatch: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && message.includes('dimension')) {
      return new ConfigurationError(
        `Qdrant dimension configuration error: ${message}`,
        error,
        context
      );
    }
    
    if (typeof message === 'string' && (message.includes('Failed to inspect collection') || 
        message.includes('Failed to create'))) {
      return new OperationError(
        `Qdrant collection operation failed: ${message}`,
        error,
        context
      );
    }
    
    // Default to operation error for unknown Qdrant errors
    return new OperationError(
      `Qdrant operation failed: ${message}`,
      error,
      context,
      this.isRetryable(error)
    );
  }
}

/**
 * Factory function to create appropriate error translator for a backend type
 */
export function createErrorTranslator(backendType: string): ErrorTranslator {
  switch (backendType.toLowerCase()) {
    case 'surreal':
    case 'surrealdb':
      return new SurrealErrorTranslator();
    
    case 'qdrant':
      return new QdrantErrorTranslator();
    
    default:
      // Return a generic translator for unknown backends
      return new class extends BaseErrorTranslator {
        translate(error: Error): VectorStoreError {
          const context = this.extractContext(error);
          return new OperationError(
            `Unknown backend error: ${error.message}`,
            error,
            context,
            this.isRetryable(error)
          );
        }
      };
  }
}

/**
 * Utility function to check if an error is a VectorStoreError
 */
export function isVectorStoreError(error: unknown): error is VectorStoreError {
  return error instanceof VectorStoreError;
}

/**
 * Utility function to safely extract error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return String(error);
}

/**
 * Utility function to create a standardized error from any error type
 */
export function normalizeError(error: unknown, backendType?: string): VectorStoreError {
  if (isVectorStoreError(error)) {
    return error;
  }
  
  if (error instanceof Error) {
    if (backendType) {
      const translator = createErrorTranslator(backendType);
      return translator.translate(error);
    }
    
    // Generic translation without backend-specific knowledge
    return new OperationError(
      error.message,
      error,
      { originalErrorName: error.name }
    );
  }
  
  // Handle non-Error objects
  const message = getErrorMessage(error);
  return new OperationError(
    message,
    undefined,
    { originalError: error }
  );
}