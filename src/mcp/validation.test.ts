import { describe, it, expect } from 'vitest';
import { 
  validateInput, 
  VALIDATION_SCHEMAS,
  AnalyzeCodebaseSchema,
  GetPatternRecommendationsSchema
} from '../mcp/validation.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('Input Validation', () => {
  describe('validateInput function', () => {
    it('should validate correct input successfully', () => {
      const validInput = { path: '/test/path' };
      const result = validateInput(AnalyzeCodebaseSchema, validInput, 'test_tool');
      
      expect(result).toEqual(validInput);
    });

    it('should throw McpError for invalid input', () => {
      const invalidInput = { path: '' }; // Empty path should fail
      
      expect(() => {
        validateInput(AnalyzeCodebaseSchema, invalidInput, 'test_tool');
      }).toThrow(McpError);
    });

    it('should provide detailed error messages', () => {
      const invalidInput = { path: 123 }; // Wrong type
      
      try {
        validateInput(AnalyzeCodebaseSchema, invalidInput, 'test_tool');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as McpError).message).toContain('Invalid input for test_tool');
        expect((error as McpError).message).toContain('path');
      }
    });

    it('should handle non-Zod errors', () => {
      const mockSchema = {
        parse: () => { throw new Error('Generic error'); }
      } as any;
      
      expect(() => {
        validateInput(mockSchema, {}, 'test_tool');
      }).toThrow(McpError);
    });
  });

  describe('Schema Validation', () => {
    describe('AnalyzeCodebaseSchema', () => {
      it('should accept valid path', () => {
        const input = { path: '/valid/path' };
        const result = AnalyzeCodebaseSchema.parse(input);
        expect(result.path).toBe('/valid/path');
      });

      it('should reject empty path', () => {
        expect(() => {
          AnalyzeCodebaseSchema.parse({ path: '' });
        }).toThrow();
      });

      it('should reject missing path', () => {
        expect(() => {
          AnalyzeCodebaseSchema.parse({});
        }).toThrow();
      });
    });

    describe('GetPatternRecommendationsSchema', () => {
      it('should accept valid pattern request', () => {
        const input = { problemDescription: 'Need help with async patterns' };
        const result = GetPatternRecommendationsSchema.parse(input);
        expect(result.problemDescription).toBe('Need help with async patterns');
      });

      it('should reject empty problem description', () => {
        expect(() => {
          GetPatternRecommendationsSchema.parse({ problemDescription: '' });
        }).toThrow();
      });

      it('should reject missing problem description', () => {
        expect(() => {
          GetPatternRecommendationsSchema.parse({});
        }).toThrow();
      });
    });

    // AutoLearnIfNeededSchema, GetSystemStatusSchema, and ContributeInsightsSchema removed in Phase 3
    // These tools are not in the whitelisted MCP tools per requirement 9.2
  });

  describe('VALIDATION_SCHEMAS mapping', () => {
    it('should contain all expected tool schemas', () => {
      // Phase 3: Whitelisted tools only
      const expectedTools = [
        'analyze_codebase',
        'search_codebase',
        'learn_codebase_intelligence',
        'get_pattern_recommendations',
        'get_project_blueprint',
        'get_intelligence_metrics'
      ];

      expectedTools.forEach(toolName => {
        expect(VALIDATION_SCHEMAS).toHaveProperty(toolName);
        expect(VALIDATION_SCHEMAS[toolName as keyof typeof VALIDATION_SCHEMAS]).toBeDefined();
      });

      expect(Object.keys(VALIDATION_SCHEMAS)).toHaveLength(6);
    });

    it('should have working schemas for all tools', () => {
      Object.entries(VALIDATION_SCHEMAS).forEach(([toolName, schema]) => {
        expect(typeof schema.parse).toBe('function');
        
        // Try to parse empty object (should either work with defaults or fail gracefully)
        try {
          schema.parse({});
          // If it succeeds, that's fine (tool has all optional params)
        } catch (error) {
          // If it fails, should be a validation error (tool has required params)
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null and undefined inputs', () => {
      expect(() => {
        validateInput(AnalyzeCodebaseSchema, null, 'test');
      }).toThrow(McpError);

      expect(() => {
        validateInput(AnalyzeCodebaseSchema, undefined, 'test');
      }).toThrow(McpError);
    });

    it('should handle nested validation errors', () => {
      // Test with whitelisted tool instead
      try {
        validateInput(GetPatternRecommendationsSchema, { /* missing problemDescription */ }, 'get_pattern_recommendations');
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain('problemDescription');
      }
    });
  });
});
