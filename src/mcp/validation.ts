import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Input validation schemas for all MCP tools
export const AnalyzeCodebaseSchema = z.object({
  path: z.string().min(1, 'Path is required')
});

export const SearchCodebaseSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  type: z.enum(['semantic', 'text', 'pattern']).optional().default('text'),
  language: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20)
});

export const LearnCodebaseIntelligenceSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  force: z.boolean().optional().default(false)
});

// Phase 3: Whitelisted tool schemas only
export const GetPatternRecommendationsSchema = z.object({
  problemDescription: z.string().min(1, 'Problem description is required'),
  currentFile: z.string().optional(),
  selectedCode: z.string().optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  includeRelatedFiles: z.boolean().optional()
});

export const GetProjectBlueprintSchema = z.object({
  path: z.string().optional(),
  includeFeatureMap: z.boolean().optional().default(true)
});

export const GetIntelligenceMetricsSchema = z.object({
  includeBreakdown: z.boolean().optional().default(true)
});

// Validation function
export function validateInput(schema: z.ZodSchema<any>, input: any, toolName: string): any {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid input for ${toolName}: ${errorMessages}`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Validation error for ${toolName}: ${(error as Error).message}`
    );
  }
}

// Phase 3: Tool name to schema mapping - Whitelisted tools only
export const VALIDATION_SCHEMAS = {
  'analyze_codebase': AnalyzeCodebaseSchema,
  'search_codebase': SearchCodebaseSchema,
  'learn_codebase_intelligence': LearnCodebaseIntelligenceSchema,
  'get_pattern_recommendations': GetPatternRecommendationsSchema,
  'get_project_blueprint': GetProjectBlueprintSchema,
  'get_intelligence_metrics': GetIntelligenceMetricsSchema
} as const;
