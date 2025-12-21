# Setup script for In-Memoria embedding cache on Windows (PowerShell)
# This configures In-Memoria to use your existing Hugging Face cache

Write-Host "Setting up In-Memoria embedding configuration..." -ForegroundColor Green

# Set environment variables for current session
$env:HUGGINGFACE_HUB_CACHE = "C:\Users\windy\.cache\huggingface\hub"
$env:TRANSFORMERS_OFFLINE = "true"
$env:IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY = "true"
$env:IN_MEMORIA_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2"
$env:IN_MEMORIA_EMBEDDING_DIMENSION = "384"

Write-Host "Environment variables set for current session:" -ForegroundColor Yellow
Write-Host "  HUGGINGFACE_HUB_CACHE: $env:HUGGINGFACE_HUB_CACHE"
Write-Host "  TRANSFORMERS_OFFLINE: $env:TRANSFORMERS_OFFLINE"
Write-Host "  IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY: $env:IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY"
Write-Host "  IN_MEMORIA_EMBEDDING_MODEL: $env:IN_MEMORIA_EMBEDDING_MODEL"
Write-Host "  IN_MEMORIA_EMBEDDING_DIMENSION: $env:IN_MEMORIA_EMBEDDING_DIMENSION"

Write-Host ""
Write-Host "Starting In-Memoria MCP server..." -ForegroundColor Green
npx in-memoria server