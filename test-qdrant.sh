In-Memoria/test-qdrant.sh
#!/bin/bash

# Test script to verify Qdrant configuration for In-Memoria
# This script tests if In-Memoria can connect to Qdrant and create collections

set -e

echo "🧪 Testing In-Memoria Qdrant Configuration"
echo "=========================================="

# Set environment variables for Qdrant
export IN_MEMORIA_VECTOR_BACKEND=qdrant
export QDRANT_URL=${QDRANT_URL:-http://localhost:6333}
export QDRANT_COLLECTION=${QDRANT_COLLECTION:-in-memoria-test}

echo "📋 Configuration:"
echo "   Vector Backend: $IN_MEMORIA_VECTOR_BACKEND"
echo "   Qdrant URL: $QDRANT_URL"
echo "   Collection: $QDRANT_COLLECTION"
echo ""

# Check if Qdrant is running
echo "🔍 Checking Qdrant connectivity..."
if curl -s "$QDRANT_URL/health" > /dev/null 2>&1; then
    echo "✅ Qdrant is running at $QDRANT_URL"
else
    echo "❌ Qdrant is not accessible at $QDRANT_URL"
    echo "   Make sure Qdrant is running and the URL is correct"
    exit 1
fi

# Check if In-Memoria CLI is available
if ! command -v in-memoria &> /dev/null; then
    echo "❌ In-Memoria CLI not found in PATH"
    echo "   Make sure In-Memoria is installed and available"
    exit 1
fi

echo ""
echo "🚀 Testing vector store initialization..."

# Create a temporary test directory
TEST_DIR=$(mktemp -d)
echo "📁 Created test directory: $TEST_DIR"

# Create a simple test file
echo 'console.log("Hello from test file");' > "$TEST_DIR/test.js"

# Try to run a simple analysis that would initialize the vector store
echo "🔧 Running In-Memoria analysis to test Qdrant connection..."
if env IN_MEMORIA_VECTOR_BACKEND=qdrant QDRANT_URL="$QDRANT_URL" QDRANT_COLLECTION="$QDRANT_COLLECTION" in-memoria analyze "$TEST_DIR" --verbose 2>&1 | tee /tmp/in-memoria-test.log; then
    echo "✅ In-Memoria analysis completed successfully"
else
    echo "❌ In-Memoria analysis failed"
    echo "   Check the logs above for details"
    exit 1
fi

# Check if Qdrant collection was created
echo ""
echo "🔍 Checking if Qdrant collection was created..."
if curl -s "$QDRANT_URL/collections/$QDRANT_COLLECTION" | grep -q "status.*ok"; then
    echo "✅ Qdrant collection '$QDRANT_COLLECTION' exists"
else
    echo "❌ Qdrant collection '$QDRANT_COLLECTION' was not found"
    echo "   This might indicate the vector store initialization failed"
fi

# Check logs for Qdrant-related messages
echo ""
echo "📊 Checking logs for Qdrant activity..."
if grep -q "Qdrant\|qdrant" /tmp/in-memoria-test.log; then
    echo "✅ Found Qdrant-related log messages"
    grep -i "qdrant\|collection\|vector" /tmp/in-memoria-test.log | head -10
else
    echo "⚠️  No Qdrant-related messages found in logs"
    echo "   This might indicate Surreal is still being used"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEST_DIR"
rm -f /tmp/in-memoria-test.log

echo ""
echo "🎉 Test completed!"
echo "If all checks passed, In-Memoria is properly configured to use Qdrant."
echo ""
echo "💡 Next steps:"
echo "   - Run 'in-memoria learn /path/to/your/project' to create collections"
echo "   - Monitor Qdrant dashboard to see collections being created"
