#!/usr/bin/env node

import { initializeDIContainer, disposeDIContainer } from '../core/bootstrap.js';
import { Logger } from '../utils/logger.js';
import { PathValidator } from '../utils/path-validator.js';
import { translateError } from '../core/errors.js';
import { VectorIndexRepository } from '../storage/repositories/vector-index-repository.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { EmbeddingEngine } from '../utils/embedding-engine.js';
import { config } from '../utils/config.js';

/**
 * CLI arguments for the rebuild-index command
 */
export interface RebuildIndexArgs {
    path: string;
    force?: boolean;
    verbose?: boolean;
}

/**
 * Pure CLI adapter for the rebuild-index command
 * Rebuilds the vector index from existing chunks
 */
export async function handleRebuildIndexCommand(args: RebuildIndexArgs): Promise<void> {
    try {
        // Validate and resolve the project path
        let projectPath: string;
        try {
            projectPath = PathValidator.validateProjectPath(args.path, 'rebuild-index command');
        } catch (error) {
            throw translateError(error, 'Path validation');
        }

        console.log(`🔧 Rebuilding vector index for: ${projectPath}`);

        // Initialize components directly (without full DI container for this maintenance command)
        const dbPath = config.getDatabasePath(projectPath);
        const db = new SQLiteDatabase(dbPath);
        const embeddingEngine = new EmbeddingEngine();
        const vecExtPath = config.getVecExtensionPath();
        const vectorRepo = new VectorIndexRepository(
            projectPath,
            config.getEmbeddingDimension(),
            vecExtPath
        );

        // Check current status
        const currentVectorCount = vectorRepo.getCount();
        const currentConfig = db.getEmbeddingConfig("current");
        const newConfig = {
            model: config.getEmbeddingModel(),
            dimension: config.getEmbeddingDimension(),
        };

        console.log(`📊 Current vector count: ${currentVectorCount}`);

        if (currentConfig) {
            console.log(`📊 Current embedding config: model=${currentConfig.model}, dimension=${currentConfig.dimension}`);
        }
        console.log(`📊 New embedding config: model=${newConfig.model}, dimension=${newConfig.dimension}`);

        // Check if rebuild is needed
        const needsRebuild = !currentConfig ||
            currentConfig.model !== newConfig.model ||
            currentConfig.dimension !== newConfig.dimension;

        if (!needsRebuild && !args.force) {
            console.log("✅ Vector index is up to date. Use --force to rebuild anyway.");
            vectorRepo.close();
            db.close();
            return;
        }

        console.log(`🔄 ${needsRebuild ? "Embedding config changed, rebuilding" : "Forced rebuild requested"}...`);

        // Clear existing vectors
        await vectorRepo.clear();

        // Get chunk count from database
        const chunkCountResult = (db as any).db?.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number } | undefined;
        const chunkCount = chunkCountResult?.count || 0;

        if (chunkCount === 0) {
            console.log("⚠️  No chunks found in database. Please run 'learn' command first.");
            vectorRepo.close();
            db.close();
            return;
        }

        console.log(`📦 Found ${chunkCount} chunks to rebuild`);

        // Batch process chunks
        const batchSize = 50;
        let processed = 0;

        const allChunkIds = (db as any).db
            .prepare("SELECT id, content FROM chunks")
            .all() as Array<{ id: string; content: string }>;

        for (let i = 0; i < allChunkIds.length; i += batchSize) {
            const batch = allChunkIds.slice(i, i + batchSize);
            const vectors: Array<{ chunkId: string; embedding: number[] }> = [];

            for (const chunk of batch) {
                const embedding = await embeddingEngine.embed(chunk.content.substring(0, 1000)); // Limit content length
                if (embedding.length > 0) {
                    vectors.push({ chunkId: chunk.id, embedding });
                }
            }

            await vectorRepo.upsertVectors(vectors);
            processed += batch.length;

            if (args.verbose) {
                console.log(`   Processed ${processed}/${chunkCount} chunks`);
            } else if (processed % 100 === 0) {
                console.log(`   Processed ${processed}/${chunkCount} chunks`);
            }
        }

        // Update embedding config
        db.upsertEmbeddingConfig({
            id: "current",
            model: newConfig.model,
            dimension: newConfig.dimension,
            normalize: true,
        });

        // Final stats
        const newVectorCount = vectorRepo.getCount();
        console.log(`✅ Vector index rebuild complete`);
        console.log(`   Vectors indexed: ${newVectorCount}`);
        console.log(`   Config updated: model=${newConfig.model}, dimension=${newConfig.dimension}`);

        // Cleanup
        vectorRepo.close();
        db.close();
        process.exit(0);

    } catch (error) {
        const standardizedError = translateError(error, 'Rebuild index command');
        Logger.error('Rebuild index failed:', standardizedError);
        console.error(`❌ Rebuild failed [${standardizedError.code}]: ${standardizedError.message}`);
        process.exit(1);
    }
}

/**
 * Parse CLI arguments for rebuild-index command
 */
export function parseRebuildIndexArgs(args: string[]): RebuildIndexArgs {
    const path = args.find(arg => !arg.startsWith('--')) || process.cwd();
    const force = args.includes('--force');
    const verbose = args.includes('--verbose');

    return { path, force, verbose };
}