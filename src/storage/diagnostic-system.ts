/**
 * Diagnostic Information System for Vector Backends
 * 
 * This module provides comprehensive diagnostic capabilities without exposing
 * backend internals, focusing on actionable insights and system health monitoring.
 * 
 * Requirements addressed: 4.2, 4.3, 4.5
 */

import { Logger } from '../utils/logger.js';
import { CircuitBreaker, CircuitBreakerError, CircuitState } from '../utils/circuit-breaker.js';
import { LoggingMonitor, DiagnosticInfo, LogEntry } from './logging-monitor.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { VectorStore, HealthStatus, PerformanceMetrics } from './vector-store.js';
import { VectorStoreError, isVectorStoreError } from './vector-errors.js';

/**
 * System-wide diagnostic report
 */
export interface SystemDiagnosticReport {
  timestamp: Date;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  backends: Record<string, BackendDiagnostic>;
  systemMetrics: SystemMetrics;
  alerts: DiagnosticAlert[];
  recommendations: SystemRecommendation[];
  summary: DiagnosticSummary;
}

/**
 * Backend-specific diagnostic information
 */
export interface BackendDiagnostic {
  backendType: string;
  health: DiagnosticInfo;
  performance: PerformanceMetrics;
  connectivity: ConnectivityStatus;
  errorPatterns: ErrorPattern[];
  operationalInsights: OperationalInsight[];
}

/**
 * System-wide metrics aggregation
 */
export interface SystemMetrics {
  totalOperations: number;
  overallSuccessRate: number;
  averageResponseTime: number;
  totalErrors: number;
  memoryUsage: number;
  activeConnections: number;
  circuitBreakerStatus: Record<string, CircuitState>;
}

/**
 * Connectivity status without exposing connection details
 */
export interface ConnectivityStatus {
  status: 'connected' | 'disconnected' | 'intermittent' | 'unknown';
  lastSuccessfulOperation?: Date;
  connectionStability: 'stable' | 'unstable' | 'failing';
  latency: {
    current: number;
    average: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
}

/**
 * Error pattern analysis
 */
export interface ErrorPattern {
  errorType: string;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
  operations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  trend: 'increasing' | 'stable' | 'decreasing';
  suggestedActions: string[];
}

/**
 * Operational insights without exposing internals
 */
export interface OperationalInsight {
  category: 'performance' | 'reliability' | 'capacity' | 'optimization';
  insight: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number; // 0-1
  actionable: boolean;
  relatedMetrics: string[];
}

/**
 * Diagnostic alerts
 */
export interface DiagnosticAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'performance' | 'reliability' | 'security' | 'capacity';
  message: string;
  backend?: string;
  timestamp: Date;
  acknowledged: boolean;
  autoResolvable: boolean;
  suggestedActions: string[];
}

/**
 * System recommendations
 */
export interface SystemRecommendation {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'performance' | 'reliability' | 'maintenance' | 'scaling';
  recommendation: string;
  expectedImpact: string;
  implementationComplexity: 'low' | 'medium' | 'high';
  estimatedTimeToImplement: string;
  affectedBackends: string[];
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  healthScore: number; // 0-100
  performanceScore: number; // 0-100
  reliabilityScore: number; // 0-100
  keyFindings: string[];
  criticalIssues: number;
  warningIssues: number;
  optimizationOpportunities: number;
}

/**
 * Comprehensive diagnostic system
 */
export class DiagnosticSystem {
  private loggingMonitors = new Map<string, LoggingMonitor>();
  private vectorStores = new Map<string, VectorStore>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private alertHistory: DiagnosticAlert[] = [];
  private alertIdCounter = 0;

  constructor() {
    Logger.info('Diagnostic system initialized');
  }

  /**
   * Register a backend for diagnostic monitoring
   */
  registerBackend(
    backendType: string,
    vectorStore: VectorStore,
    loggingMonitor: LoggingMonitor,
    circuitBreaker?: CircuitBreaker
  ): void {
    this.vectorStores.set(backendType, vectorStore);
    this.loggingMonitors.set(backendType, loggingMonitor);
    
    if (circuitBreaker) {
      this.circuitBreakers.set(backendType, circuitBreaker);
    }

    Logger.info(`Backend registered for diagnostics: ${backendType}`);
  }

  /**
   * Unregister a backend
   */
  unregisterBackend(backendType: string): void {
    this.vectorStores.delete(backendType);
    this.loggingMonitors.delete(backendType);
    this.circuitBreakers.delete(backendType);
    
    Logger.info(`Backend unregistered from diagnostics: ${backendType}`);
  }

  /**
   * Generate comprehensive system diagnostic report
   */
  async generateDiagnosticReport(): Promise<SystemDiagnosticReport> {
    const timestamp = new Date();
    const backends: Record<string, BackendDiagnostic> = {};
    const alerts: DiagnosticAlert[] = [];
    
    // Collect diagnostics for each backend
    for (const [backendType, loggingMonitor] of this.loggingMonitors) {
      try {
        const backendDiagnostic = await this.generateBackendDiagnostic(backendType);
        backends[backendType] = backendDiagnostic;
        
        // Generate alerts for this backend
        const backendAlerts = this.generateAlertsForBackend(backendType, backendDiagnostic);
        alerts.push(...backendAlerts);
      } catch (error) {
        Logger.error(`Failed to generate diagnostics for ${backendType}:`, error);
        
        // Create critical alert for diagnostic failure
        alerts.push({
          id: this.generateAlertId(),
          severity: 'critical',
          category: 'reliability',
          message: `Failed to collect diagnostics for ${backendType}`,
          backend: backendType,
          timestamp,
          acknowledged: false,
          autoResolvable: false,
          suggestedActions: [
            'Check backend connectivity',
            'Verify monitoring system health',
            'Review error logs'
          ]
        });
      }
    }

    // Calculate system metrics
    const systemMetrics = this.calculateSystemMetrics(backends);
    
    // Determine overall health
    const overallHealth = this.determineOverallHealth(backends, systemMetrics);
    
    // Generate system-wide recommendations
    const recommendations = this.generateSystemRecommendations(backends, systemMetrics, alerts);
    
    // Create diagnostic summary
    const summary = this.createDiagnosticSummary(backends, systemMetrics, alerts);

    // Store alerts in history
    this.alertHistory.push(...alerts);
    this.pruneAlertHistory();

    const report: SystemDiagnosticReport = {
      timestamp,
      overallHealth,
      backends,
      systemMetrics,
      alerts,
      recommendations,
      summary
    };

    Logger.info('System diagnostic report generated', {
      overallHealth,
      backendsCount: Object.keys(backends).length,
      alertsCount: alerts.length,
      healthScore: summary.healthScore
    });

    return report;
  }

  /**
   * Generate diagnostic information for a specific backend
   */
  private async generateBackendDiagnostic(backendType: string): Promise<BackendDiagnostic> {
    const loggingMonitor = this.loggingMonitors.get(backendType);
    const vectorStore = this.vectorStores.get(backendType);
    
    if (!loggingMonitor || !vectorStore) {
      throw new Error(`Backend ${backendType} not properly registered`);
    }

    // Get health and performance data
    const health = loggingMonitor.getDiagnosticInfo();
    const performance = await vectorStore.getPerformanceMetrics();
    
    // Analyze connectivity
    const connectivity = this.analyzeConnectivity(backendType, loggingMonitor);
    
    // Identify error patterns
    const errorPatterns = this.identifyErrorPatterns(backendType, loggingMonitor);
    
    // Generate operational insights
    const operationalInsights = this.generateOperationalInsights(
      backendType, 
      health, 
      performance, 
      connectivity
    );

    return {
      backendType,
      health,
      performance,
      connectivity,
      errorPatterns,
      operationalInsights
    };
  }

  /**
   * Analyze connectivity status without exposing connection details
   */
  private analyzeConnectivity(backendType: string, loggingMonitor: LoggingMonitor): ConnectivityStatus {
    const recentEntries = loggingMonitor.getRecentLogEntries(50);
    const successfulEntries = recentEntries.filter(e => e.success);
    
    // Determine connection status
    let status: ConnectivityStatus['status'] = 'unknown';
    let connectionStability: ConnectivityStatus['connectionStability'] = 'stable';
    
    if (recentEntries.length === 0) {
      status = 'unknown';
    } else if (successfulEntries.length === 0) {
      status = 'disconnected';
      connectionStability = 'failing';
    } else if (successfulEntries.length === recentEntries.length) {
      status = 'connected';
    } else {
      const successRate = successfulEntries.length / recentEntries.length;
      if (successRate > 0.8) {
        status = 'connected';
        connectionStability = successRate > 0.95 ? 'stable' : 'unstable';
      } else {
        status = 'intermittent';
        connectionStability = 'unstable';
      }
    }

    // Calculate latency metrics
    const durations = recentEntries
      .filter(e => e.duration !== undefined)
      .map(e => e.duration!);
    
    const currentLatency = durations.length > 0 ? durations[durations.length - 1] : 0;
    const averageLatency = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;
    
    // Determine latency trend
    let latencyTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (durations.length >= 10) {
      const firstHalf = durations.slice(0, Math.floor(durations.length / 2));
      const secondHalf = durations.slice(Math.floor(durations.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, d) => sum + d, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, d) => sum + d, 0) / secondHalf.length;
      
      const change = (secondAvg - firstAvg) / firstAvg;
      if (change > 0.2) {
        latencyTrend = 'degrading';
      } else if (change < -0.2) {
        latencyTrend = 'improving';
      }
    }

    // Find last successful operation
    const lastSuccessfulOperation = successfulEntries.length > 0 
      ? successfulEntries[successfulEntries.length - 1].timestamp 
      : undefined;

    return {
      status,
      lastSuccessfulOperation,
      connectionStability,
      latency: {
        current: currentLatency,
        average: averageLatency,
        trend: latencyTrend
      }
    };
  }

  /**
   * Identify error patterns from log entries
   */
  private identifyErrorPatterns(backendType: string, loggingMonitor: LoggingMonitor): ErrorPattern[] {
    const errorEntries = loggingMonitor.getErrorLogEntries(200);
    const patterns = new Map<string, {
      entries: LogEntry[];
      operations: Set<string>;
    }>();

    // Group errors by type
    for (const entry of errorEntries) {
      const errorType = entry.errorCode || 'UNKNOWN_ERROR';
      
      if (!patterns.has(errorType)) {
        patterns.set(errorType, {
          entries: [],
          operations: new Set()
        });
      }
      
      const pattern = patterns.get(errorType)!;
      pattern.entries.push(entry);
      pattern.operations.add(entry.operation);
    }

    // Convert to error patterns
    const errorPatterns: ErrorPattern[] = [];
    
    for (const [errorType, data] of patterns) {
      const entries = data.entries;
      const frequency = entries.length;
      
      if (frequency === 0) continue;
      
      const firstSeen = new Date(Math.min(...entries.map(e => e.timestamp.getTime())));
      const lastSeen = new Date(Math.max(...entries.map(e => e.timestamp.getTime())));
      
      // Determine severity based on frequency and recency
      let severity: ErrorPattern['severity'] = 'low';
      if (frequency > 50) {
        severity = 'critical';
      } else if (frequency > 20) {
        severity = 'high';
      } else if (frequency > 5) {
        severity = 'medium';
      }
      
      // Determine trend
      const recentEntries = entries.filter(e => 
        e.timestamp.getTime() > Date.now() - 60 * 60 * 1000 // Last hour
      );
      const olderEntries = entries.filter(e => 
        e.timestamp.getTime() <= Date.now() - 60 * 60 * 1000
      );
      
      let trend: ErrorPattern['trend'] = 'stable';
      if (recentEntries.length > olderEntries.length * 1.5) {
        trend = 'increasing';
      } else if (recentEntries.length < olderEntries.length * 0.5) {
        trend = 'decreasing';
      }
      
      // Generate suggested actions
      const suggestedActions = this.generateErrorPatternActions(errorType, severity, trend);

      errorPatterns.push({
        errorType,
        frequency,
        firstSeen,
        lastSeen,
        operations: Array.from(data.operations),
        severity,
        trend,
        suggestedActions
      });
    }

    return errorPatterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate suggested actions for error patterns
   */
  private generateErrorPatternActions(
    errorType: string, 
    severity: ErrorPattern['severity'], 
    trend: ErrorPattern['trend']
  ): string[] {
    const actions: string[] = [];

    // Generic actions based on severity
    if (severity === 'critical') {
      actions.push('Immediate investigation required');
      actions.push('Consider switching to backup backend');
    } else if (severity === 'high') {
      actions.push('Prioritize investigation');
      actions.push('Monitor closely for escalation');
    }

    // Trend-based actions
    if (trend === 'increasing') {
      actions.push('Error frequency is increasing - investigate root cause');
      actions.push('Check for recent configuration changes');
    }

    // Error type specific actions
    if (errorType.includes('CONNECTION')) {
      actions.push('Check network connectivity');
      actions.push('Verify backend service availability');
      actions.push('Review connection pool settings');
    } else if (errorType.includes('TIMEOUT')) {
      actions.push('Check backend response times');
      actions.push('Consider increasing timeout values');
      actions.push('Optimize query performance');
    } else if (errorType.includes('VALIDATION')) {
      actions.push('Review data validation rules');
      actions.push('Check input data quality');
    } else if (errorType.includes('CIRCUIT_BREAKER')) {
      actions.push('Backend may be overloaded or unavailable');
      actions.push('Wait for circuit breaker recovery');
      actions.push('Check backend health');
    }

    return actions;
  }

  /**
   * Generate operational insights
   */
  private generateOperationalInsights(
    backendType: string,
    health: DiagnosticInfo,
    performance: PerformanceMetrics,
    connectivity: ConnectivityStatus
  ): OperationalInsight[] {
    const insights: OperationalInsight[] = [];

    // Performance insights
    if (connectivity.latency.average > 1000) {
      insights.push({
        category: 'performance',
        insight: `Average response time (${Math.round(connectivity.latency.average)}ms) is above optimal threshold`,
        impact: connectivity.latency.average > 5000 ? 'high' : 'medium',
        confidence: 0.9,
        actionable: true,
        relatedMetrics: ['averageResponseTime', 'latency']
      });
    }

    // Reliability insights
    if (health.operationSummary.successRate < 0.95) {
      insights.push({
        category: 'reliability',
        insight: `Success rate (${Math.round(health.operationSummary.successRate * 100)}%) is below target`,
        impact: health.operationSummary.successRate < 0.8 ? 'high' : 'medium',
        confidence: 0.95,
        actionable: true,
        relatedMetrics: ['successRate', 'errorRate']
      });
    }

    // Capacity insights
    const memoryUsageMB = performance.memoryUsage / 1024 / 1024;
    if (memoryUsageMB > 500) {
      insights.push({
        category: 'capacity',
        insight: `Memory usage (${Math.round(memoryUsageMB)}MB) is elevated`,
        impact: memoryUsageMB > 1000 ? 'high' : 'medium',
        confidence: 0.8,
        actionable: true,
        relatedMetrics: ['memoryUsage']
      });
    }

    // Optimization insights
    if (connectivity.latency.trend === 'degrading') {
      insights.push({
        category: 'optimization',
        insight: 'Response times are trending worse - optimization opportunity identified',
        impact: 'medium',
        confidence: 0.7,
        actionable: true,
        relatedMetrics: ['latencyTrend', 'responseTime']
      });
    }

    return insights;
  }

  /**
   * Calculate system-wide metrics
   */
  private calculateSystemMetrics(backends: Record<string, BackendDiagnostic>): SystemMetrics {
    let totalOperations = 0;
    let totalSuccessfulOperations = 0;
    let totalResponseTime = 0;
    let totalErrors = 0;
    let totalMemoryUsage = 0;
    let activeConnections = 0;
    const circuitBreakerStatus: Record<string, CircuitState> = {};

    for (const [backendType, diagnostic] of Object.entries(backends)) {
      const health = diagnostic.health;
      const performance = diagnostic.performance;
      
      totalOperations += health.operationSummary.totalOperations;
      totalSuccessfulOperations += Math.round(
        health.operationSummary.totalOperations * health.operationSummary.successRate
      );
      totalResponseTime += health.operationSummary.averageResponseTime * health.operationSummary.totalOperations;
      totalErrors += Math.round(
        health.operationSummary.totalOperations * health.operationSummary.errorRate
      );
      totalMemoryUsage += performance.memoryUsage;
      
      // Count active connections (simplified)
      if (diagnostic.connectivity.status === 'connected') {
        activeConnections++;
      }
      
      // Circuit breaker status
      const circuitBreaker = this.circuitBreakers.get(backendType);
      if (circuitBreaker) {
        circuitBreakerStatus[backendType] = circuitBreaker.getStats().state as CircuitState;
      }
    }

    const overallSuccessRate = totalOperations > 0 ? totalSuccessfulOperations / totalOperations : 1;
    const averageResponseTime = totalOperations > 0 ? totalResponseTime / totalOperations : 0;

    return {
      totalOperations,
      overallSuccessRate,
      averageResponseTime,
      totalErrors,
      memoryUsage: totalMemoryUsage,
      activeConnections,
      circuitBreakerStatus
    };
  }

  /**
   * Determine overall system health
   */
  private determineOverallHealth(
    backends: Record<string, BackendDiagnostic>,
    systemMetrics: SystemMetrics
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const backendHealths = Object.values(backends).map(b => b.health.systemHealth);
    
    // If any backend is unhealthy, system is unhealthy
    if (backendHealths.includes('unhealthy')) {
      return 'unhealthy';
    }
    
    // If any backend is degraded, system is degraded
    if (backendHealths.includes('degraded')) {
      return 'degraded';
    }
    
    // Check system-wide metrics
    if (systemMetrics.overallSuccessRate < 0.8 || systemMetrics.averageResponseTime > 5000) {
      return 'unhealthy';
    }
    
    if (systemMetrics.overallSuccessRate < 0.95 || systemMetrics.averageResponseTime > 1000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Generate alerts for a specific backend
   */
  private generateAlertsForBackend(
    backendType: string, 
    diagnostic: BackendDiagnostic
  ): DiagnosticAlert[] {
    const alerts: DiagnosticAlert[] = [];
    const timestamp = new Date();

    // Health-based alerts
    if (diagnostic.health.systemHealth === 'unhealthy') {
      alerts.push({
        id: this.generateAlertId(),
        severity: 'critical',
        category: 'reliability',
        message: `Backend ${backendType} is unhealthy`,
        backend: backendType,
        timestamp,
        acknowledged: false,
        autoResolvable: false,
        suggestedActions: diagnostic.health.recommendations
      });
    } else if (diagnostic.health.systemHealth === 'degraded') {
      alerts.push({
        id: this.generateAlertId(),
        severity: 'warning',
        category: 'performance',
        message: `Backend ${backendType} performance is degraded`,
        backend: backendType,
        timestamp,
        acknowledged: false,
        autoResolvable: false,
        suggestedActions: diagnostic.health.recommendations
      });
    }

    // Connectivity alerts
    if (diagnostic.connectivity.status === 'disconnected') {
      alerts.push({
        id: this.generateAlertId(),
        severity: 'critical',
        category: 'reliability',
        message: `Backend ${backendType} is disconnected`,
        backend: backendType,
        timestamp,
        acknowledged: false,
        autoResolvable: true,
        suggestedActions: [
          'Check backend service availability',
          'Verify network connectivity',
          'Review connection configuration'
        ]
      });
    } else if (diagnostic.connectivity.status === 'intermittent') {
      alerts.push({
        id: this.generateAlertId(),
        severity: 'warning',
        category: 'reliability',
        message: `Backend ${backendType} has intermittent connectivity`,
        backend: backendType,
        timestamp,
        acknowledged: false,
        autoResolvable: true,
        suggestedActions: [
          'Monitor connection stability',
          'Check for network issues',
          'Review timeout settings'
        ]
      });
    }

    // Error pattern alerts
    for (const pattern of diagnostic.errorPatterns) {
      if (pattern.severity === 'critical' || pattern.severity === 'high') {
        alerts.push({
          id: this.generateAlertId(),
          severity: pattern.severity === 'critical' ? 'critical' : 'error',
          category: 'reliability',
          message: `High frequency ${pattern.errorType} errors in ${backendType} (${pattern.frequency} occurrences)`,
          backend: backendType,
          timestamp,
          acknowledged: false,
          autoResolvable: false,
          suggestedActions: pattern.suggestedActions
        });
      }
    }

    return alerts;
  }

  /**
   * Generate system-wide recommendations
   */
  private generateSystemRecommendations(
    backends: Record<string, BackendDiagnostic>,
    systemMetrics: SystemMetrics,
    alerts: DiagnosticAlert[]
  ): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Critical alerts require urgent action
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push({
        priority: 'urgent',
        category: 'reliability',
        recommendation: `Address ${criticalAlerts.length} critical system issues immediately`,
        expectedImpact: 'Prevent system failure and restore normal operation',
        implementationComplexity: 'high',
        estimatedTimeToImplement: 'Immediate',
        affectedBackends: [...new Set(criticalAlerts.map(a => a.backend).filter(Boolean))]
      });
    }

    // Performance optimization
    if (systemMetrics.averageResponseTime > 1000) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        recommendation: 'Optimize system response times',
        expectedImpact: `Reduce average response time from ${Math.round(systemMetrics.averageResponseTime)}ms`,
        implementationComplexity: 'medium',
        estimatedTimeToImplement: '1-2 weeks',
        affectedBackends: Object.keys(backends)
      });
    }

    // Reliability improvement
    if (systemMetrics.overallSuccessRate < 0.95) {
      recommendations.push({
        priority: 'high',
        category: 'reliability',
        recommendation: 'Improve system reliability',
        expectedImpact: `Increase success rate from ${Math.round(systemMetrics.overallSuccessRate * 100)}%`,
        implementationComplexity: 'medium',
        estimatedTimeToImplement: '2-4 weeks',
        affectedBackends: Object.keys(backends)
      });
    }

    // Capacity planning
    const highMemoryBackends = Object.entries(backends)
      .filter(([_, diagnostic]) => diagnostic.performance.memoryUsage > 500 * 1024 * 1024)
      .map(([backendType, _]) => backendType);
    
    if (highMemoryBackends.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'scaling',
        recommendation: 'Plan for increased memory capacity',
        expectedImpact: 'Prevent memory-related performance issues',
        implementationComplexity: 'low',
        estimatedTimeToImplement: '1 week',
        affectedBackends: highMemoryBackends
      });
    }

    // Maintenance recommendations
    const errorProneBackends = Object.entries(backends)
      .filter(([_, diagnostic]) => diagnostic.errorPatterns.length > 0)
      .map(([backendType, _]) => backendType);
    
    if (errorProneBackends.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'maintenance',
        recommendation: 'Review and address recurring error patterns',
        expectedImpact: 'Reduce error frequency and improve stability',
        implementationComplexity: 'medium',
        estimatedTimeToImplement: '1-3 weeks',
        affectedBackends: errorProneBackends
      });
    }

    return recommendations;
  }

  /**
   * Create diagnostic summary
   */
  private createDiagnosticSummary(
    backends: Record<string, BackendDiagnostic>,
    systemMetrics: SystemMetrics,
    alerts: DiagnosticAlert[]
  ): DiagnosticSummary {
    // Calculate health score (0-100)
    let healthScore = 100;
    
    // Deduct points for alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const errorAlerts = alerts.filter(a => a.severity === 'error').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
    
    healthScore -= criticalAlerts * 30;
    healthScore -= errorAlerts * 15;
    healthScore -= warningAlerts * 5;
    
    // Deduct points for poor metrics
    if (systemMetrics.overallSuccessRate < 0.8) {
      healthScore -= 20;
    } else if (systemMetrics.overallSuccessRate < 0.95) {
      healthScore -= 10;
    }
    
    healthScore = Math.max(0, healthScore);

    // Calculate performance score
    let performanceScore = 100;
    
    if (systemMetrics.averageResponseTime > 5000) {
      performanceScore -= 40;
    } else if (systemMetrics.averageResponseTime > 1000) {
      performanceScore -= 20;
    }
    
    performanceScore = Math.max(0, performanceScore);

    // Calculate reliability score
    const reliabilityScore = Math.round(systemMetrics.overallSuccessRate * 100);

    // Generate key findings
    const keyFindings: string[] = [];
    
    if (criticalAlerts > 0) {
      keyFindings.push(`${criticalAlerts} critical issues require immediate attention`);
    }
    
    if (systemMetrics.overallSuccessRate < 0.95) {
      keyFindings.push(`System success rate is ${Math.round(systemMetrics.overallSuccessRate * 100)}%`);
    }
    
    if (systemMetrics.averageResponseTime > 1000) {
      keyFindings.push(`Average response time is ${Math.round(systemMetrics.averageResponseTime)}ms`);
    }
    
    const disconnectedBackends = Object.values(backends)
      .filter(b => b.connectivity.status === 'disconnected').length;
    if (disconnectedBackends > 0) {
      keyFindings.push(`${disconnectedBackends} backend(s) are disconnected`);
    }

    // Count optimization opportunities
    const optimizationOpportunities = Object.values(backends)
      .reduce((count, backend) => {
        return count + backend.operationalInsights
          .filter(insight => insight.category === 'optimization').length;
      }, 0);

    return {
      healthScore,
      performanceScore,
      reliabilityScore,
      keyFindings,
      criticalIssues: criticalAlerts,
      warningIssues: warningAlerts,
      optimizationOpportunities
    };
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${++this.alertIdCounter}`;
  }

  /**
   * Prune old alerts from history
   */
  private pruneAlertHistory(): void {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = Date.now() - maxAge;
    
    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() > cutoff
    );
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): DiagnosticAlert[] {
    const sorted = [...this.alertHistory].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      Logger.info(`Alert acknowledged: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get system health summary
   */
  async getHealthSummary(): Promise<{
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    activeBackends: number;
    totalBackends: number;
    criticalAlerts: number;
    lastReportTime?: Date;
  }> {
    const totalBackends = this.vectorStores.size;
    let activeBackends = 0;
    
    // Quick health check for each backend
    for (const [backendType, vectorStore] of this.vectorStores) {
      try {
        const health = await vectorStore.getHealthStatus();
        if (health.status !== 'unhealthy') {
          activeBackends++;
        }
      } catch (error) {
        // Backend is not responding
      }
    }
    
    // Count recent critical alerts
    const recentAlerts = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() > Date.now() - 60 * 60 * 1000 && // Last hour
      alert.severity === 'critical' &&
      !alert.acknowledged
    );
    
    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (activeBackends === 0 || recentAlerts.length > 0) {
      overallHealth = 'unhealthy';
    } else if (activeBackends < totalBackends) {
      overallHealth = 'degraded';
    }

    return {
      overallHealth,
      activeBackends,
      totalBackends,
      criticalAlerts: recentAlerts.length,
      lastReportTime: this.alertHistory.length > 0 
        ? new Date(Math.max(...this.alertHistory.map(a => a.timestamp.getTime())))
        : undefined
    };
  }

  /**
   * Dispose of diagnostic system resources
   */
  dispose(): void {
    this.loggingMonitors.clear();
    this.vectorStores.clear();
    this.circuitBreakers.clear();
    this.alertHistory = [];
    
    Logger.info('Diagnostic system disposed');
  }
}

/**
 * Global diagnostic system instance
 */
export const globalDiagnosticSystem = new DiagnosticSystem();