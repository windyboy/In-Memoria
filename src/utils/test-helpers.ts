/**
 * Test helpers and utilities for unit testing
 */
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SQLiteDatabase } from '../storage/sqlite-db.js';

/**
 * Create a temporary test directory
 */
export function createTestDir(prefix = 'in-memoria-test'): string {
    const testDir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
    return testDir;
}

/**
 * Clean up a test directory
 */
export function cleanupTestDir(dirPath: string): void {
    if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
    }
}

/**
 * Create an in-memory test database
 */
export function createTestDatabase(): SQLiteDatabase {
    return new SQLiteDatabase(':memory:');
}

/**
 * Create a test database in a specific directory
 */
export function createTestDatabaseInDir(dirPath: string): SQLiteDatabase {
    const dbPath = join(dirPath, 'test.db');
    return new SQLiteDatabase(dbPath);
}

/**
 * Mock embedding vector (384 dimensions, all zeros)
 */
export function createMockEmbedding(dimension = 384): number[] {
    return new Array(dimension).fill(0);
}

/**
 * Mock embedding vector with specific pattern
 */
export function createMockEmbeddingWithPattern(dimension = 384, pattern: 'ascending' | 'random' | 'zeros' = 'zeros'): number[] {
    switch (pattern) {
        case 'ascending':
            return Array.from({ length: dimension }, (_, i) => i / dimension);
        case 'random':
            return Array.from({ length: dimension }, () => Math.random());
        case 'zeros':
        default:
            return new Array(dimension).fill(0);
    }
}

/**
 * Mock semantic concept for testing
 */
export function createMockConcept(overrides: Partial<{
    id: string;
    conceptName: string;
    conceptType: string;
    filePath: string;
    language: string;
    confidence: number;
    metadata: Record<string, any>;
}> = {}) {
    return {
        id: overrides.id || `concept-${Date.now()}`,
        conceptName: overrides.conceptName || 'TestFunction',
        conceptType: overrides.conceptType || 'function',
        filePath: overrides.filePath || '/test/file.ts',
        language: overrides.language || 'typescript',
        confidence: overrides.confidence || 0.9,
        metadata: overrides.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Mock chunk for testing
 */
export function createMockChunk(overrides: Partial<{
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    chunkType: string;
}> = {}) {
    return {
        id: overrides.id || `chunk-${Date.now()}`,
        filePath: overrides.filePath || '/test/file.ts',
        startLine: overrides.startLine || 1,
        endLine: overrides.endLine || 10,
        content: overrides.content || 'function test() { return true; }',
        chunkType: overrides.chunkType || 'function',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Wait for a condition to be true (for async operations)
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
    const originalConsole = { ...console };

    beforeEach(() => {
        console.log = () => {};
        console.warn = () => {};
        console.error = () => {};
    });

    afterEach(() => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    });
}
