import { ServiceKey, ServiceType, ValidServiceKey } from './service-keys.js';

/**
 * Configuration options for DI container initialization
 */
export interface DIContainerConfig {
  projectPath: string;
  vectorBackendType?: string;
  vectorBackendConfig?: any;
  enableCircuitBreaker?: boolean;
}

/**
 * Service factory function type
 */
type ServiceFactory<T> = () => T | Promise<T>;

/**
 * Dependency Injection Container
 * Manages service singletons and provides type-safe service resolution
 */
export class DIContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, ServiceFactory<any>>();
  private isInitialized = false;
  private isDisposed = false;

  constructor(private config: DIContainerConfig) {}

  /**
   * Register a singleton service instance
   */
  register<T>(key: ServiceKey<T>, service: T): void {
    if (this.isDisposed) {
      throw new Error('Cannot register services on disposed container');
    }
    this.services.set(key.key, service);
  }

  /**
   * Register a factory function for lazy initialization
   */
  registerFactory<T>(key: ServiceKey<T>, factory: ServiceFactory<T>): void {
    if (this.isDisposed) {
      throw new Error('Cannot register factories on disposed container');
    }
    this.factories.set(key.key, factory);
  }

  /**
   * Get a service, creating it if needed via factory
   */
  async get<T>(key: ServiceKey<T>): Promise<T> {
    if (this.isDisposed) {
      throw new Error('Cannot get services from disposed container');
    }

    // Return existing service if available
    if (this.services.has(key.key)) {
      return this.services.get(key.key) as T;
    }

    // Create service via factory if available
    if (this.factories.has(key.key)) {
      const factory = this.factories.get(key.key)!;
      const service = await factory();
      this.services.set(key.key, service);
      return service as T;
    }

    throw new Error(`Service not registered: ${key.key}`);
  }

  /**
   * Get a service synchronously (throws if service requires async initialization)
   */
  getSync<T>(key: ServiceKey<T>): T {
    if (this.isDisposed) {
      throw new Error('Cannot get services from disposed container');
    }

    // Return existing service if available
    if (this.services.has(key.key)) {
      return this.services.get(key.key) as T;
    }

    // Try to create service via factory synchronously
    if (this.factories.has(key.key)) {
      const factory = this.factories.get(key.key)!;
      const service = factory();
      
      // Check if factory returned a promise
      if (service && typeof service === 'object' && 'then' in service) {
        throw new Error(`Service '${key.key}' requires async initialization. Use get() instead of getSync()`);
      }
      
      this.services.set(key.key, service);
      return service as T;
    }

    throw new Error(`Service not registered: ${key.key}`);
  }

  /**
   * Check if a service is registered
   */
  has(key: ServiceKey<any>): boolean {
    return this.services.has(key.key) || this.factories.has(key.key);
  }

  /**
   * Get the container configuration
   */
  getConfig(): Readonly<DIContainerConfig> {
    return { ...this.config };
  }

  /**
   * Mark container as initialized
   */
  markInitialized(): void {
    this.isInitialized = true;
  }

  /**
   * Check if container is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if container is disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose of the container and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // Clean up services that have cleanup methods
    for (const [key, service] of this.services.entries()) {
      if (service && typeof service === 'object') {
        // Check for common cleanup method names
        if (typeof service.dispose === 'function') {
          try {
            await service.dispose();
          } catch (error) {
            console.warn(`Failed to dispose service '${key}':`, error);
          }
        } else if (typeof service.close === 'function') {
          try {
            await service.close();
          } catch (error) {
            console.warn(`Failed to close service '${key}':`, error);
          }
        } else if (typeof service.cleanup === 'function') {
          try {
            await service.cleanup();
          } catch (error) {
            console.warn(`Failed to cleanup service '${key}':`, error);
          }
        }
      }
    }

    // Clear all services and factories
    this.services.clear();
    this.factories.clear();
    this.isDisposed = true;
  }

  /**
   * Get all registered service keys
   */
  getRegisteredKeys(): string[] {
    const keys = new Set<string>();
    this.services.forEach((_, key) => keys.add(key));
    this.factories.forEach((_, key) => keys.add(key));
    return Array.from(keys);
  }
}

/**
 * Container interface for accessing the four core services
 * This provides a clean interface for the service layer
 */
export interface Container {
  analysisService: import('../services/AnalysisService.js').AnalysisService;
  learningService: import('../services/LearningService.js').LearningService;
  searchService: import('../services/SearchService.js').SearchService;
  diagnosticService: import('../services/DiagnosticService.js').DiagnosticService;
}