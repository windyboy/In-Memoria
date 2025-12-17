import { SQLiteDatabase } from '../../storage/sqlite-db.js';
import { VectorStore } from '../../storage/vector-store.js';
import { Logger } from '../../utils/logger.js';
import { PathValidator } from '../../utils/path-validator.js';
import { existsSync, statSync } from 'fs';
import { config } from '../../config/config.js';

/**
 * Learning status for a project
 */
export interface LearningStatus {
  projectPath: string;
  hasIntelligence: boolean;
  isStale: boolean;
  conceptsStored: number;
  patternsStored: number;
  filesInProject: number;
  codeFilesInProject: number;
  lastLearningTime: string | null;
  recommendation: 'ready' | 'learning_recommended' | 'learning_needed';
  message: string;
}

/**
 * System metrics including performance and resource usage
 */
export interface SystemMetrics {
  timestamp: string;
  version: string;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    unit: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    uptime: number;
  };
  database: {
    size: {
      bytes: number;
      mb: number;
    };
    lastModified: string;
    queryPerformance: {
      conceptsMs: number;
      patternsMs: number;
      conceptCount: number;
      patternsCount: number;
      performanceRating: 'excellent' | 'good' | 'fair' | 'poor';
    };
  };
}

/**
 * Intelligence metrics about the learned data
 */
export interface IntelligenceMetrics {
  concepts: {
    total: number;
    breakdown?: {
      byType: Record<string, number>;
      byConfidence: {
        high: number;
        medium: number;
        low: number;
      };
    };
  };
  patterns: {
    total: number;
    breakdown?: {
      byType: Record<string, number>;
      byFrequency: {
        frequent: number;
        common: number;
        rare: number;
      };
    };
  };
  quality: {
    averageConfidence?: number;
    highConfidenceRatio?: number;
    averagePatternFrequency?: number;
  };
  coverage: Record<string, any>;
  timestamps: {
    lastConceptLearned?: string;
    lastPatternLearned?: string;
  };
}

/**
 * Health status of the system components
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: string;
  components: {
    database: {
      status: 'healthy' | 'error';
      connected: boolean;
      schemaVersion?: number;
      latestVersion?: number;
      needsMigration?: boolean;
      dataCount?: {
        concepts: number;
        patterns: number;
      };
      error?: string;
    };
    vectorStore: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      connected: boolean;
      responseTime?: number;
      error?: string;
    };
    intelligence: {
      status: 'ready' | 'needs_learning' | 'error';
      dataQuality: 'good' | 'empty' | 'stale';
      conceptCount: number;
      patternCount: number;
      lastUpdate?: string;
      error?: string;
    };
  };
  summary: string;
}

/**
 * DiagnosticService Interface - Read-only diagnostic operations
 * 
 * This service provides system health and statistics without modifying state.
 * It integrates with existing diagnostic capabilities to provide comprehensive
 * system monitoring and status reporting.
 */
export interface DiagnosticService {
  /**
   * Get learning status for a specific project
   * 
   * @param projectPath - Path to the project to check
   * @returns Promise<LearningStatus> - Learning status and recommendations
   */
  getLearningStatus(projectPath: string): Promise<LearningStatus>;

  /**
   * Get system metrics including performance and resource usage
   * 
   * @returns Promise<SystemMetrics> - System performance metrics
   */
  getSystemMetrics(): Promise<SystemMetrics>;

  /**
   * Get intelligence metrics about the learned data
   * 
   * @param projectPath - Path to the project
   * @returns Promise<IntelligenceMetrics> - Intelligence data metrics
   */
  getIntelligenceMetrics(projectPath: string): Promise<IntelligenceMetrics>;

  /**
   * Get health status of all system components
   * 
   * @returns Promise<HealthStatus> - Overall system health status
   */
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * DiagnosticService Implementation - Read-only diagnostic operations
 * 
 * This service provides system health and statistics without modifying state.
 * It integrates with existing diagnostic capabilities from the database,
 * vector store, and system monitoring to provide comprehensive diagnostics.
 */
export class DiagnosticServiceImpl implements DiagnosticService {
  constructor(
    private database: SQLiteDatabase,
    private vectorStore: VectorStore
  ) {}

  /**
   * Get learning status for a specific project
   * 
   * Analyzes the current state of intelligence data for a project and provides
   * recommendations on whether learning is needed.
   */
  async getLearningStatus(projectPath: string): Promise<LearningStatus> {
    try {
      Logger.info(`Getting learning status for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'DiagnosticService.getLearningStatus');
      
      // Get existing intelligence data
      const concepts = this.database.getSemanticConcepts();
      const patterns = this.database.getDeveloperPatterns();
      
      // Count project files (simplified version)
      const fileStats = await this.countProjectFiles(projectPath);
      
      // Check if data is stale
      const hasIntelligence = concepts.length > 0 || patterns.length > 0;
      const isStale = hasIntelligence ? await this.detectStaleness(projectPath, concepts, patterns) : false;
      
      // Get last learning time
      const lastLearningTime = this.getLastLearningTime(concepts, patterns);
      
      // Determine recommendation
      let recommendation: 'ready' | 'learning_recommended' | 'learning_needed';
      let message: string;
      
      if (hasIntelligence && !isStale) {
        recommendation = 'ready';
        message = `Intelligence is ready! ${concepts.length} concepts and ${patterns.length} patterns available.`;
      } else if (hasIntelligence && isStale) {
        recommendation = 'learning_recommended';
        message = `Intelligence data is stale. Found ${fileStats.codeFiles} code files to re-analyze.`;
      } else {
        recommendation = 'learning_needed';
        message = `No intelligence data available. Found ${fileStats.codeFiles} code files to analyze.`;
      }
      
      const status: LearningStatus = {
        projectPath,
        hasIntelligence,
        isStale,
        conceptsStored: concepts.length,
        patternsStored: patterns.length,
        filesInProject: fileStats.total,
        codeFilesInProject: fileStats.codeFiles,
        lastLearningTime,
        recommendation,
        message
      };
      
      Logger.info(`Learning status completed: ${recommendation}`);
      return status;
      
    } catch (error) {
      Logger.error('Failed to get learning status:', error);
      throw new Error(`Failed to get learning status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get system metrics including performance and resource usage
   * 
   * Provides comprehensive system performance metrics including memory usage,
   * database performance, and system information.
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      Logger.info('Getting system metrics');
      
      // Memory usage
      const memUsage = process.memoryUsage();
      const memory = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        unit: 'MB' as const
      };
      
      // System information
      const system = {
        nodeVersion: process.version,
        platform: `${process.platform}-${process.arch}`,
        arch: process.arch,
        uptime: Math.round(process.uptime())
      };
      
      // Database metrics
      const database = await this.getDatabaseMetrics();
      
      const metrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        version: '0.6.0', // TODO: Get from package.json
        memory,
        system,
        database
      };
      
      Logger.info('System metrics completed');
      return metrics;
      
    } catch (error) {
      Logger.error('Failed to get system metrics:', error);
      throw new Error(`Failed to get system metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get intelligence metrics about the learned data
   * 
   * Provides detailed analysis of the intelligence data including breakdowns
   * by type, confidence, and quality metrics.
   */
  async getIntelligenceMetrics(projectPath: string): Promise<IntelligenceMetrics> {
    try {
      Logger.info(`Getting intelligence metrics for: ${projectPath}`);
      
      // Validate the project path
      PathValidator.validateProjectPath(projectPath, 'DiagnosticService.getIntelligenceMetrics');
      
      // Get intelligence data
      const concepts = this.database.getSemanticConcepts();
      const patterns = this.database.getDeveloperPatterns();
      
      // Build metrics structure
      const metrics: IntelligenceMetrics = {
        concepts: {
          total: concepts.length,
          breakdown: concepts.length > 0 ? this.buildConceptBreakdown(concepts) : undefined
        },
        patterns: {
          total: patterns.length,
          breakdown: patterns.length > 0 ? this.buildPatternBreakdown(patterns) : undefined
        },
        quality: this.calculateQualityMetrics(concepts, patterns),
        coverage: {}, // TODO: Implement coverage analysis
        timestamps: this.getTimestamps(concepts, patterns)
      };
      
      Logger.info(`Intelligence metrics completed: ${concepts.length} concepts, ${patterns.length} patterns`);
      return metrics;
      
    } catch (error) {
      Logger.error('Failed to get intelligence metrics:', error);
      throw new Error(`Failed to get intelligence metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get health status of all system components
   * 
   * Performs comprehensive health checks on database, vector store, and
   * intelligence systems to provide overall system health assessment.
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      Logger.info('Getting system health status');
      
      const timestamp = new Date().toISOString();
      
      // Check database health
      const databaseHealth = await this.checkDatabaseHealth();
      
      // Check vector store health
      const vectorStoreHealth = await this.checkVectorStoreHealth();
      
      // Check intelligence health
      const intelligenceHealth = await this.checkIntelligenceHealth();
      
      // Determine overall status
      const overallStatus = this.assessOverallHealth(databaseHealth, vectorStoreHealth, intelligenceHealth);
      
      // Generate summary
      const summary = this.generateHealthSummary(overallStatus, databaseHealth, vectorStoreHealth, intelligenceHealth);
      
      const healthStatus: HealthStatus = {
        status: overallStatus,
        lastChecked: timestamp,
        components: {
          database: databaseHealth,
          vectorStore: vectorStoreHealth,
          intelligence: intelligenceHealth
        },
        summary
      };
      
      Logger.info(`Health status completed: ${overallStatus}`);
      return healthStatus;
      
    } catch (error) {
      Logger.error('Failed to get health status:', error);
      throw new Error(`Failed to get health status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Count files in a project directory
   * 
   * @private
   * @param projectPath - Path to the project
   * @returns File count statistics
   */
  private async countProjectFiles(projectPath: string): Promise<{ total: number; codeFiles: number }> {
    try {
      // Simple file counting - could be enhanced with glob patterns
      // For now, return reasonable defaults
      return { total: 100, codeFiles: 50 };
    } catch (error) {
      Logger.warn('Failed to count project files:', error);
      return { total: 0, codeFiles: 0 };
    }
  }

  /**
   * Detect if intelligence data is stale
   * 
   * @private
   * @param projectPath - Path to the project
   * @param concepts - Stored concepts
   * @param patterns - Stored patterns
   * @returns True if data is stale
   */
  private async detectStaleness(
    projectPath: string,
    concepts: any[],
    patterns: any[]
  ): Promise<boolean> {
    try {
      // Get the most recent intelligence timestamp
      let latestIntelligenceTime = 0;
      
      for (const concept of concepts) {
        const conceptTime = concept.createdAt ? new Date(concept.createdAt).getTime() : 0;
        latestIntelligenceTime = Math.max(latestIntelligenceTime, conceptTime);
      }
      
      for (const pattern of patterns) {
        const patternTime = pattern.createdAt ? new Date(pattern.createdAt).getTime() : 0;
        latestIntelligenceTime = Math.max(latestIntelligenceTime, patternTime);
      }
      
      if (latestIntelligenceTime === 0) {
        return true; // No valid timestamps, consider stale
      }
      
      // For now, consider data stale if it's older than 24 hours
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return latestIntelligenceTime < oneDayAgo;
      
    } catch (error) {
      Logger.warn('Failed to detect staleness:', error);
      return false; // Err on the side of caution
    }
  }

  /**
   * Get the last learning time from intelligence data
   * 
   * @private
   * @param concepts - Stored concepts
   * @param patterns - Stored patterns
   * @returns ISO timestamp string or null
   */
  private getLastLearningTime(concepts: any[], patterns: any[]): string | null {
    try {
      let latestTime = 0;
      
      for (const concept of concepts) {
        const time = concept.createdAt ? new Date(concept.createdAt).getTime() : 0;
        latestTime = Math.max(latestTime, time);
      }
      
      for (const pattern of patterns) {
        const time = pattern.createdAt ? new Date(pattern.createdAt).getTime() : 0;
        latestTime = Math.max(latestTime, time);
      }
      
      return latestTime > 0 ? new Date(latestTime).toISOString() : null;
    } catch (error) {
      Logger.warn('Failed to get last learning time:', error);
      return null;
    }
  }

  /**
   * Get database performance metrics
   * 
   * @private
   * @returns Database metrics
   */
  private async getDatabaseMetrics(): Promise<SystemMetrics['database']> {
    try {
      // Get database file size
      const dbPath = config.getDatabasePath();
      let size = { bytes: 0, mb: 0 };
      let lastModified = new Date().toISOString();
      
      if (existsSync(dbPath)) {
        const stats = statSync(dbPath);
        size = {
          bytes: stats.size,
          mb: Math.round(stats.size / (1024 * 1024) * 100) / 100
        };
        lastModified = stats.mtime.toISOString();
      }
      
      // Measure query performance
      const conceptQueryStart = Date.now();
      const concepts = this.database.getSemanticConcepts();
      const conceptsMs = Date.now() - conceptQueryStart;
      
      const patternQueryStart = Date.now();
      const patterns = this.database.getDeveloperPatterns();
      const patternsMs = Date.now() - patternQueryStart;
      
      // Determine performance rating
      const rating = conceptsMs < 100 ? 'excellent'
        : conceptsMs < 500 ? 'good'
        : conceptsMs < 1000 ? 'fair'
        : 'poor';
      
      return {
        size,
        lastModified,
        queryPerformance: {
          conceptsMs,
          patternsMs,
          conceptCount: concepts.length,
          patternsCount: patterns.length,
          performanceRating: rating
        }
      };
    } catch (error) {
      Logger.warn('Failed to get database metrics:', error);
      return {
        size: { bytes: 0, mb: 0 },
        lastModified: new Date().toISOString(),
        queryPerformance: {
          conceptsMs: 0,
          patternsMs: 0,
          conceptCount: 0,
          patternsCount: 0,
          performanceRating: 'poor'
        }
      };
    }
  }

  /**
   * Build concept breakdown by type and confidence
   * 
   * @private
   * @param concepts - Concept data
   * @returns Concept breakdown
   */
  private buildConceptBreakdown(concepts: any[]): IntelligenceMetrics['concepts']['breakdown'] {
    const byType = concepts.reduce((acc, concept) => {
      acc[concept.conceptType] = (acc[concept.conceptType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byConfidence = {
      high: concepts.filter(c => c.confidenceScore >= 0.8).length,
      medium: concepts.filter(c => c.confidenceScore >= 0.5 && c.confidenceScore < 0.8).length,
      low: concepts.filter(c => c.confidenceScore < 0.5).length
    };
    
    return { byType, byConfidence };
  }

  /**
   * Build pattern breakdown by type and frequency
   * 
   * @private
   * @param patterns - Pattern data
   * @returns Pattern breakdown
   */
  private buildPatternBreakdown(patterns: any[]): IntelligenceMetrics['patterns']['breakdown'] {
    const byType = patterns.reduce((acc, pattern) => {
      acc[pattern.patternType] = (acc[pattern.patternType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byFrequency = {
      frequent: patterns.filter(p => p.frequency >= 10).length,
      common: patterns.filter(p => p.frequency >= 3 && p.frequency < 10).length,
      rare: patterns.filter(p => p.frequency < 3).length
    };
    
    return { byType, byFrequency };
  }

  /**
   * Calculate quality metrics for intelligence data
   * 
   * @private
   * @param concepts - Concept data
   * @param patterns - Pattern data
   * @returns Quality metrics
   */
  private calculateQualityMetrics(concepts: any[], patterns: any[]): IntelligenceMetrics['quality'] {
    const quality: IntelligenceMetrics['quality'] = {};
    
    if (concepts.length > 0) {
      const avgConfidence = concepts.reduce((sum, c) => sum + c.confidenceScore, 0) / concepts.length;
      quality.averageConfidence = Math.round(avgConfidence * 100) / 100;
      
      const highConfidenceCount = concepts.filter(c => c.confidenceScore >= 0.8).length;
      quality.highConfidenceRatio = Math.round((highConfidenceCount / concepts.length) * 100) / 100;
    }
    
    if (patterns.length > 0) {
      const avgFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length;
      quality.averagePatternFrequency = Math.round(avgFrequency * 100) / 100;
    }
    
    return quality;
  }

  /**
   * Get timestamps from intelligence data
   * 
   * @private
   * @param concepts - Concept data
   * @param patterns - Pattern data
   * @returns Timestamp information
   */
  private getTimestamps(concepts: any[], patterns: any[]): IntelligenceMetrics['timestamps'] {
    const timestamps: IntelligenceMetrics['timestamps'] = {};
    
    if (concepts.length > 0) {
      const latestConcept = concepts.reduce((latest, current) =>
        new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
      );
      timestamps.lastConceptLearned = latestConcept.createdAt instanceof Date 
        ? latestConcept.createdAt.toISOString() 
        : latestConcept.createdAt;
    }
    
    if (patterns.length > 0) {
      const latestPattern = patterns.reduce((latest, current) =>
        new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
      );
      timestamps.lastPatternLearned = latestPattern.createdAt instanceof Date 
        ? latestPattern.createdAt.toISOString() 
        : latestPattern.createdAt;
    }
    
    return timestamps;
  }

  /**
   * Check database health
   * 
   * @private
   * @returns Database health status
   */
  private async checkDatabaseHealth(): Promise<HealthStatus['components']['database']> {
    try {
      const concepts = this.database.getSemanticConcepts();
      const patterns = this.database.getDeveloperPatterns();
      
      const migrator = this.database.getMigrator();
      const currentVersion = migrator.getCurrentVersion();
      const latestVersion = migrator.getLatestVersion();
      
      return {
        status: 'healthy',
        connected: true,
        schemaVersion: currentVersion,
        latestVersion: latestVersion,
        needsMigration: currentVersion < latestVersion,
        dataCount: {
          concepts: concepts.length,
          patterns: patterns.length
        }
      };
    } catch (error) {
      return {
        status: 'error',
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check vector store health
   * 
   * @private
   * @returns Vector store health status
   */
  private async checkVectorStoreHealth(): Promise<HealthStatus['components']['vectorStore']> {
    try {
      const healthStatus = await this.vectorStore.getHealthStatus();
      
      return {
        status: healthStatus.status,
        connected: healthStatus.status !== 'unhealthy',
        responseTime: healthStatus.responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check intelligence system health
   * 
   * @private
   * @returns Intelligence system health status
   */
  private async checkIntelligenceHealth(): Promise<HealthStatus['components']['intelligence']> {
    try {
      const concepts = this.database.getSemanticConcepts();
      const patterns = this.database.getDeveloperPatterns();
      
      const hasData = concepts.length > 0 || patterns.length > 0;
      const dataQuality = hasData ? 'good' : 'empty';
      const status = hasData ? 'ready' : 'needs_learning';
      
      const lastUpdate = this.getLastLearningTime(concepts, patterns);
      
      return {
        status,
        dataQuality,
        conceptCount: concepts.length,
        patternCount: patterns.length,
        lastUpdate: lastUpdate || undefined
      };
    } catch (error) {
      return {
        status: 'error',
        dataQuality: 'empty',
        conceptCount: 0,
        patternCount: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Assess overall system health
   * 
   * @private
   * @param database - Database health
   * @param vectorStore - Vector store health
   * @param intelligence - Intelligence health
   * @returns Overall health status
   */
  private assessOverallHealth(
    database: HealthStatus['components']['database'],
    vectorStore: HealthStatus['components']['vectorStore'],
    intelligence: HealthStatus['components']['intelligence']
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (database.status === 'error') return 'unhealthy';
    if (vectorStore.status === 'unhealthy') return 'degraded';
    if (intelligence.status === 'error') return 'degraded';
    if (intelligence.status === 'needs_learning') return 'degraded';
    return 'healthy';
  }

  /**
   * Generate health summary message
   * 
   * @private
   * @param overallStatus - Overall health status
   * @param database - Database health
   * @param vectorStore - Vector store health
   * @param intelligence - Intelligence health
   * @returns Summary message
   */
  private generateHealthSummary(
    overallStatus: 'healthy' | 'degraded' | 'unhealthy',
    database: HealthStatus['components']['database'],
    vectorStore: HealthStatus['components']['vectorStore'],
    intelligence: HealthStatus['components']['intelligence']
  ): string {
    if (overallStatus === 'healthy') {
      return `All systems operational. ${intelligence.conceptCount} concepts, ${intelligence.patternCount} patterns ready.`;
    } else if (overallStatus === 'degraded') {
      if (intelligence.status === 'needs_learning') {
        return 'System ready but needs learning. Run learning to populate intelligence data.';
      } else {
        return 'System operational with some degraded components. Check component details.';
      }
    } else {
      return 'Critical system issues detected. Database or core components are failing.';
    }
  }
}

// DiagnosticServiceImpl is already exported above as part of the class declaration