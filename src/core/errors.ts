/**
 * Standardized Error Hierarchy for In-Memoria Refactor
 * 
 * This module implements the unified error hierarchy as specified in the design document.
 * All services must use these standardized error types for consistent error handling
 * across CLI and MCP interfaces.
 * 
 * Requirements: 10.1 - Standardized error handling with five error types
 */

/**
 * Error categories for classification
 */
export type ErrorCategory = 'validation' | 'path' | 'learning' | 'storage' | 'search';

/**
 * Base class for all In-Memoria errors
 * 
 * Provides a consistent interface for error handling with standardized
 * error codes, categories, and context information.
 */
export abstract class InMemoriaError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a formatted error message for logging
   */
  toLogString(): string {
    const parts = [
      `[${this.code}] ${this.message}`
    ];
    
    if (this.cause) {
      parts.push(`Caused by: ${this.cause.message}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message
      } : undefined
    };
  }
}

/**
 * ValidationError - Errors related to input validation
 * 
 * Used when user input or parameters fail validation checks.
 * These errors are not retryable without correcting the input.
 * 
 * Examples:
 * - Invalid parameter values
 * - Missing required parameters
 * - Schema validation failures
 * - Invalid configuration values
 */
export class ValidationError extends InMemoriaError {
  readonly code = 'VALIDATION_ERROR';
  readonly category: ErrorCategory = 'validation';

  constructor(
    message: string,
    cause?: Error
  ) {
    super(`Validation failed: ${message}`, cause);
  }
}

/**
 * PathError - Errors related to file system paths
 * 
 * Used when path operations fail due to invalid paths, missing files,
 * or permission issues.
 * 
 * Examples:
 * - File not found
 * - Directory not found
 * - Permission denied
 * - Invalid path format
 * - Path traversal attempts
 */
export class PathError extends InMemoriaError {
  readonly code = 'PATH_ERROR';
  readonly category: ErrorCategory = 'path';

  constructor(
    message: string,
    cause?: Error
  ) {
    super(`Path error: ${message}`, cause);
  }
}

/**
 * LearningError - Errors during the learning process
 * 
 * Used when the learning process fails due to analysis errors,
 * concept extraction failures, or pattern discovery issues.
 * 
 * Examples:
 * - Codebase analysis failures
 * - Concept extraction errors
 * - Pattern discovery failures
 * - Semantic analysis errors
 * - Language detection failures
 */
export class LearningError extends InMemoriaError {
  readonly code = 'LEARNING_ERROR';
  readonly category: ErrorCategory = 'learning';

  constructor(
    message: string,
    cause?: Error
  ) {
    super(`Learning failed: ${message}`, cause);
  }
}

/**
 * StorageError - Errors related to data storage operations
 * 
 * Used when database or vector store operations fail.
 * These errors may be retryable depending on the specific cause.
 * 
 * Examples:
 * - Database connection failures
 * - Database write failures
 * - Vector store initialization errors
 * - Data migration failures
 * - Schema validation errors
 */
export class StorageError extends InMemoriaError {
  readonly code = 'STORAGE_ERROR';
  readonly category: ErrorCategory = 'storage';

  constructor(
    message: string,
    cause?: Error
  ) {
    super(`Storage operation failed: ${message}`, cause);
  }
}

/**
 * SearchError - Errors during search operations
 * 
 * Used when search operations fail due to query errors,
 * index issues, or search engine failures.
 * 
 * Examples:
 * - Semantic search failures
 * - Pattern search errors
 * - Text search failures
 * - Query parsing errors
 * - Search index corruption
 */
export class SearchError extends InMemoriaError {
  readonly code = 'SEARCH_ERROR';
  readonly category: ErrorCategory = 'search';

  constructor(
    message: string,
    cause?: Error
  ) {
    super(`Search failed: ${message}`, cause);
  }
}

/**
 * Utility function to check if an error is an InMemoriaError
 */
export function isInMemoriaError(error: unknown): error is InMemoriaError {
  return error instanceof InMemoriaError;
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
 * Translate external library errors to standardized InMemoriaError types
 * 
 * This function analyzes error messages and types to determine the appropriate
 * standardized error type to use.
 */
export function translateError(error: unknown, context?: string): InMemoriaError {
  // If already an InMemoriaError, return as-is
  if (isInMemoriaError(error)) {
    return error;
  }
  
  // Convert to Error if not already
  const originalError = error instanceof Error ? error : new Error(String(error));
  const message = originalError.message.toLowerCase();
  const contextPrefix = context ? `${context}: ` : '';
  
  // Path-related errors
  if (
    message.includes('enoent') ||
    message.includes('file not found') ||
    message.includes('directory not found') ||
    message.includes('no such file') ||
    message.includes('permission denied') ||
    message.includes('eacces') ||
    message.includes('invalid path') ||
    message.includes('path traversal')
  ) {
    return new PathError(`${contextPrefix}${originalError.message}`, originalError);
  }
  
  // Validation errors
  if (
    message.includes('validation') ||
    message.includes('invalid parameter') ||
    message.includes('invalid input') ||
    message.includes('missing required') ||
    message.includes('schema') ||
    message.includes('invalid config')
  ) {
    return new ValidationError(`${contextPrefix}${originalError.message}`, originalError);
  }
  
  // Storage errors
  if (
    message.includes('database') ||
    message.includes('sqlite') ||
    message.includes('vector store') ||
    message.includes('storage') ||
    message.includes('connection') ||
    message.includes('migration') ||
    message.includes('surreal') ||
    message.includes('qdrant')
  ) {
    return new StorageError(`${contextPrefix}${originalError.message}`, originalError);
  }
  
  // Search errors
  if (
    message.includes('search') ||
    message.includes('query') ||
    message.includes('index') ||
    message.includes('semantic') ||
    message.includes('pattern search')
  ) {
    return new SearchError(`${contextPrefix}${originalError.message}`, originalError);
  }
  
  // Learning errors (default for analysis/learning operations)
  if (
    message.includes('learning') ||
    message.includes('analysis') ||
    message.includes('concept') ||
    message.includes('pattern') ||
    message.includes('parse') ||
    message.includes('extract') ||
    message.includes('language')
  ) {
    return new LearningError(`${contextPrefix}${originalError.message}`, originalError);
  }
  
  // Default to LearningError for unknown errors
  return new LearningError(`${contextPrefix}${originalError.message}`, originalError);
}

/**
 * Wrap a function to automatically translate errors
 * 
 * This utility wraps async functions to automatically catch and translate
 * errors to the standardized error hierarchy.
 */
export function withErrorTranslation<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw translateError(error, context);
    }
  }) as T;
}
