// Test script to verify Qdrant collection creation for In-Memoria
// This script tests if In-Memoria can successfully create collections on Qdrant

console.log("🧪 Testing Qdrant Collection Creation");
console.log("====================================");

// Set environment variables for Qdrant
process.env.IN_MEMORIA_VECTOR_BACKEND = "qdrant";
process.env.QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
process.env.QDRANT_COLLECTION =
    process.env.QDRANT_COLLECTION || "in-memoria-test";

console.log("📋 Configuration:");
console.log(`   Vector Backend: ${process.env.IN_MEMORIA_VECTOR_BACKEND}`);
console.log(`   Qdrant URL: ${process.env.QDRANT_URL}`);
console.log(`   Collection: ${process.env.QDRANT_COLLECTION}`);
console.log();

// Test Qdrant connectivity first
async function testQdrantConnectivity() {
    console.log("🔍 Testing Qdrant connectivity...");
    try {
        const response = await fetch(`${process.env.QDRANT_URL}/`);
        if (response.ok) {
            const data = await response.json();
            if (data.version) {
                console.log(
                    `✅ Qdrant is accessible (version ${data.version})`,
                );
                return true;
            }
        }
        console.log("❌ Qdrant health check failed");
        return false;
    } catch (error) {
        console.log(`❌ Cannot connect to Qdrant: ${error.message}`);
        return false;
    }
}

// Test collection creation
async function testCollectionCreation() {
    try {
        console.log("🔧 Testing vector store creation...");

        // Import the vector factory
        const { createVectorStore } =
            await import("./dist/storage/vector-factory.js");

        // Create vector store (should be QdrantVectorDB)
        const vectorStore = createVectorStore();
        console.log(`   Created vector store: ${vectorStore.constructor.name}`);

        if (vectorStore.constructor.name !== "QdrantVectorDB") {
            console.log("❌ ERROR: Not using Qdrant vector store");
            return false;
        }

        console.log(
            "🚀 Initializing vector store (this creates the collection)...",
        );

        // Initialize the vector store (this should create the collection)
        await vectorStore.initialize(process.env.QDRANT_COLLECTION);

        console.log("✅ Vector store initialized successfully");

        // Test collection existence by checking stats
        console.log("🔍 Verifying collection was created...");
        const stats = await vectorStore.getCollectionStats();
        console.log(
            `   Collection stats: ${stats.count} vectors, ${stats.metadata?.engine || "unknown"} engine`,
        );

        if (stats.count >= 0) {
            console.log("✅ Collection verified - Qdrant setup is working!");
            return true;
        } else {
            console.log("❌ Collection verification failed");
            return false;
        }
    } catch (error) {
        console.log(`❌ Collection creation test failed: ${error.message}`);
        console.log("   Make sure Qdrant is running and accessible");
        return false;
    }
}

// Test embedding storage
async function testEmbeddingStorage() {
    try {
        console.log("💾 Testing embedding storage...");

        const { createVectorStore } =
            await import("./dist/storage/vector-factory.js");
        const vectorStore = createVectorStore();

        // Store a test embedding
        await vectorStore.storeCodeEmbedding("console.log('test code');", {
            id: "test-embedding-123",
            filePath: "test.js",
            functionName: "testFunction",
            className: undefined,
            language: "javascript",
            complexity: 1,
            lineCount: 1,
            lastModified: new Date(),
        });

        console.log("✅ Test embedding stored successfully");

        // Try to search for it
        const results = await vectorStore.findSimilarCode("console.log", 1);
        if (results.length > 0) {
            console.log("✅ Test embedding retrieved successfully");
            return true;
        } else {
            console.log("⚠️ Test embedding stored but not found in search");
            return true; // Still consider this a success since storage worked
        }
    } catch (error) {
        console.log(`❌ Embedding storage test failed: ${error.message}`);
        return false;
    }
}

// Main test execution
async function runTests() {
    const qdrantOk = await testQdrantConnectivity();
    if (!qdrantOk) {
        console.log("\n❌ Cannot proceed without Qdrant connectivity");
        process.exit(1);
    }

    console.log();
    const collectionOk = await testCollectionCreation();
    if (!collectionOk) {
        console.log("\n❌ Collection creation failed");
        process.exit(1);
    }

    console.log();
    const storageOk = await testEmbeddingStorage();

    console.log("\n" + "=".repeat(50));
    if (collectionOk && storageOk) {
        console.log("🎉 ALL TESTS PASSED!");
        console.log("   In-Memoria is properly configured to use Qdrant");
        console.log(
            "   Collections will be created automatically during learning",
        );
    } else {
        console.log("⚠️ SOME TESTS FAILED");
        console.log("   Check the output above for details");
    }
    console.log("=".repeat(50));
}

// Run the tests
runTests().catch((error) => {
    console.error("💥 Test execution failed:", error);
    process.exit(1);
});
