import { SemanticEngine } from '../../engines/semantic-engine.js';
import { PatternEngine } from '../../engines/pattern-engine.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';
import { VectorStore } from '../../storage/vector-store.js';
import { ProgressTracker } from '../../utils/progress-tracker.js';
import { Logger } from '../../utils/logger.js';
import { PathValidator } from '../../utils/path-validator.js';
import { nanoid } from 'nanoid';

/**
 * Learning Service Interface
 * Provides write-only learning and storage operations
 * 
 * This service is the single writer for all database operations.
 * It coordinates learning from codebases and storing intelligence data.
 */

export interface LearningOptions {
  force?: boolean;
  progressCallback?: (current: number, total: number, message: string) => void;
}

export interface LearningResult {
  success: boolean;
  conceptsLearned: number;
  patternsDiscovered: number;
  duration: number;
  errors: string[];
}

export interface ProjectMetadata {
  projectPath: string;
  lastLearned: Date;
  version: string;
  languages: string[];
  frameworks: string[];
}

export interface SemanticConcept {
  id: string;
  name: string;
  type: string;
  confidence: number;
  context?: string;
  relationships?: string[];
}

export interface DeveloperPattern {
  id: string;
  name: string;
  category: string;
  frequency: number;
  examples: any[];
}

/**
 * LearningService - Write-only learning and storage operations
 * 
 * This service is the single writer for all database operations.
 * It coordinates learning from codebases and storing intelligence data.
 */
export interface LearningService {
  /**
   * Learn from a codebase and store the results
   */
  learnFromCodebase(projectPath: string, options?: LearningOptions): Promise<LearningResult>;

  /**
   * Update project metadata
   */
  updateProjectMetadata(projectPath: string, metadata: ProjectMetadata): Promise<void>;

  /**
   * Store semantic concepts (single writer principle)
   */
  storeSemanticConcepts(concepts: SemanticConcept[]): Promise<void>;

  /**
   * Store developer patterns (single writer principle)
   */
  storeDeveloperPatterns(patterns: DeveloperPattern[]): Promise<void>;
}

/**
 * LearningService Implementation - Single Writer for Database Operations
 * 
 * This service is the ONLY component allowed to perform database write operations.
 * It integrates with existing storage systems and engines while maintaining
 * the single writer principle for data consistency.
 */
class LearningServiceImpl implements LearningService {
  private progressTracker: ProgressTracker | null = null;

  constructor(
    private semanticEngine: SemanticEngine,
    private patternEngine: PatternEngine,
    private database: SQLiteDatabase,
    private vectorStore: VectorStore
  ) {}

  /**
   * Learn from a codebase and store the results
   * 
   * This is the main learning method that coordinates the entire learning process.
   * It integrates with existing engines while being the single writer to storage.
   */
  async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let conceptsLearned = 0;
    let patternsDiscovered = 0;

    try {
      Logger.info(`Starting learning process for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'LearningService.learnFromCodebase');

      // Initialize progress tracking
      this.progressTracker = new ProgressTracker();
      this.setupProgressPhases();
      
      // Set up progress callback if provided
      if (options.progressCallback) {
        this.progressTracker.on('progress', (update) => {
          options.progressCallback!(update.current, update.total, update.message || update.phase);
        });
      }

      // Check if already learned and not forcing re-learn
      if (!options.force) {
        const existingIntelligence = await this.checkExistingIntelligence(projectPath);
        if (existingIntelligence && existingIntelligence.concepts > 0) {
          Logger.info(`Using existing intelligence for ${projectPath}`);
          return {
            success: true,
            conceptsLearned: existingIntelligence.concepts,
            patternsDiscovered: existingIntelligence.patterns,
            duration: Date.now() - startTime,
            errors: ['Using existing intelligence (use force: true to re-learn)']
          };
        }
      }

      // Phase 1: Semantic Analysis
      this.progressTracker.startPhase('semantic_analysis');
      Logger.info('Phase 1: Starting semantic analysis...');
      
      // Get basic codebase analysis (languages, frameworks, complexity)
      const codebaseAnalysis = await this.semanticEngine.analyzeCodebase(projectPath);
      this.progressTracker.updateProgress('semantic_analysis', 30, 'Basic codebase analysis complete');
      
      // Extract detailed semantic concepts (pure calculation, no storage)
      const extractedConcepts = await this.semanticEngine.extractSemanticConcepts(
        projectPath,
        options.progressCallback ? (current, total, message) => {
          // Forward progress to the main callback with phase context
          if (options.progressCallback) {
            options.progressCallback(current, total, `Semantic analysis: ${message}`);
          }
        } : undefined
      );
      this.progressTracker.updateProgress('semantic_analysis', 80, 'Concept extraction complete');
      
      // Convert extracted concepts to database format
      const concepts = extractedConcepts.map(concept => ({
        id: concept.id,
        conceptName: concept.name,
        conceptType: concept.type,
        confidenceScore: concept.confidence,
        relationships: concept.relationships,
        evolutionHistory: {},
        filePath: concept.filePath,
        lineRange: concept.lineRange,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      // Store concepts (single writer)
      await this.storeSemanticConceptsInternal(concepts);
      conceptsLearned = concepts.length;
      
      // Build vector index for significant concepts (single writer)
      await this.buildVectorIndexForConcepts(extractedConcepts.filter(c => c.confidence > 0.5));
      
      this.progressTracker.updateProgress('semantic_analysis', 100, `Stored ${conceptsLearned} concepts`);
      Logger.info(`Semantic analysis complete. Learned ${conceptsLearned} concepts`);

      // Phase 2: Pattern Discovery
      this.progressTracker.startPhase('pattern_discovery');
      Logger.info('Phase 2: Starting pattern discovery...');
      
      const patternResults = await this.patternEngine.extractPatterns(projectPath);
      this.progressTracker.updateProgress('pattern_discovery', 50, 'Pattern extraction complete');
      
      // Convert pattern results to developer patterns
      const patterns = patternResults.map(pattern => ({
        patternId: nanoid(),
        patternType: pattern.type,
        patternContent: { description: pattern.description },
        frequency: pattern.frequency,
        contexts: [projectPath],
        examples: [],
        confidence: 0.8,
        createdAt: new Date(),
        lastSeen: new Date()
      }));

      // Store patterns (single writer)
      await this.storeDeveloperPatternsInternal(patterns);
      patternsDiscovered = patterns.length;
      
      this.progressTracker.updateProgress('pattern_discovery', 100, `Stored ${patternsDiscovered} patterns`);
      Logger.info(`Pattern discovery complete. Discovered ${patternsDiscovered} patterns`);

      // Phase 3: Vector Indexing
      this.progressTracker.startPhase('vector_indexing');
      Logger.info('Phase 3: Building vector index...');
      
      await this.buildVectorIndex(concepts, patterns);
      
      this.progressTracker.updateProgress('vector_indexing', 100, 'Vector index complete');
      Logger.info('Vector indexing complete');

      // Phase 4: Metadata Storage
      this.progressTracker.startPhase('metadata_storage');
      Logger.info('Phase 4: Storing project metadata...');
      
      const metadata: ProjectMetadata = {
        projectPath,
        lastLearned: new Date(),
        version: '1.0.0',
        languages: codebaseAnalysis.languages,
        frameworks: codebaseAnalysis.frameworks
      };
      
      await this.updateProjectMetadata(projectPath, metadata);
      
      this.progressTracker.updateProgress('metadata_storage', 100, 'Metadata stored');
      Logger.info('Metadata storage complete');

      // Complete all phases
      this.progressTracker.complete();

      const duration = Date.now() - startTime;
      Logger.info(`Learning completed successfully in ${duration}ms`);

      return {
        success: true,
        conceptsLearned,
        patternsDiscovered,
        duration,
        errors
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      Logger.error('Learning process failed:', error);

      return {
        success: false,
        conceptsLearned,
        patternsDiscovered,
        duration: Date.now() - startTime,
        errors
      };
    } finally {
      // Clean up progress tracker
      this.progressTracker = null;
    }
  }

  /**
   * Update project metadata (single writer)
   */
  async updateProjectMetadata(projectPath: string, metadata: ProjectMetadata): Promise<void> {
    try {
      Logger.info(`Updating project metadata for: ${projectPath}`);
      
      // Validate inputs
      PathValidator.validateProjectPath(projectPath, 'LearningService.updateProjectMetadata');
      
      // Store metadata using database (single writer)
      this.database.insertProjectMetadata({
        projectId: nanoid(),
        projectPath: metadata.projectPath,
        projectName: projectPath.split('/').pop() || 'unknown',
        languagePrimary: metadata.languages[0],
        languagesDetected: metadata.languages,
        frameworkDetected: metadata.frameworks,
        intelligenceVersion: metadata.version,
        lastFullScan: metadata.lastLearned
      });
      
      Logger.info('Project metadata updated successfully');
    } catch (error) {
      Logger.error('Failed to update project metadata:', error);
      throw new Error(`Failed to update project metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store semantic concepts (single writer principle)
   */
  async storeSemanticConcepts(concepts: SemanticConcept[]): Promise<void> {
    try {
      Logger.info(`Storing ${concepts.length} semantic concepts`);
      
      // Convert to database format and store
      const dbConcepts = concepts.map(concept => ({
        id: concept.id,
        conceptName: concept.name,
        conceptType: concept.type,
        confidenceScore: concept.confidence,
        relationships: concept.relationships || {},
        evolutionHistory: {},
        filePath: concept.context || 'unknown',
        lineRange: { start: 1, end: 1 },
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      await this.storeSemanticConceptsInternal(dbConcepts);
      Logger.info('Semantic concepts stored successfully');
    } catch (error) {
      Logger.error('Failed to store semantic concepts:', error);
      throw new Error(`Failed to store semantic concepts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store developer patterns (single writer principle)
   */
  async storeDeveloperPatterns(patterns: DeveloperPattern[]): Promise<void> {
    try {
      Logger.info(`Storing ${patterns.length} developer patterns`);
      
      // Convert to database format and store
      const dbPatterns = patterns.map(pattern => ({
        patternId: pattern.id,
        patternType: pattern.category,
        patternContent: { name: pattern.name },
        frequency: pattern.frequency,
        contexts: ['manual'],
        examples: pattern.examples,
        confidence: 0.8,
        createdAt: new Date(),
        lastSeen: new Date()
      }));

      await this.storeDeveloperPatternsInternal(dbPatterns);
      Logger.info('Developer patterns stored successfully');
    } catch (error) {
      Logger.error('Failed to store developer patterns:', error);
      throw new Error(`Failed to store developer patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Internal method to store semantic concepts (single writer)
   */
  private async storeSemanticConceptsInternal(concepts: any[]): Promise<void> {
    for (const concept of concepts) {
      this.database.insertSemanticConcept(concept);
    }
  }

  /**
   * Internal method to store developer patterns (single writer)
   */
  private async storeDeveloperPatternsInternal(patterns: any[]): Promise<void> {
    for (const pattern of patterns) {
      this.database.insertDeveloperPattern(pattern);
    }
  }

  /**
   * Update pattern usage statistics (single writer)
   * This method was moved from PatternEngine to enforce single writer principle
   */
  async updatePatternUsageStats(change: { content?: string; language?: string; path: string }): Promise<void> {
    try {
      if (!change.content || !change.language) return;

      Logger.info(`Updating pattern usage statistics for: ${change.path}`);

      // Track usage of different patterns based on file content (limit to 100 most common)
      const patterns = this.database.getDeveloperPatterns(undefined, 100);
      
      for (const pattern of patterns) {
        // Check if pattern is used in the changed file
        if (this.isPatternUsedInContent(pattern, change.content, change.language)) {
          // Update pattern frequency (single writer)
          this.database.insertDeveloperPattern({
            ...pattern,
            frequency: pattern.frequency + 1,
            lastSeen: new Date()
          });
        }
      }

      Logger.info('Pattern usage statistics updated successfully');
    } catch (error) {
      Logger.error('Failed to update pattern usage statistics:', error);
      throw new Error(`Failed to update pattern usage statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Learn from analysis data (single writer)
   * This method was moved from PatternEngine to enforce single writer principle
   */
  async learnFromAnalysisData(analysisData: any): Promise<void> {
    try {
      Logger.info('Learning from analysis data');

      // Update local pattern database based on analysis
      if (analysisData.patterns && analysisData.patterns.detected) {
        for (const patternType of analysisData.patterns.detected) {
          const existingPatterns = this.database.getDeveloperPatterns(patternType);
          
          if (existingPatterns.length > 0) {
            // Increment frequency of detected pattern (single writer)
            const pattern = existingPatterns[0];
            this.database.insertDeveloperPattern({
              ...pattern,
              frequency: pattern.frequency + 1,
              confidence: Math.min(1.0, pattern.confidence + 0.05),
              lastSeen: new Date()
            });
          } else {
            // Create new pattern entry (single writer)
            this.database.insertDeveloperPattern({
              patternId: nanoid(),
              patternType,
              patternContent: { 
                description: `Pattern detected in ${analysisData.change?.path || 'unknown file'}`,
                detectedAt: new Date().toISOString()
              },
              frequency: 1,
              contexts: [analysisData.change?.language || 'unknown'],
              examples: [],
              confidence: 0.3,
              createdAt: new Date(),
              lastSeen: new Date()
            });
          }
        }
      }

      Logger.info('Analysis data learning completed successfully');
    } catch (error) {
      Logger.error('Failed to learn from analysis data:', error);
      throw new Error(`Failed to learn from analysis data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a pattern is used in content (helper method)
   * This method was moved from PatternEngine to support single writer operations
   */
  private isPatternUsedInContent(
    pattern: any,
    content: string,
    language: string
  ): boolean {
    // Simple heuristic to check if a pattern is used in content
    if (!pattern.contexts.includes(language)) return false;

    // Check for pattern-specific indicators
    switch (pattern.patternType) {
      case 'camelCase_function_naming':
        return /function\s+[a-z][a-zA-Z]*/.test(content);
      case 'PascalCase_class_naming':
        return /class\s+[A-Z][a-zA-Z]*/.test(content);
      case 'testing':
        return /describe|it|test|expect/.test(content);
      case 'api_design':
        return /app\.(get|post|put|delete)|router\.(get|post|put|delete)/.test(content);
      case 'dependency_injection':
        return /constructor\([^)]*private|@Injectable/.test(content);
      case 'factory':
        return /Factory|create\w*\(/.test(content);
      case 'singleton':
        return /getInstance|private\s+static\s+instance/.test(content);
      default:
        return false;
    }
  }

  /**
   * Build vector index for semantic search
   */
  private async buildVectorIndex(concepts: any[], patterns: any[]): Promise<void> {
    try {
      await this.vectorStore.initialize('in-memoria-intelligence');

      // Create embeddings for concepts
      for (const concept of concepts) {
        const text = `${concept.name} ${concept.type}`;
        await this.vectorStore.storeCodeEmbedding(text, {
          id: concept.id,
          filePath: concept.filePath,
          functionName: concept.type === 'function' ? concept.name : undefined,
          className: concept.type === 'class' ? concept.name : undefined,
          language: 'unknown',
          complexity: 1,
          lineCount: 1,
          lastModified: new Date()
        });
      }

      // Create embeddings for patterns
      for (const pattern of patterns) {
        const text = `${pattern.patternType} ${pattern.patternContent.description || ''}`;
        await this.vectorStore.storeCodeEmbedding(text, {
          id: pattern.patternId,
          filePath: `pattern-${pattern.patternType}`,
          language: 'pattern',
          complexity: pattern.frequency || 1,
          lineCount: 1,
          lastModified: new Date()
        });
      }
    } catch (error) {
      Logger.warn('Failed to build vector index:', error);
      // Don't throw - vector indexing is optional
    }
  }

  /**
   * Build vector index for extracted concepts (single writer)
   */
  private async buildVectorIndexForConcepts(concepts: any[]): Promise<void> {
    try {
      await this.vectorStore.initialize('in-memoria-intelligence');

      // Create embeddings for significant concepts
      for (const concept of concepts) {
        const text = `${concept.name} ${concept.type}`;
        await this.vectorStore.storeCodeEmbedding(text, {
          id: concept.id,
          filePath: concept.filePath,
          functionName: concept.type === 'function' ? concept.name : undefined,
          className: concept.type === 'class' ? concept.name : undefined,
          language: this.detectLanguageFromPath(concept.filePath),
          complexity: Math.floor(concept.confidence * 10),
          lineCount: concept.lineRange.end - concept.lineRange.start + 1,
          lastModified: new Date()
        });
      }
    } catch (error) {
      Logger.warn('Failed to build vector index for concepts:', error);
      // Don't throw - vector indexing is optional
    }
  }

  /**
   * Detect language from file path (helper method)
   */
  private detectLanguageFromPath(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'svelte': 'svelte',
      'vue': 'vue',
      'php': 'php'
    };
    return languageMap[extension || ''] || 'unknown';
  }

  /**
   * Check for existing intelligence in the database
   */
  private async checkExistingIntelligence(projectPath: string): Promise<{ concepts: number; patterns: number } | null> {
    try {
      const concepts = this.database.getSemanticConcepts().length;
      const patterns = this.database.getDeveloperPatterns().length;

      if (concepts > 0 || patterns > 0) {
        return { concepts, patterns };
      }

      return null;
    } catch (error) {
      Logger.warn('Failed to check existing intelligence:', error);
      return null;
    }
  }

  /**
   * Setup progress tracking phases
   */
  private setupProgressPhases(): void {
    if (!this.progressTracker) return;

    this.progressTracker.addPhase('semantic_analysis', 100, 3);
    this.progressTracker.addPhase('pattern_discovery', 100, 3);
    this.progressTracker.addPhase('vector_indexing', 100, 2);
    this.progressTracker.addPhase('metadata_storage', 100, 1);
  }
}

// Export the implementation class
export { LearningServiceImpl };