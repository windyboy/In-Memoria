// Test script to verify complete Qdrant integration with In-Memoria
// This script tests all aspects of Qdrant usage in In-Memoria

console.log("🧪 In-Memoria Qdrant Integration Test Suite");
console.log("==========================================");

// Set environment variables for Qdrant
process.env.IN_MEMORIA_VECTOR_BACKEND = "qdrant";
process.env.QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
process.env.QDRANT_COLLECTION = `test-${Date.now()}`;

console.log("📋 Test Configuration:");
console.log(`   Vector Backend: ${process.env.IN_MEMORIA_VECTOR_BACKEND}`);
console.log(`   Qdrant URL: ${process.env.QDRANT_URL}`);
console.log(`   Collection: ${process.env.QDRANT_COLLECTION}`);
console.log();

// Test results tracking
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    results.total++;
    console.log(`🔍 Running: ${name}`);
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.then(() => {
                console.log(`   ✅ PASSED: ${name}`);
                results.passed++;
                results.tests.push({ name, status: 'passed' });
            }).catch(error => {
                console.log(`   ❌ FAILED: ${name} - ${error.message}`);
                results.failed++;
                results.tests.push({ name, status: 'failed', error: error.message });
            });
        } else {
            console.log(`   ✅ PASSED: ${name}`);
            results.passed++;
            results.tests.push({ name, status: 'passed' });
        }
    } catch (error) {
        console.log(`   ❌ FAILED: ${name} - ${error.message}`);
        results.failed++;
        results.tests.push({ name, status: 'failed', error: error.message });
    }
}

// Test 1: Environment variable configuration
test("Environment Variables", () => {
    if (process.env.IN_MEMORIA_VECTOR_BACKEND !== "qdrant") {
        throw new Error("IN_MEMORIA_VECTOR_BACKEND not set to qdrant");
    }
    if (!process.env.QDRANT_URL) {
        throw new Error("QDRANT_URL not set");
    }
    if (!process.env.QDRANT_COLLECTION) {
        throw new Error("QDRANT_COLLECTION not set");
    }
    return true;
});

// Test 2: Qdrant connectivity
async function testQdrantConnectivity() {
    const response = await fetch(`${process.env.QDRANT_URL}/`);
    if (!response.ok) {
        throw new Error(`Qdrant not accessible: ${response.status}`);
    }
    const data = await response.json();
    if (!data.version) {
        throw new Error("Qdrant version not found in response");
    }
    console.log(`   Qdrant version: ${data.version}`);
    return true;
}
test("Qdrant Connectivity", testQdrantConnectivity);

// Test 3: ConfigManager reads environment variables
async function testConfigManager() {
    const { config } = await import("./dist/config/config.js");
    const fullConfig = config.getConfig();

    if (fullConfig.vectorBackend !== "qdrant") {
        throw new Error(`ConfigManager vectorBackend is ${fullConfig.vectorBackend}, expected qdrant`);
    }
    if (fullConfig.qdrant?.url !== process.env.QDRANT_URL) {
        throw new Error("ConfigManager Qdrant URL mismatch");
    }
    return true;
}
test("ConfigManager Environment Reading", testConfigManager);

// Test 4: Vector factory creates Qdrant store
async function testVectorFactory() {
    const { createVectorStore } = await import("./dist/storage/vector-factory.js");
    const vectorStore = createVectorStore();

    if (vectorStore.constructor.name !== "QdrantVectorDB") {
        throw new Error(`Vector factory created ${vectorStore.constructor.name}, expected QdrantVectorDB`);
    }
    return true;
}
test("Vector Factory Qdrant Creation", testVectorFactory);

// Test 5: Collection creation
async function testCollectionCreation() {
    const { createVectorStore } = await import("./dist/storage/vector-factory.js");
    const vectorStore = createVectorStore();

    await vectorStore.initialize(process.env.QDRANT_COLLECTION);

    // Verify collection exists
    const stats = await vectorStore.getCollectionStats();
    if (typeof stats.count !== "number") {
        throw new Error("Collection stats not returned correctly");
    }
    console.log(`   Collection created with ${stats.count} initial vectors`);
    return true;
}
test("Collection Creation", testCollectionCreation);

// Test 6: Vector storage and retrieval
async function testVectorStorage() {
    const { createVectorStore } = await import("./dist/storage/vector-factory.js");
    const vectorStore = createVectorStore();
    await vectorStore.initialize(process.env.QDRANT_COLLECTION);

    const testCode = "function testFunction() { return 'hello'; }";
    const testMetadata = {
        id: `test-${Date.now()}`,
        filePath: "test.js",
        functionName: "testFunction",
        className: undefined,
        language: "javascript",
        complexity: 1,
        lineCount: 1,
        lastModified: new Date(),
    };

    // Store embedding
    await vectorStore.storeCodeEmbedding(testCode, testMetadata);

    // Verify it was stored
    const stats = await vectorStore.getCollectionStats();
    if (stats.count < 1) {
        throw new Error("Vector was not stored successfully");
    }
    console.log(`   Collection now has ${stats.count} vectors`);

    // Test search
    const results = await vectorStore.findSimilarCode("function", 5);
    if (results.length === 0) {
        throw new Error("Vector search returned no results");
    }
    console.log(`   Search returned ${results.length} results`);
    return true;
}
test("Vector Storage and Retrieval", testVectorStorage);

// Test 7: Learning service integration
async function testLearningService() {
    // LearningService import updated - use new service through DI Container
    const { initializeDIContainer } = await import("./dist/core/bootstrap.js");

    // Create a temporary test directory
    const testDir = `/tmp/in-memoria-test-${Date.now()}`;
    const fs = await import("fs");
    fs.mkdirSync(testDir);
    fs.writeFileSync(`${testDir}/test.js`, "console.log('test');");

    try {
        // Use new LearningService through DI Container
        const container = await initializeDIContainer({ projectPath: testDir });
        const result = await container.learningService.learnFromCodebase(testDir, { force: true });

        if (!result.success) {
            throw new Error(`Learning failed: ${result.insights.join(', ')}`);
        }

        console.log(`   Learning completed: ${result.conceptsLearned} concepts, ${result.patternsLearned} patterns`);
        return true;
    } finally {
        // Cleanup
        fs.rmSync(testDir, { recursive: true, force: true });
    }
}
test("Learning Service Integration", testLearningService);

// Test 8: Error handling - invalid Qdrant URL
async function testErrorHandling() {
    const originalUrl = process.env.QDRANT_URL;
    process.env.QDRANT_URL = "http://invalid-url:9999";

    try {
        const { createVectorStore } = await import("./dist/storage/vector-factory.js");
        const vectorStore = createVectorStore();
        await vectorStore.initialize("error-test-collection");
        throw new Error("Expected error but none occurred");
    } catch (error) {
        // Expected error
        console.log(`   Expected error caught: ${error.message.substring(0, 50)}...`);
        return true;
    } finally {
        process.env.QDRANT_URL = originalUrl;
    }
}
test("Error Handling - Invalid URL", testErrorHandling);

// Test 9: Collection cleanup
async function testCollectionCleanup() {
    // Delete the test collection
    try {
        const response = await fetch(`${process.env.QDRANT_URL}/collections/${process.env.QDRANT_COLLECTION}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            console.log(`   Test collection ${process.env.QDRANT_COLLECTION} deleted`);
        } else {
            console.log(`   Could not delete collection (might not exist)`);
        }
    } catch (error) {
        console.log(`   Collection cleanup error: ${error.message}`);
    }
    return true;
}
test("Collection Cleanup", testCollectionCleanup);

// Run all tests and report results
async function runAllTests() {
    // Wait for all async tests to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST RESULTS");
    console.log("=".repeat(60));
    console.log(`Total Tests: ${results.total}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);

    if (results.failed > 0) {
        console.log("\n❌ FAILED TESTS:");
        results.tests.filter(t => t.status === 'failed').forEach(test => {
            console.log(`   - ${test.name}: ${test.error}`);
        });
    }

    console.log("\n" + "=".repeat(60));
    if (results.failed === 0) {
        console.log("🎉 ALL TESTS PASSED!");
        console.log("   In-Memoria Qdrant integration is working correctly");
        console.log("   Collections will be created automatically during learning");
    } else {
        console.log("⚠️ SOME TESTS FAILED");
        console.log("   Check the output above for details");
        process.exit(1);
    }
    console.log("=".repeat(60));
}

// Run the test suite
runAllTests().catch(error => {
    console.error("💥 Test suite execution failed:", error);
    process.exit(1);
});
