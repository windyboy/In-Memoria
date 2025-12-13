// MCP Setup Verification Script for In-Memoria
// This script verifies that the MCP server is properly configured and functional
//
// Usage: node verify-mcp-setup.js

import { spawn } from "child_process";
import path from "path";
import fs from "fs";

console.log("🔍 In-Memoria MCP Setup Verification");
console.log("=====================================");

// Test results
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: [],
};

function test(name, fn) {
    results.total++;
    console.log(`\n🧪 Testing: ${name}`);
    try {
        const result = fn();
        if (result && typeof result.then === "function") {
            return result
                .then(() => {
                    console.log(`   ✅ PASSED`);
                    results.passed++;
                    results.tests.push({ name, status: "passed" });
                })
                .catch((error) => {
                    console.log(`   ❌ FAILED: ${error.message}`);
                    results.failed++;
                    results.tests.push({
                        name,
                        status: "failed",
                        error: error.message,
                    });
                });
        } else {
            console.log(`   ✅ PASSED`);
            results.passed++;
            results.tests.push({ name, status: "passed" });
        }
    } catch (error) {
        console.log(`   ❌ FAILED: ${error.message}`);
        results.failed++;
        results.tests.push({ name, status: "failed", error: error.message });
    }
}

// Test 1: Check if In-Memoria is installed
test("In-Memoria Installation", () => {
    const inMemoriaPath = path.join(process.cwd(), "dist", "index.js");
    if (!fs.existsSync(inMemoriaPath)) {
        throw new Error(
            'In-Memoria dist/index.js not found. Run "npm run build" first.',
        );
    }
    return true;
});

// Test 2: Check environment variables
test("Environment Configuration", () => {
    const required = ["IN_MEMORIA_VECTOR_BACKEND"];
    const recommended = ["QDRANT_URL", "QDRANT_COLLECTION"];

    console.log("   Environment variables:");
    required.forEach((key) => {
        const value = process.env[key];
        console.log(`     ${key}: ${value || "NOT SET"}`);
        if (!value) {
            console.log(`     ⚠️  Warning: ${key} not set`);
        }
    });

    recommended.forEach((key) => {
        const value = process.env[key];
        if (value) {
            console.log(`     ${key}: ${value}`);
        }
    });

    return true;
});

// Test 3: Test MCP server startup
async function testMCPServer() {
    return new Promise((resolve, reject) => {
        const inMemoriaPath = path.join(process.cwd(), "dist", "index.js");
        const server = spawn("node", [inMemoriaPath, "server"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, NODE_ENV: "test" },
        });

        let output = "";
        let errorOutput = "";
        let started = false;

        server.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            if (
                chunk.includes("MCP server started") ||
                chunk.includes("listening")
            ) {
                started = true;
            }
        });

        server.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        // Wait a bit for server to start
        setTimeout(() => {
            server.kill("SIGTERM");

            if (started) {
                console.log("   Server started successfully");
                resolve();
            } else {
                reject(
                    new Error(
                        `Server failed to start. Output: ${output}. Errors: ${errorOutput}`,
                    ),
                );
            }
        }, 3000);
    });
}
test("MCP Server Startup", testMCPServer);

// Test 4: Test tool discovery
async function testToolDiscovery() {
    return new Promise((resolve, reject) => {
        const inMemoriaPath = path.join(process.cwd(), "dist", "index.js");
        const server = spawn("node", [inMemoriaPath, "server"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, NODE_ENV: "test" },
        });

        let output = "";
        let toolsFound = false;

        server.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            if (
                chunk.includes("tools/call") ||
                chunk.includes("available tools")
            ) {
                toolsFound = true;
            }
        });

        // Send a tools/list request after a short delay
        setTimeout(() => {
            server.stdin.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/list",
                    params: {},
                }) + "\n",
            );
        }, 1000);

        setTimeout(() => {
            server.kill("SIGTERM");

            if (toolsFound || output.includes("tools/list")) {
                console.log("   Tool discovery working");
                resolve();
            } else {
                reject(
                    new Error("Tool discovery failed. Check server output."),
                );
            }
        }, 2000);
    });
}
test("Tool Discovery", testToolDiscovery);

// Test 5: Test Qdrant connectivity (if configured)
async function testQdrantConnectivity() {
    if (process.env.IN_MEMORIA_VECTOR_BACKEND !== "qdrant") {
        console.log("   Skipped: Qdrant not configured");
        return true;
    }

    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";

    try {
        const response = await fetch(`${qdrantUrl}/`);
        if (!response.ok) {
            throw new Error(`Qdrant not accessible: ${response.status}`);
        }
        const data = await response.json();
        console.log(`   Qdrant version: ${data.version}`);
        return true;
    } catch (error) {
        throw new Error(`Qdrant connection failed: ${error.message}`);
    }
}
test("Qdrant Connectivity", testQdrantConnectivity);

// Test 6: Test database initialization
test("Database Initialization", () => {
    const dbPath = path.join(process.cwd(), "in-memoria.db");

    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`   Database exists: ${(stats.size / 1024).toFixed(1)} KB`);
        return true;
    } else {
        console.log("   Database not found (will be created during learning)");
        return true;
    }
});

// Test 7: Test configuration loading
async function testConfiguration() {
    try {
        const { config } = await import("./dist/config/config.js");
        const fullConfig = config.getConfig();

        console.log("   Configuration loaded:");
        console.log(`     Vector backend: ${fullConfig.vectorBackend}`);
        console.log(`     Database: ${fullConfig.database.filename}`);

        if (fullConfig.vectorBackend === "qdrant") {
            console.log(
                `     Qdrant URL: ${fullConfig.qdrant?.url || "not set"}`,
            );
        }

        return true;
    } catch (error) {
        throw new Error(`Configuration loading failed: ${error.message}`);
    }
}
test("Configuration Loading", testConfiguration);

// Run all tests and report results
async function runAllTests() {
    // Wait for all async tests to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("\n" + "=".repeat(60));
    console.log("📊 VERIFICATION RESULTS");
    console.log("=".repeat(60));
    console.log(`Total Tests: ${results.total}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);

    if (results.failed > 0) {
        console.log("\n❌ FAILED TESTS:");
        results.tests
            .filter((t) => t.status === "failed")
            .forEach((test) => {
                console.log(`   - ${test.name}: ${test.error}`);
            });
    }

    console.log("\n" + "=".repeat(60));
    if (results.failed === 0) {
        console.log("🎉 ALL TESTS PASSED!");
        console.log("   In-Memoria MCP setup is working correctly");
        console.log("   You can now use In-Memoria with your MCP client");
    } else {
        console.log("⚠️ SOME TESTS FAILED");
        console.log("   Check the output above and fix any issues");
        console.log("   Run this script again after fixing problems");
        process.exit(1);
    }
    console.log("=".repeat(60));

    // Provide next steps
    console.log("\n🚀 NEXT STEPS:");
    if (results.passed > 0) {
        console.log(
            "1. If you haven't already, run: in-memoria learn /path/to/your/project",
        );
        console.log(
            "2. Configure your MCP client (Claude Desktop, VS Code, etc.)",
        );
        console.log("3. Start using In-Memoria tools in your AI assistant");
    }
    console.log("\n📚 For help, see: docs/MCP_SETUP.md");
}

console.log("\n⏳ Running verification tests...\n");

// Run the test suite
setTimeout(() => {
    runAllTests().catch((error) => {
        console.error("💥 Verification failed:", error);
        process.exit(1);
    });
}, 5000); // Wait for async tests to complete
