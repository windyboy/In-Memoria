import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchServiceImpl } from './SearchService.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';
import { VectorStore } from '../../storage/vector-store.js';
import { EmbeddingEngine } from '../../utils/embedding-engine.js';
import { ChunkRepository } from '../../storage/repositories/chunk-repository.js';
import { VectorIndexRepository } from '../../storage/repositories/vector-index-repository.js';
import { createTestDatabase, createMockConcept, createMockChunk, createMockEmbedding } from '../../utils/test-helpers.js';

// Mock embedding engine
class MockEmbeddingEngine {
    async embed(text: string): Promise<number[]> {
        // Return a consistent mock embedding
        return createMockEmbedding();
    }
}

// Mock vector index repository
class MockVectorIndexRepository {
    private enabled = true;
    private vectors = new Map<string, number[]>();

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    async upsertVector(chunkId: string, vector: number[]): Promise<void> {
        this.vectors.set(chunkId, vector);
    }

    async search(vector: number[], limit: number): Promise<Array<{ chunkId: string; distance: number }>> {
        // Return mock search results
        return Array.from(this.vectors.keys())
            .slice(0, limit)
            .map((chunkId, index) => ({
                chunkId,
                distance: 0.1 * (index + 1), // Increasing distance
            }));
    }

    async clear(): Promise<void> {
        this.vectors.clear();
    }
}

// Mock vector store
class MockVectorStore {
    async searchVectors(vector: number[], limit: number): Promise<string[]> {
        return [];
    }
}

describe('SearchService', () => {
    let db: SQLiteDatabase;
    let searchService: SearchServiceImpl;
    let vectorStore: VectorStore;
    let embeddingEngine: EmbeddingEngine;
    let chunkRepository: ChunkRepository;
    let vectorIndexRepository: MockVectorIndexRepository;

    beforeEach(() => {
        db = createTestDatabase();
        vectorStore = new MockVectorStore() as any;
        embeddingEngine = new MockEmbeddingEngine() as any;
        chunkRepository = new ChunkRepository(db);
        vectorIndexRepository = new MockVectorIndexRepository() as any;

        searchService = new SearchServiceImpl(
            db,
            vectorStore,
            embeddingEngine,
            chunkRepository,
            vectorIndexRepository as any,
        );
    });

    afterEach(() => {
        db.close();
    });

    describe('searchSemantic', () => {
        it('should return empty results when no data exists', async () => {
            const results = await searchService.searchSemantic('test query');
            expect(results).toEqual([]);
        });

        it('should return semantic search results when data exists', async () => {
            // Setup: Add chunks and vectors
            const chunks = [
                createMockChunk({
                    id: 'chunk-1',
                    filePath: '/test/auth.ts',
                    content: 'function authenticate(user) { return true; }',
                    chunkType: 'function',
                }),
                createMockChunk({
                    id: 'chunk-2',
                    filePath: '/test/user.ts',
                    content: 'class User { constructor(name) { this.name = name; } }',
                    chunkType: 'class',
                }),
            ];

            db.upsertChunks(chunks);
            await vectorIndexRepository.upsertVector('chunk-1', createMockEmbedding());
            await vectorIndexRepository.upsertVector('chunk-2', createMockEmbedding());

            // Execute search
            const results = await searchService.searchSemantic('authentication');

            // Verify
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('file');
            expect(results[0]).toHaveProperty('content');
            expect(results[0]).toHaveProperty('score');
            expect(results[0]).toHaveProperty('similarity');
        });

        it('should respect limit option', async () => {
            // Setup: Add 5 chunks
            for (let i = 0; i < 5; i++) {
                const chunk = createMockChunk({
                    id: `chunk-${i}`,
                    filePath: `/test/file${i}.ts`,
                    content: `function test${i}() { return ${i}; }`,
                });
                db.upsertChunks([chunk]);
                await vectorIndexRepository.upsertVector(chunk.id, createMockEmbedding());
            }

            // Execute with limit
            const results = await searchService.searchSemantic('test', { limit: 2 });

            // Verify
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should filter by language when specified', async () => {
            // Setup: Add chunks in different languages
            const chunks = [
                createMockChunk({
                    id: 'chunk-1',
                    filePath: '/test/file.ts',
                    content: 'typescript code',
                }),
                createMockChunk({
                    id: 'chunk-2',
                    filePath: '/test/file.js',
                    content: 'javascript code',
                }),
                createMockChunk({
                    id: 'chunk-3',
                    filePath: '/test/file.py',
                    content: 'python code',
                }),
            ];

            db.upsertChunks(chunks);
            for (const chunk of chunks) {
                await vectorIndexRepository.upsertVector(chunk.id, createMockEmbedding());
            }

            // Execute with language filter
            const results = await searchService.searchSemantic('code', { language: 'ts' });

            // Verify - should only return TypeScript files
            expect(results.every(r => r.file.endsWith('.ts'))).toBe(true);
        });

        it('should handle empty query gracefully', async () => {
            await expect(searchService.searchSemantic('')).rejects.toThrow();
        });

        it('should handle vector search disabled', async () => {
            // Disable vector search
            vectorIndexRepository.setEnabled(false);

            // Should fall back to concept search
            const concepts = [
                createMockConcept({
                    id: 'concept-1',
                    conceptName: 'TestFunction',
                    conceptType: 'function',
                    filePath: '/test/file.ts',
                }),
            ];
            db.replaceSemanticConcepts(concepts);

            const results = await searchService.searchSemantic('TestFunction');

            // Should return concept-based results
            expect(results).toBeDefined();
        });

        it('should not return duplicate results', async () => {
            // Setup: Add chunks
            const chunks = [
                createMockChunk({
                    id: 'chunk-1',
                    filePath: '/test/file.ts',
                    content: 'duplicate content',
                }),
            ];

            db.upsertChunks(chunks);
            await vectorIndexRepository.upsertVector('chunk-1', createMockEmbedding());

            // Execute
            const results = await searchService.searchSemantic('duplicate');

            // Verify no duplicates
            const ids = results.map(r => r.file + r.content);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });

    describe('searchText', () => {
        it('should return empty results when no concepts match', async () => {
            const results = await searchService.searchText('nonexistent');
            expect(results).toEqual([]);
        });

        it('should search concepts by text query', async () => {
            // Setup: Add concepts
            const concepts = [
                createMockConcept({
                    id: 'concept-1',
                    conceptName: 'AuthenticationService',
                    conceptType: 'class',
                    filePath: '/test/auth.ts',
                }),
                createMockConcept({
                    id: 'concept-2',
                    conceptName: 'UserService',
                    conceptType: 'class',
                    filePath: '/test/user.ts',
                }),
            ];

            db.replaceSemanticConcepts(concepts);

            // Execute search
            const results = await searchService.searchText('Service');

            // Verify
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.content.includes('Service'))).toBe(true);
        });

        it('should be case-insensitive', async () => {
            const concepts = [
                createMockConcept({
                    id: 'concept-1',
                    conceptName: 'TestFunction',
                    filePath: '/test/file.ts',
                }),
            ];

            db.replaceSemanticConcepts(concepts);

            // Search with different cases
            const lowerResults = await searchService.searchText('testfunction');
            const upperResults = await searchService.searchText('TESTFUNCTION');

            expect(lowerResults.length).toBeGreaterThan(0);
            expect(upperResults.length).toBeGreaterThan(0);
        });

        it('should respect limit option', async () => {
            // Add multiple concepts
            for (let i = 0; i < 10; i++) {
                db.replaceSemanticConcepts([
                    createMockConcept({
                        id: `concept-${i}`,
                        conceptName: `TestFunction${i}`,
                    }),
                ]);
            }

            const results = await searchService.searchText('TestFunction', { limit: 3 });
            expect(results.length).toBeLessThanOrEqual(3);
        });

        it('should handle special characters in query', async () => {
            const concepts = [
                createMockConcept({
                    id: 'concept-1',
                    conceptName: 'function_with_underscore',
                }),
            ];

            db.replaceSemanticConcepts(concepts);

            const results = await searchService.searchText('function_with');
            expect(results.length).toBeGreaterThan(0);
        });

        it('should validate empty query', async () => {
            await expect(searchService.searchText('')).rejects.toThrow();
        });
    });

    describe('searchPatterns', () => {
        it('should return empty results when no patterns exist', async () => {
            const results = await searchService.searchPatterns('naming');
            expect(results).toEqual([]);
        });

        it('should search patterns by type', async () => {
            // Setup: Add patterns
            const patterns = [
                {
                    id: 'pattern-1',
                    patternType: 'naming',
                    patternCategory: 'function',
                    patternData: JSON.stringify({ pattern: 'camelCase', example: 'testFunction' }),
                    confidence: 0.9,
                    metadata: JSON.stringify({ files: ['/test/file1.ts'] }),
                },
                {
                    id: 'pattern-2',
                    patternType: 'structural',
                    patternCategory: 'module',
                    patternData: JSON.stringify({ pattern: 'barrel exports' }),
                    confidence: 0.8,
                    metadata: JSON.stringify({ files: ['/test/file2.ts'] }),
                },
            ];

            db.replaceDeveloperPatterns(patterns);

            // Execute search
            const results = await searchService.searchPatterns('naming');

            // Verify
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].patternType).toBe('naming');
            expect(results[0]).toHaveProperty('confidence');
            expect(results[0]).toHaveProperty('frequency');
        });

        it('should respect limit option', async () => {
            // Add multiple patterns
            for (let i = 0; i < 5; i++) {
                db.replaceDeveloperPatterns([
                    {
                        id: `pattern-${i}`,
                        patternType: 'naming',
                        patternCategory: 'function',
                        patternData: JSON.stringify({ pattern: `pattern${i}` }),
                        confidence: 0.9 - i * 0.1,
                        metadata: JSON.stringify({}),
                    },
                ]);
            }

            const results = await searchService.searchPatterns('naming', { limit: 2 });
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should validate empty query', async () => {
            await expect(searchService.searchPatterns('')).rejects.toThrow();
        });

        it('should sort patterns by confidence', async () => {
            // Add patterns with different confidence scores
            const patterns = [
                {
                    id: 'pattern-1',
                    patternType: 'naming',
                    patternCategory: 'function',
                    patternData: JSON.stringify({ pattern: 'pattern1' }),
                    confidence: 0.5,
                    metadata: JSON.stringify({}),
                },
                {
                    id: 'pattern-2',
                    patternType: 'naming',
                    patternCategory: 'function',
                    patternData: JSON.stringify({ pattern: 'pattern2' }),
                    confidence: 0.9,
                    metadata: JSON.stringify({}),
                },
                {
                    id: 'pattern-3',
                    patternType: 'naming',
                    patternCategory: 'function',
                    patternData: JSON.stringify({ pattern: 'pattern3' }),
                    confidence: 0.7,
                    metadata: JSON.stringify({}),
                },
            ];

            db.replaceDeveloperPatterns(patterns);

            const results = await searchService.searchPatterns('naming');

            // Verify sorted by confidence (descending)
            for (let i = 0; i < results.length - 1; i++) {
                expect(results[i].confidence).toBeGreaterThanOrEqual(results[i + 1].confidence);
            }
        });
    });

    describe('error handling', () => {
        it('should handle database errors gracefully', async () => {
            // Close database to simulate error
            db.close();

            await expect(searchService.searchText('query')).rejects.toThrow();
        });

        it('should handle embedding engine errors', async () => {
            // Mock embedding engine to throw error
            const errorEngine = {
                async embed(text: string): Promise<number[]> {
                    throw new Error('Embedding failed');
                },
            };

            const errorService = new SearchServiceImpl(
                db,
                vectorStore,
                errorEngine as any,
                chunkRepository,
                vectorIndexRepository as any,
            );

            // Should handle error gracefully (fall back to concept search)
            const concepts = [
                createMockConcept({
                    id: 'concept-1',
                    conceptName: 'TestFunction',
                }),
            ];
            db.replaceSemanticConcepts(concepts);

            const results = await errorService.searchSemantic('TestFunction');
            expect(results).toBeDefined();
        });
    });
});
