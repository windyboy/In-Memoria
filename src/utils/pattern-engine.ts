import { PatternLearner } from "./rust-bindings.js";
import { createRustAnalyzerCircuitBreaker } from "../utils/circuit-breaker.js";

export interface PatternExtractionResult {
    type: string;
    description: string;
    frequency: number;
}

export class PatternEngine {
    private rustLearner: InstanceType<typeof PatternLearner>;

    constructor() {
        this.rustLearner = new PatternLearner();
    }

    async extractPatterns(path: string): Promise<PatternExtractionResult[]> {
        try {
            const circuitBreaker = createRustAnalyzerCircuitBreaker();
            const patterns = await circuitBreaker.execute(
                async () => this.rustLearner.extractPatterns(path),
                async () => [],
            );

            return patterns.map((pattern: any) => ({
                type: pattern.patternType,
                description: pattern.description,
                frequency: pattern.frequency ?? 1,
            }));
        } catch (error) {
            console.error("Pattern extraction failed:", error);
            return [];
        }
    }
}
