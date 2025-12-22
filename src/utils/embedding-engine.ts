import { pipeline } from "@xenova/transformers";
import { Logger } from "./logger.js";
import { config } from "./config.js";

export class EmbeddingEngine {
    private embeddingPipeline: any = null;
    private initializationPromise: Promise<void> | null = null;

    private async ensureInitialized(): Promise<void> {
        if (this.embeddingPipeline) return;
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                const model = config.getEmbeddingModel();
                this.embeddingPipeline = await pipeline("feature-extraction", model);
            })();
        }

        await this.initializationPromise;
    }

    async embed(text: string): Promise<number[]> {
        try {
            await this.ensureInitialized();
            const result: any = await this.embeddingPipeline!(text, {
                pooling: "mean",
                normalize: true,
            });

            const vector = Array.from(result.data as Float32Array);
            const expected = config.getEmbeddingDimension();
            if (vector.length !== expected) {
                Logger.warn(
                    `Embedding dimension mismatch: expected ${expected}, got ${vector.length}. Results may be degraded.`,
                );
            }
            return vector;
        } catch (error) {
            Logger.warn("Failed to generate embedding:", error);
            return [];
        }
    }
}
