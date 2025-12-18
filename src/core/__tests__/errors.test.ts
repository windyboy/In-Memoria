/**
 * Tests for standardized error handling
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  PathError,
  LearningError,
  StorageError,
  SearchError,
  translateError,
  isInMemoriaError,
  getErrorMessage,
  withErrorTranslation
} from '../errors.js';

describe('Standardized Error Hierarchy', () => {
  describe('Error Classes', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.category).toBe('validation');
      expect(error.message).toBe('Validation failed: Invalid input');
    });

    it('should create PathError with correct properties', () => {
      const error = new PathError('File not found');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PathError);
      expect(error.name).toBe('PathError');
      expect(error.code).toBe('PATH_ERROR');
      expect(error.category).toBe('path');
      expect(error.message).toBe('Path error: File not found');
    });

    it('should create LearningError with correct properties', () => {
      const error = new LearningError('Analysis failed');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LearningError);
      expect(error.name).toBe('LearningError');
      expect(error.code).toBe('LEARNING_ERROR');
      expect(error.category).toBe('learning');
      expect(error.message).toBe('Learning failed: Analysis failed');
    });

    it('should create StorageError with correct properties', () => {
      const error = new StorageError('Database connection failed');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('StorageError');
      expect(error.code).toBe('STORAGE_ERROR');
      expect(error.category).toBe('storage');
      expect(error.message).toBe('Storage operation failed: Database connection failed');
    });

    it('should create SearchError with correct properties', () => {
      const error = new SearchError('Query parsing failed');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SearchError);
      expect(error.name).toBe('SearchError');
      expect(error.code).toBe('SEARCH_ERROR');
      expect(error.category).toBe('search');
      expect(error.message).toBe('Search failed: Query parsing failed');
    });

    it('should preserve cause error', () => {
      const originalError = new Error('Original error');
      const error = new ValidationError('Validation failed', originalError);
      
      expect(error.cause).toBe(originalError);
    });
  });

  describe('Error Utilities', () => {
    it('should identify InMemoriaError correctly', () => {
      const validationError = new ValidationError('Test');
      const regularError = new Error('Test');
      
      expect(isInMemoriaError(validationError)).toBe(true);
      expect(isInMemoriaError(regularError)).toBe(false);
      expect(isInMemoriaError('string')).toBe(false);
      expect(isInMemoriaError(null)).toBe(false);
    });

    it('should extract error messages correctly', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
      expect(getErrorMessage('String error')).toBe('String error');
      expect(getErrorMessage(123)).toBe('123');
      expect(getErrorMessage(null)).toBe('null');
    });

    it('should format error for logging', () => {
      const error = new ValidationError('Test validation');
      const logString = error.toLogString();
      
      expect(logString).toContain('[VALIDATION_ERROR]');
      expect(logString).toContain('Validation failed: Test validation');
    });

    it('should convert error to JSON', () => {
      const originalError = new Error('Original');
      const error = new PathError('Test path error', originalError);
      const json = error.toJSON();
      
      expect(json).toEqual({
        name: 'PathError',
        code: 'PATH_ERROR',
        category: 'path',
        message: 'Path error: Test path error',
        cause: {
          name: 'Error',
          message: 'Original'
        }
      });
    });
  });

  describe('Error Translation', () => {
    it('should return InMemoriaError as-is', () => {
      const originalError = new ValidationError('Test');
      const translated = translateError(originalError);
      
      expect(translated).toBe(originalError);
    });

    it('should translate path-related errors', () => {
      const fileNotFoundError = new Error('ENOENT: no such file or directory');
      const translated = translateError(fileNotFoundError);
      
      expect(translated).toBeInstanceOf(PathError);
      expect(translated.message).toContain('ENOENT');
    });

    it('should translate validation errors', () => {
      const validationError = new Error('Invalid parameter value');
      const translated = translateError(validationError);
      
      expect(translated).toBeInstanceOf(ValidationError);
      expect(translated.message).toContain('Invalid parameter');
    });

    it('should translate storage errors', () => {
      const dbError = new Error('Database connection failed');
      const translated = translateError(dbError);
      
      expect(translated).toBeInstanceOf(StorageError);
      expect(translated.message).toContain('Database connection failed');
    });

    it('should translate search errors', () => {
      const searchError = new Error('Search index corrupted');
      const translated = translateError(searchError);
      
      expect(translated).toBeInstanceOf(SearchError);
      expect(translated.message).toContain('Search index corrupted');
    });

    it('should default to LearningError for unknown errors', () => {
      const unknownError = new Error('Unknown error type');
      const translated = translateError(unknownError);
      
      expect(translated).toBeInstanceOf(LearningError);
      expect(translated.message).toContain('Unknown error type');
    });

    it('should add context to translated errors', () => {
      const error = new Error('Test error');
      const translated = translateError(error, 'Test context');
      
      expect(translated.message).toContain('Test context: Test error');
    });

    it('should handle non-Error objects', () => {
      const translated = translateError('String error', 'Context');
      
      expect(translated).toBeInstanceOf(LearningError);
      expect(translated.message).toContain('Context: String error');
    });
  });

  describe('Error Translation Wrapper', () => {
    it('should wrap async functions and translate errors', async () => {
      const failingFunction = async () => {
        throw new Error('Database connection failed');
      };

      const wrappedFunction = withErrorTranslation(failingFunction, 'Test context');

      await expect(wrappedFunction()).rejects.toThrow(StorageError);
      
      try {
        await wrappedFunction();
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).message).toContain('Test context');
      }
    });

    it('should pass through successful function calls', async () => {
      const successFunction = async (value: string) => {
        return `Success: ${value}`;
      };

      const wrappedFunction = withErrorTranslation(successFunction, 'Test context');
      const result = await wrappedFunction('test');

      expect(result).toBe('Success: test');
    });
  });
});