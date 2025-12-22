import { DIContainer, DIContainerConfig, Container } from "./container/container.js";
import { ServiceKeys } from "./container/service-keys.js";
import { SQLiteDatabase } from "../storage/sqlite-db.js";
import { SemanticEngine } from "../utils/semantic-engine.js";
import { PatternEngine } from "../utils/pattern-engine.js";
import { Logger } from "../utils/logger.js";
import { PathValidator } from "../utils/path-validator.js";
import { config } from "../utils/config.js";

let globalContainer: DIContainer | null = null;

export async function initializeDIContainer(options: { projectPath: string }): Promise<Container> {
    if (globalContainer) {
        await globalContainer.dispose();
    }

    const containerConfig: DIContainerConfig = { projectPath: options.projectPath };
    globalContainer = new DIContainer(containerConfig);

    registerInfrastructureServices(globalContainer, options.projectPath);
    registerEngineServices(globalContainer);
    registerServiceLayer(globalContainer);
    registerUtilityServices(globalContainer);

    await globalContainer.get(ServiceKeys.ANALYSIS_SERVICE);
    await globalContainer.get(ServiceKeys.LEARNING_SERVICE);
    await globalContainer.get(ServiceKeys.SEARCH_SERVICE);
    await globalContainer.get(ServiceKeys.DIAGNOSTIC_SERVICE);

    globalContainer.markInitialized();
    return createContainerInterface(globalContainer);
}

export function getCurrentContainer(): DIContainer {
    if (!globalContainer || !globalContainer.initialized) {
        throw new Error("DI Container not initialized. Call initializeDIContainer() first.");
    }
    return globalContainer;
}

export async function disposeDIContainer(): Promise<void> {
    if (globalContainer) {
        await globalContainer.dispose();
        globalContainer = null;
    }
}

function registerInfrastructureServices(container: DIContainer, projectPath: string): void {
    container.registerFactory(ServiceKeys.DATABASE, () => {
        const dbPath = config.getDatabasePath(projectPath);
        return new SQLiteDatabase(dbPath);
    });
}

function registerEngineServices(container: DIContainer): void {
    container.registerFactory(ServiceKeys.SEMANTIC_ENGINE, async () => {
        return new SemanticEngine();
    });

    container.registerFactory(ServiceKeys.PATTERN_ENGINE, async () => {
        return new PatternEngine();
    });
}

function registerServiceLayer(container: DIContainer): void {
    container.registerFactory(ServiceKeys.ANALYSIS_SERVICE, async () => {
        const { AnalysisService } = await import("./services/AnalysisService.js");
        const semanticEngine = await container.get(ServiceKeys.SEMANTIC_ENGINE);
        const patternEngine = await container.get(ServiceKeys.PATTERN_ENGINE);
        const database = await container.get(ServiceKeys.DATABASE);
        return new AnalysisService(semanticEngine, patternEngine, database);
    });

    container.registerFactory(ServiceKeys.LEARNING_SERVICE, async () => {
        const { LearningServiceImpl } = await import("./services/LearningService.js");
        const semanticEngine = await container.get(ServiceKeys.SEMANTIC_ENGINE);
        const patternEngine = await container.get(ServiceKeys.PATTERN_ENGINE);
        const database = await container.get(ServiceKeys.DATABASE);
        return new LearningServiceImpl(semanticEngine, patternEngine, database);
    });

    container.registerFactory(ServiceKeys.SEARCH_SERVICE, async () => {
        const { SearchServiceImpl } = await import("./services/SearchService.js");
        const database = await container.get(ServiceKeys.DATABASE);
        return new SearchServiceImpl(database);
    });

    container.registerFactory(ServiceKeys.DIAGNOSTIC_SERVICE, async () => {
        const { DiagnosticServiceImpl } = await import("./services/DiagnosticService.js");
        const database = await container.get(ServiceKeys.DATABASE);
        return new DiagnosticServiceImpl(database);
    });
}

function registerUtilityServices(container: DIContainer): void {
    container.register(ServiceKeys.LOGGER, Logger);
    container.register(ServiceKeys.PATH_VALIDATOR, PathValidator);
}

async function createContainerInterface(container: DIContainer): Promise<Container> {
    const { AnalysisServiceImpl } = await import("./services/AnalysisService.js");
    const { LearningServiceImpl } = await import("./services/LearningService.js");
    const { SearchServiceImpl } = await import("./services/SearchService.js");
    const { DiagnosticServiceImpl } = await import("./services/DiagnosticService.js");

    return {
        get analysisService() {
            return container.getSync(ServiceKeys.ANALYSIS_SERVICE);
        },
        get learningService() {
            return container.getSync(ServiceKeys.LEARNING_SERVICE);
        },
        get searchService() {
            return container.getSync(ServiceKeys.SEARCH_SERVICE);
        },
        get diagnosticService() {
            return container.getSync(ServiceKeys.DIAGNOSTIC_SERVICE);
        },
    };
}

export function isContainerInitialized(): boolean {
    return globalContainer !== null && globalContainer.initialized;
}
