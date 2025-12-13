// Test script to verify environment variable configuration for In-Memoria
// This script tests if the ConfigManager correctly reads IN_MEMORIA_VECTOR_BACKEND

console.log("🧪 Testing In-Memoria Environment Variable Configuration");
console.log("========================================================");

// Set environment variables for testing
process.env.IN_MEMORIA_VECTOR_BACKEND = "qdrant";
process.env.QDRANT_URL = "http://localhost:6333";
process.env.QDRANT_COLLECTION = "in-memoria-test";

console.log("📋 Environment variables set:");
console.log(
    `   IN_MEMORIA_VECTOR_BACKEND: ${process.env.IN_MEMORIA_VECTOR_BACKEND}`,
);
console.log(`   QDRANT_URL: ${process.env.QDRANT_URL}`);
console.log(`   QDRANT_COLLECTION: ${process.env.QDRANT_COLLECTION}`);
console.log();

// Import the config module (this will initialize ConfigManager)
try {
    const { config } = await import("./dist/config/config.js");

    console.log("🔧 ConfigManager loaded successfully");
    console.log("📊 Configuration values:");

    const fullConfig = config.getConfig();
    console.log(`   vectorBackend: ${fullConfig.vectorBackend}`);
    console.log(`   qdrant.url: ${fullConfig.qdrant?.url}`);
    console.log(`   qdrant.collection: ${fullConfig.qdrant?.collection}`);
    console.log();

    // Test the vector factory
    console.log("🔍 Testing vector factory...");
    const { createVectorStore } =
        await import("./dist/storage/vector-factory.js");

    const vectorStore = createVectorStore();
    console.log(
        `   Created vector store type: ${vectorStore.constructor.name}`,
    );

    if (vectorStore.constructor.name === "QdrantVectorDB") {
        console.log("✅ SUCCESS: Qdrant vector store created!");
        console.log("   In-Memoria will use Qdrant for vector operations");
    } else {
        console.log("❌ FAILURE: Surreal vector store created instead");
        console.log("   Environment variable not being read correctly");
    }
} catch (error) {
    console.error("❌ Error loading In-Memoria modules:", error.message);
    console.error("   Make sure In-Memoria is built (run: npm run build)");
}

console.log();
console.log("🎯 Test completed");
