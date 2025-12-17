import { SemanticEngine } from '../../engines/semantic-engine.js';
import { PatternEngine, PatternExtractionResult } from '../../engines/pattern-engine.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';
import { Logger } from '../../utils/logger.js';
import { PathValidator } from '../../utils/path-validator.js';

/**
 * Language metrics for a codebase
 */
export interface LanguageMetrics {
  languages: Array<{
    name: string;
    fileCount: number;
    lineCount: number;
    percentage: number;
  }>;
  totalFiles: number;
  totalLines: number;
  primaryLanguage: string;
}

/**
 * Complexity metrics for a codebase
 */
export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  lines: number;
  maintainabilityIndex?: number;
  technicalDebt?: {
    score: number;
    issues: string[];
  };
}

/**
 * Extracted semantic concepts from analysis
 */
export interface ExtractedConcept {
  id: string;
  name: string;
  type: string;
  confidence: number;
  filePath: string;
  lineRange: { start: number; end: number };
  relationships?: Record<string, any>;
}

/**
 * Complete codebase analysis result
 */
export interface CodebaseAnalysis {
  projectPath: string;
  languages: string[];
  frameworks: string[];
  complexity: ComplexityMetrics;
  concepts: ExtractedConcept[];
  patterns: PatternExtractionResult[];
  entryPoints?: Array<{
    type: string;
    filePath: string;
    framework?: string;
  }>;
  keyDirectories?: Array<{
    path: string;
    type: string;
    fileCount: number;
  }>;
  analysisStatus: 'normal' | 'degraded';
  errors?: string[];
}

/**
 * AnalysisService provides read-only analysis operations
 * 
 * This service integrates with existing engines to provide codebase analysis
 * without performing any database write operations. It serves as a pure
 * analysis layer that can be safely called from interface adapters.
 */
export class AnalysisService {
  constructor(
    private semanticEngine: SemanticEngine,
    private patternEngine: PatternEngine,
    private database: SQLiteDatabase
  ) {}

  /**
   * Analyze a complete codebase and return comprehensive analysis results
   * 
   * @param projectPath - Path to the project to analyze
   * @returns Promise<CodebaseAnalysis> - Complete analysis results
   */
  async analyzeCodebase(projectPath: string): Promise<CodebaseAnalysis> {
    try {
      Logger.info(`Starting codebase analysis for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'AnalysisService.analyzeCodebase');
      
      // Get semantic analysis from existing engine
      const semanticResult = await this.semanticEngine.analyzeCodebase(projectPath);
      
      // Extract patterns using pattern engine
      const patterns = await this.patternEngine.extractPatterns(projectPath);
      
      // Convert semantic concepts to our interface
      const concepts: ExtractedConcept[] = semanticResult.concepts.map(concept => ({
        id: concept.name, // Use name as ID for now, could be enhanced
        name: concept.name,
        type: concept.type,
        confidence: concept.confidence,
        filePath: projectPath, // Default to project path, could be enhanced with actual file paths
        lineRange: { start: 1, end: 1 }, // Default range, could be enhanced
        relationships: {}
      }));
      
      const analysis: CodebaseAnalysis = {
        projectPath,
        languages: semanticResult.languages,
        frameworks: semanticResult.frameworks,
        complexity: {
          cyclomatic: semanticResult.complexity.cyclomatic,
          cognitive: semanticResult.complexity.cognitive,
          lines: semanticResult.complexity.lines
        },
        concepts,
        patterns,
        entryPoints: semanticResult.entryPoints,
        keyDirectories: semanticResult.keyDirectories,
        analysisStatus: semanticResult.analysisStatus || 'normal',
        errors: semanticResult.errors
      };
      
      Logger.info(`Codebase analysis completed. Found ${concepts.length} concepts and ${patterns.length} patterns`);
      return analysis;
      
    } catch (error) {
      Logger.error('Codebase analysis failed:', error);
      throw new Error(`Failed to analyze codebase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get language metrics for a codebase
   * 
   * @param projectPath - Path to the project
   * @returns Promise<LanguageMetrics> - Language distribution and metrics
   */
  async getLanguageMetrics(projectPath: string): Promise<LanguageMetrics> {
    try {
      Logger.info(`Getting language metrics for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'AnalysisService.getLanguageMetrics');
      
      // Get basic analysis to extract languages
      const analysis = await this.semanticEngine.analyzeCodebase(projectPath);
      
      // For now, provide basic metrics based on detected languages
      // This could be enhanced with actual file counting and line counting
      const languages = analysis.languages.map((lang) => ({
        name: lang,
        fileCount: Math.max(1, Math.floor(analysis.complexity.lines / (analysis.languages.length * 100))), // Rough estimate
        lineCount: Math.floor(analysis.complexity.lines / analysis.languages.length), // Distribute lines evenly
        percentage: Math.floor(100 / analysis.languages.length) // Equal distribution for now
      }));
      
      const totalFiles = languages.reduce((sum, lang) => sum + lang.fileCount, 0);
      const totalLines = analysis.complexity.lines;
      const primaryLanguage = languages.length > 0 ? languages[0].name : 'unknown';
      
      const metrics: LanguageMetrics = {
        languages,
        totalFiles,
        totalLines,
        primaryLanguage
      };
      
      Logger.info(`Language metrics completed. Primary language: ${primaryLanguage}, Total files: ${totalFiles}`);
      return metrics;
      
    } catch (error) {
      Logger.error('Language metrics analysis failed:', error);
      throw new Error(`Failed to get language metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get complexity metrics for a codebase
   * 
   * @param projectPath - Path to the project
   * @returns Promise<ComplexityMetrics> - Complexity analysis results
   */
  async getComplexityMetrics(projectPath: string): Promise<ComplexityMetrics> {
    try {
      Logger.info(`Getting complexity metrics for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'AnalysisService.getComplexityMetrics');
      
      // Get complexity from semantic analysis
      const analysis = await this.semanticEngine.analyzeCodebase(projectPath);
      
      // Calculate maintainability index (simplified formula)
      const maintainabilityIndex = this.calculateMaintainabilityIndex(analysis.complexity);
      
      // Assess technical debt based on complexity
      const technicalDebt = this.assessTechnicalDebt(analysis.complexity);
      
      const metrics: ComplexityMetrics = {
        cyclomatic: analysis.complexity.cyclomatic,
        cognitive: analysis.complexity.cognitive,
        lines: analysis.complexity.lines,
        maintainabilityIndex,
        technicalDebt
      };
      
      Logger.info(`Complexity metrics completed. Cyclomatic: ${metrics.cyclomatic}, Cognitive: ${metrics.cognitive}`);
      return metrics;
      
    } catch (error) {
      Logger.error('Complexity metrics analysis failed:', error);
      throw new Error(`Failed to get complexity metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract semantic concepts from a codebase
   * 
   * @param projectPath - Path to the project
   * @returns Promise<ExtractedConcept[]> - Array of extracted concepts
   */
  async extractConcepts(projectPath: string): Promise<ExtractedConcept[]> {
    try {
      Logger.info(`Extracting concepts for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'AnalysisService.extractConcepts');
      
      // Get existing concepts from database (read-only)
      const storedConcepts = this.database.getSemanticConcepts();
      
      // Convert stored concepts to our interface
      const concepts: ExtractedConcept[] = storedConcepts.map(concept => ({
        id: concept.id,
        name: concept.conceptName,
        type: concept.conceptType,
        confidence: concept.confidenceScore,
        filePath: concept.filePath,
        lineRange: concept.lineRange,
        relationships: concept.relationships
      }));
      
      Logger.info(`Extracted ${concepts.length} concepts from database`);
      return concepts;
      
    } catch (error) {
      Logger.error('Concept extraction failed:', error);
      throw new Error(`Failed to extract concepts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate maintainability index based on complexity metrics
   * 
   * @private
   * @param complexity - Complexity metrics
   * @returns number - Maintainability index (0-100)
   */
  private calculateMaintainabilityIndex(complexity: { cyclomatic: number; cognitive: number; lines: number }): number {
    // Simplified maintainability index calculation
    // Real formula is more complex, but this provides a reasonable approximation
    const cyclomaticFactor = Math.max(0, 100 - (complexity.cyclomatic * 2));
    const cognitiveFactor = Math.max(0, 100 - (complexity.cognitive * 3));
    const linesFactor = Math.max(0, 100 - (complexity.lines / 100));
    
    return Math.round((cyclomaticFactor + cognitiveFactor + linesFactor) / 3);
  }

  /**
   * Assess technical debt based on complexity metrics
   * 
   * @private
   * @param complexity - Complexity metrics
   * @returns Technical debt assessment
   */
  private assessTechnicalDebt(complexity: { cyclomatic: number; cognitive: number; lines: number }): {
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 0;
    
    // Assess cyclomatic complexity
    if (complexity.cyclomatic > 20) {
      issues.push('High cyclomatic complexity detected');
      score += 30;
    } else if (complexity.cyclomatic > 10) {
      issues.push('Moderate cyclomatic complexity');
      score += 15;
    }
    
    // Assess cognitive complexity
    if (complexity.cognitive > 25) {
      issues.push('High cognitive complexity detected');
      score += 35;
    } else if (complexity.cognitive > 15) {
      issues.push('Moderate cognitive complexity');
      score += 20;
    }
    
    // Assess lines of code
    if (complexity.lines > 10000) {
      issues.push('Large codebase may be difficult to maintain');
      score += 20;
    } else if (complexity.lines > 5000) {
      issues.push('Medium-sized codebase');
      score += 10;
    }
    
    return {
      score: Math.min(100, score), // Cap at 100
      issues
    };
  }
}

// Export as AnalysisServiceImpl for bootstrap compatibility
export const AnalysisServiceImpl = AnalysisService;