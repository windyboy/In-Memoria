import { SemanticEngine } from '../../utils/semantic-engine.js';
import { PatternEngine } from '../../utils/pattern-engine.js';
import { SQLiteDatabase, SemanticConcept as DBSemanticConcept } from '../../storage/sqlite-db.js';
import { VectorStore } from '../../storage/vector-store.js';
import { createVectorStore } from '../../storage/backend-unified.js';
import { ProgressTracker } from '../../utils/progress-tracker.js';
import { Logger } from '../../utils/logger.js';
import { PathValidator } from '../../utils/path-validator.js';
import { nanoid } from 'nanoid';
import { LearningError, PathError, StorageError, translateError } from '../errors.js';

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
  enableProgressController?: boolean; // Enable ProgressController integration for CLI and MCP
}

export interface LearningResult {
  success: boolean;
  conceptsLearned: number;
  patternsDiscovered: number;
  featuresLearned: number;
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

  /**
   * Get current learning status for progress reporting
   */
  getLearningStatus(projectPath: string): Promise<{
    isLearned: boolean;
    lastLearned?: Date;
    conceptCount: number;
    patternCount: number;
  }>;

  /**
   * Store AI insights (single writer principle)
   */
  storeAIInsight(insight: {
    insightId: string;
    insightType: string;
    insightContent: any;
    confidenceScore: number;
    sourceAgent: string;
    validationStatus: 'pending' | 'validated' | 'rejected';
    impactPrediction: any;
  }): Promise<void>;

  /**
   * Create or update work session (single writer principle)
   */
  createWorkSession(session: {
    id: string;
    projectPath: string;
    currentFiles: string[];
    completedTasks: string[];
    pendingTasks: string[];
    blockers: string[];
    lastFeature?: string;
  }): Promise<void>;

  /**
   * Update work session (single writer principle)
   */
  updateWorkSession(sessionId: string, updates: {
    currentFiles?: string[];
    lastFeature?: string;
    pendingTasks?: string[];
  }): Promise<void>;

  /**
   * Store project decision (single writer principle)
   */
  storeProjectDecision(decision: {
    id: string;
    projectPath: string;
    decisionKey: string;
    decisionValue: string;
    reasoning?: string;
  }): Promise<void>;

  /**
   * Store entry point (single writer principle)
   */
  storeEntryPoint(entryPoint: {
    id: string;
    projectPath: string;
    entryType: string;
    filePath: string;
    description?: string;
    framework?: string;
  }): Promise<void>;

  /**
   * Store key directory (single writer principle)
   */
  storeKeyDirectory(directory: {
    id: string;
    projectPath: string;
    directoryPath: string;
    directoryType: string;
    fileCount: number;
    description?: string;
  }): Promise<void>;
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
  private vectorStore: VectorStore;

  constructor(
    private semanticEngine: SemanticEngine,
    private patternEngine: PatternEngine,
    private database: SQLiteDatabase
  ) {
    // Initialize single vector backend (SurrealDB) through unified interface - consolidation per requirement 6.1
    this.vectorStore = createVectorStore();
    Logger.info('LearningService initialized with single SurrealDB vector backend (consolidated)');
  }

  /**
   * Learn from a codebase and store the results
   * 
   * This is the main learning method that coordinates the entire learning process.
   * It integrates with existing engines while being the single writer to storage.
   * 
   * The learning process is idempotent - running it multiple times on the same
   * codebase will only update timestamps without duplicating data.
   */
  async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let conceptsLearned = 0;
    let patternsDiscovered = 0;
    let featuresLearned = 0;
    let isIdempotentUpdate = false;

    // Set up SIGINT handler for graceful shutdown
    const sigintHandler = this.setupSigintHandler();

    try {
      Logger.info(`Starting learning process for: ${projectPath}`);
      
      // Validate the project path
      try {
        PathValidator.validateProjectPath(projectPath, 'LearningService.learnFromCodebase');
      } catch (error) {
        throw translateError(error, 'Path validation');
      }

      // Initialize progress tracking with ProgressController integration
      this.progressTracker = new ProgressTracker();
      this.setupProgressPhases();
      
      // Set up progress callback if provided (for CLI and MCP integration)
      if (options.progressCallback) {
        this.progressTracker.on('progress', (update) => {
          options.progressCallback!(update.current, update.total, update.message || update.phase);
        });
      }

      // Check if already learned and implement idempotent behavior
      const existingMetadata = this.database.getProjectMetadata(projectPath);
      if (!options.force && existingMetadata && existingMetadata.lastFullScan) {
        // Idempotent update: only update timestamp and return existing counts
        Logger.info(`Performing idempotent update for already learned project: ${projectPath}`);
        isIdempotentUpdate = true;
        
        // Update only the timestamp
        await this.updateProjectMetadataTimestamp(projectPath);
        
        // Get existing counts for response
        const existingConcepts = this.database.getSemanticConcepts().length;
        const existingPatterns = this.database.getDeveloperPatterns().length;
        const existingFeatures = this.database.getFeatureMaps(projectPath).length;
        
        return {
          success: true,
          conceptsLearned: existingConcepts,
          patternsDiscovered: existingPatterns,
          featuresLearned: existingFeatures,
          duration: Date.now() - startTime,
          errors: ['Idempotent update: timestamp updated, no data duplication']
        };
      }

      // Phase 1: Semantic Analysis
      this.progressTracker.startPhase('semantic_analysis');
      Logger.info('Phase 1: Starting semantic analysis...');
      
      // Report progress to ProgressController for CLI and MCP integration
      if (options.progressCallback) {
        options.progressCallback(0, 100, 'Starting semantic analysis');
      }
      
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

      // Store concepts with idempotent behavior (single writer)
      await this.storeSemanticConceptsInternal(concepts);
      conceptsLearned = concepts.length;
      
      // Build vector index for significant concepts (single writer)
      await this.buildVectorIndexForConcepts(extractedConcepts.filter(c => c.confidence > 0.5));
      
      this.progressTracker.updateProgress('semantic_analysis', 100, `Stored ${conceptsLearned} concepts`);
      Logger.info(`Semantic analysis complete. Learned ${conceptsLearned} concepts`);

      // Phase 2: Pattern Discovery
      this.progressTracker.startPhase('pattern_discovery');
      Logger.info('Phase 2: Starting pattern discovery...');
      
      // Report progress to ProgressController for CLI and MCP integration
      if (options.progressCallback) {
        options.progressCallback(0, 100, 'Starting pattern discovery');
      }
      
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

      // Store patterns with idempotent behavior (single writer)
      await this.storeDeveloperPatternsInternal(patterns);
      patternsDiscovered = patterns.length;
      
      this.progressTracker.updateProgress('pattern_discovery', 100, `Stored ${patternsDiscovered} patterns`);
      Logger.info(`Pattern discovery complete. Discovered ${patternsDiscovered} patterns`);

      // Phase 3: Feature Extraction
      this.progressTracker.startPhase('feature_extraction');
      Logger.info('Phase 3: Starting feature extraction...');
      
      // Report progress to ProgressController for CLI and MCP integration
      if (options.progressCallback) {
        options.progressCallback(0, 100, 'Starting feature extraction');
      }
      
      const featureMaps = await this.patternEngine.buildFeatureMap(projectPath);
      this.progressTracker.updateProgress('feature_extraction', 50, 'Feature extraction complete');
      
      // Store feature maps with idempotent behavior (single writer)
      await this.storeFeatureMapsInternal(projectPath, featureMaps);
      featuresLearned = featureMaps.length;
      
      this.progressTracker.updateProgress('feature_extraction', 100, `Stored ${featuresLearned} features`);
      Logger.info(`Feature extraction complete. Discovered ${featuresLearned} features`);

      // Phase 4: Vector Indexing
      this.progressTracker.startPhase('vector_indexing');
      Logger.info('Phase 4: Building vector index...');
      
      // Report progress to ProgressController for CLI and MCP integration
      if (options.progressCallback) {
        options.progressCallback(0, 100, 'Building vector index');
      }
      
      await this.buildVectorIndex(concepts, patterns);
      
      this.progressTracker.updateProgress('vector_indexing', 100, 'Vector index complete');
      Logger.info('Vector indexing complete');

      // Phase 5: Metadata Storage
      this.progressTracker.startPhase('metadata_storage');
      Logger.info('Phase 5: Storing project metadata...');
      
      // Report progress to ProgressController for CLI and MCP integration
      if (options.progressCallback) {
        options.progressCallback(0, 100, 'Storing project metadata');
      }
      
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
        featuresLearned,
        duration,
        errors
      };

    } catch (error) {
      const translatedError = translateError(error, 'Learning process');
      errors.push(translatedError.message);
      Logger.error('Learning process failed:', translatedError);

      return {
        success: false,
        conceptsLearned,
        patternsDiscovered,
        featuresLearned,
        duration: Date.now() - startTime,
        errors
      };
    } finally {
      // Clean up SIGINT handler
      if (sigintHandler) {
        process.removeListener('SIGINT', sigintHandler);
      }
      
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
      try {
        PathValidator.validateProjectPath(projectPath, 'LearningService.updateProjectMetadata');
      } catch (error) {
        throw translateError(error, 'Path validation');
      }
      
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
      throw translateError(error, 'Project metadata update');
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
      throw translateError(error, 'Semantic concepts storage');
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
      throw translateError(error, 'Developer patterns storage');
    }
  }

  /**
   * Internal method to store semantic concepts (single writer)
   * Uses INSERT OR REPLACE to ensure idempotent behavior
   */
  private async storeSemanticConceptsInternal(concepts: any[]): Promise<void> {
    for (const concept of concepts) {
      // Check if concept already exists to maintain idempotency
      // If context column doesn't exist, getSemanticConcepts will return all concepts
      // We'll filter by ID instead
      let existingConcepts: DBSemanticConcept[];
      try {
        existingConcepts = this.database.getSemanticConcepts(concept.filePath);
      } catch (error) {
        // Fallback: get all concepts and filter by ID
        Logger.debug('Could not filter by filePath, using ID-based lookup');
        existingConcepts = this.database.getSemanticConcepts();
      }
      
      const existingConcept = existingConcepts.find(c => c.id === concept.id);
      
      if (existingConcept) {
        // Update only if confidence score has improved or file path has changed
        if (concept.confidenceScore > existingConcept.confidenceScore || 
            concept.filePath !== existingConcept.filePath) {
          Logger.debug(`Updating existing concept: ${concept.id}`);
          this.database.insertSemanticConcept({
            ...concept,
            updatedAt: new Date()
          });
        } else {
          Logger.debug(`Skipping duplicate concept: ${concept.id}`);
        }
      } else {
        // Insert new concept
        this.database.insertSemanticConcept(concept);
      }
    }
  }

  /**
   * Internal method to store feature maps (single writer)
   * Uses INSERT OR REPLACE to ensure idempotent behavior
   */
  private async storeFeatureMapsInternal(projectPath: string, featureMaps: Array<{
    id: string;
    featureName: string;
    primaryFiles: string[];
    relatedFiles: string[];
    dependencies: string[];
  }>): Promise<void> {
    for (const featureMap of featureMaps) {
      // Check if feature map already exists to maintain idempotency
      const existingFeatures = this.database.getFeatureMaps(projectPath);
      const existingFeature = existingFeatures.find(f => f.id === featureMap.id || f.featureName === featureMap.featureName);
      
      if (existingFeature) {
        // Update existing feature map
        Logger.debug(`Updating existing feature map: ${featureMap.featureName}`);
        this.database.insertFeatureMap({
          id: existingFeature.id,
          projectPath,
          featureName: featureMap.featureName,
          primaryFiles: featureMap.primaryFiles,
          relatedFiles: featureMap.relatedFiles,
          dependencies: featureMap.dependencies,
          status: 'active'
        });
      } else {
        // Insert new feature map
        this.database.insertFeatureMap({
          id: featureMap.id,
          projectPath,
          featureName: featureMap.featureName,
          primaryFiles: featureMap.primaryFiles,
          relatedFiles: featureMap.relatedFiles,
          dependencies: featureMap.dependencies,
          status: 'active'
        });
      }
    }
  }

  /**
   * Internal method to store developer patterns (single writer)
   * Uses INSERT OR REPLACE to ensure idempotent behavior
   */
  private async storeDeveloperPatternsInternal(patterns: any[]): Promise<void> {
    for (const pattern of patterns) {
      // Check if pattern already exists to maintain idempotency
      const existingPatterns = this.database.getDeveloperPatterns(pattern.patternType);
      const existingPattern = existingPatterns.find(p => p.patternId === pattern.patternId);
      
      if (existingPattern) {
        // Update frequency and last seen timestamp for idempotent behavior
        Logger.debug(`Updating existing pattern: ${pattern.patternId}`);
        this.database.insertDeveloperPattern({
          ...existingPattern,
          frequency: Math.max(existingPattern.frequency, pattern.frequency),
          confidence: Math.max(existingPattern.confidence, pattern.confidence)
        });
      } else {
        // Insert new pattern
        this.database.insertDeveloperPattern(pattern);
      }
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
            frequency: pattern.frequency + 1
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
              confidence: Math.min(1.0, pattern.confidence + 0.05)
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
              confidence: 0.3
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
   * This method is used to determine if learning has already been performed
   * for idempotent behavior implementation
   */
  private async checkExistingIntelligence(projectPath: string): Promise<{ concepts: number; patterns: number } | null> {
    try {
      // Check project metadata to see if learning has been completed
      const metadata = this.database.getProjectMetadata(projectPath);
      if (!metadata || !metadata.lastFullScan) {
        return null;
      }

      // Get actual counts from the database
      const concepts = this.database.getSemanticConcepts().length;
      const patterns = this.database.getDeveloperPatterns().length;

      if (concepts > 0 || patterns > 0) {
        Logger.info(`Found existing intelligence: ${concepts} concepts, ${patterns} patterns`);
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
    this.progressTracker.addPhase('feature_extraction', 100, 2);
    this.progressTracker.addPhase('vector_indexing', 100, 2);
    this.progressTracker.addPhase('metadata_storage', 100, 1);
  }

  /**
   * Setup SIGINT handler for graceful shutdown
   * Ensures database connections are closed properly on interruption
   */
  private setupSigintHandler(): (() => void) | null {
    const handler = () => {
      Logger.info('SIGINT received, gracefully shutting down learning process...');
      
      try {
        // Complete current progress phase if active
        if (this.progressTracker) {
          this.progressTracker.complete();
        }
        
        // Close database connections gracefully
        if (this.database) {
          this.database.close();
        }
        
        Logger.info('Learning process shutdown complete');
        process.exit(0);
      } catch (error) {
        Logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', handler);
    return handler;
  }

  /**
   * Get current learning status for progress reporting
   * This method supports ProgressController integration for CLI and MCP
   */
  async getLearningStatus(projectPath: string): Promise<{
    isLearned: boolean;
    lastLearned?: Date;
    conceptCount: number;
    patternCount: number;
  }> {
    try {
      const metadata = this.database.getProjectMetadata(projectPath);
      const conceptCount = this.database.getSemanticConcepts().length;
      const patternCount = this.database.getDeveloperPatterns().length;

      return {
        isLearned: !!metadata?.lastFullScan,
        lastLearned: metadata?.lastFullScan,
        conceptCount,
        patternCount
      };
    } catch (error) {
      Logger.error('Failed to get learning status:', error);
      return {
        isLearned: false,
        conceptCount: 0,
        patternCount: 0
      };
    }
  }

  /**
   * Store AI insights (single writer principle)
   * Note: ai_insights table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async storeAIInsight(insight: {
    insightId: string;
    insightType: string;
    insightContent: any;
    confidenceScore: number;
    sourceAgent: string;
    validationStatus: 'pending' | 'validated' | 'rejected';
    impactPrediction: any;
  }): Promise<void> {
    try {
      Logger.warn(`storeAIInsight called but ai_insights table was dropped in migration 8. Operation ignored for: ${insight.insightId}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.insertAIInsight({
        insightId: insight.insightId,
        insightType: insight.insightType,
        insightContent: insight.insightContent,
        confidenceScore: insight.confidenceScore,
        sourceAgent: insight.sourceAgent,
        validationStatus: insight.validationStatus,
        impactPrediction: insight.impactPrediction
      });
    } catch (error) {
      Logger.error('Failed to store AI insight:', error);
      throw translateError(error, 'AI insight storage');
    }
  }

  /**
   * Create or update work session (single writer principle)
   * Note: work_sessions table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async createWorkSession(session: {
    id: string;
    projectPath: string;
    currentFiles: string[];
    completedTasks: string[];
    pendingTasks: string[];
    blockers: string[];
    lastFeature?: string;
  }): Promise<void> {
    try {
      Logger.warn(`createWorkSession called but work_sessions table was dropped in migration 8. Operation ignored for: ${session.id}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.createWorkSession(session);
    } catch (error) {
      Logger.error('Failed to create work session:', error);
      throw translateError(error, 'Work session creation');
    }
  }

  /**
   * Update work session (single writer principle)
   * Note: work_sessions table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async updateWorkSession(sessionId: string, updates: {
    currentFiles?: string[];
    lastFeature?: string;
    pendingTasks?: string[];
  }): Promise<void> {
    try {
      Logger.warn(`updateWorkSession called but work_sessions table was dropped in migration 8. Operation ignored for: ${sessionId}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.updateWorkSession(sessionId, updates);
    } catch (error) {
      Logger.error('Failed to update work session:', error);
      throw translateError(error, 'Work session update');
    }
  }

  /**
   * Store project decision (single writer principle)
   * Note: project_decisions table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async storeProjectDecision(decision: {
    id: string;
    projectPath: string;
    decisionKey: string;
    decisionValue: string;
    reasoning?: string;
  }): Promise<void> {
    try {
      Logger.warn(`storeProjectDecision called but project_decisions table was dropped in migration 8. Operation ignored for: ${decision.decisionKey}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.upsertProjectDecision({
        id: decision.id,
        projectPath: decision.projectPath,
        decisionKey: decision.decisionKey,
        decisionValue: decision.decisionValue,
        reasoning: decision.reasoning
      });
    } catch (error) {
      Logger.error('Failed to store project decision:', error);
      throw translateError(error, 'Project decision storage');
    }
  }

  /**
   * Store entry point (single writer principle)
   * Note: entry_points table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async storeEntryPoint(entryPoint: {
    id: string;
    projectPath: string;
    entryType: string;
    filePath: string;
    description?: string;
    framework?: string;
  }): Promise<void> {
    try {
      Logger.warn(`storeEntryPoint called but entry_points table was dropped in migration 8. Operation ignored for: ${entryPoint.filePath}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.insertEntryPoint(entryPoint);
    } catch (error) {
      Logger.error('Failed to store entry point:', error);
      throw translateError(error, 'Entry point storage');
    }
  }

  /**
   * Store key directory (single writer principle)
   * Note: key_directories table was dropped in migration 8, this method now logs a warning and does nothing
   */
  async storeKeyDirectory(directory: {
    id: string;
    projectPath: string;
    directoryPath: string;
    directoryType: string;
    fileCount: number;
    description?: string;
  }): Promise<void> {
    try {
      Logger.warn(`storeKeyDirectory called but key_directories table was dropped in migration 8. Operation ignored for: ${directory.directoryPath}`);
      // Database method is stubbed and will log warning, but we complete successfully
      this.database.insertKeyDirectory(directory);
    } catch (error) {
      Logger.error('Failed to store key directory:', error);
      throw translateError(error, 'Key directory storage');
    }
  }

  /**
   * Update only the timestamp for idempotent learning operations
   * This method implements the requirement that repeated learning should
   * only update timestamps without duplicating data
   */
  private async updateProjectMetadataTimestamp(projectPath: string): Promise<void> {
    try {
      Logger.info(`Updating timestamp for idempotent learning: ${projectPath}`);
      
      const existingMetadata = this.database.getProjectMetadata(projectPath);
      if (existingMetadata) {
        // Update the existing metadata with new timestamp
        this.database.insertProjectMetadata({
          projectId: existingMetadata.projectId,
          projectPath: existingMetadata.projectPath,
          projectName: existingMetadata.projectName,
          languagePrimary: existingMetadata.languagePrimary,
          languagesDetected: existingMetadata.languagesDetected,
          frameworkDetected: existingMetadata.frameworkDetected,
          intelligenceVersion: existingMetadata.intelligenceVersion,
          lastFullScan: new Date() // Only update the timestamp
        });
        
        Logger.info('Project metadata timestamp updated successfully');
      } else {
        Logger.warn('No existing metadata found for timestamp update');
      }
    } catch (error) {
      Logger.error('Failed to update project metadata timestamp:', error);
      throw new Error(`Failed to update timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export the implementation class
export { LearningServiceImpl };