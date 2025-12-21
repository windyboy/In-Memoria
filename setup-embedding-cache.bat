@echo off
REM Setup script for In-Memoria embedding cache on Windows
REM This configures In-Memoria to use your existing Hugging Face cache

echo Setting up In-Memoria embedding configuration...

REM Set environment variables for current session
set HUGGINGFACE_HUB_CACHE=C:\Users\windy\.cache\huggingface\hub
set TRANSFORMERS_OFFLINE=true
set IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=true
set IN_MEMORIA_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
set IN_MEMORIA_EMBEDDING_DIMENSION=384

echo Environment variables set for current session:
echo   HUGGINGFACE_HUB_CACHE=%HUGGINGFACE_HUB_CACHE%
echo   TRANSFORMERS_OFFLINE=%TRANSFORMERS_OFFLINE%
echo   IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY=%IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY%
echo   IN_MEMORIA_EMBEDDING_MODEL=%IN_MEMORIA_EMBEDDING_MODEL%
echo   IN_MEMORIA_EMBEDDING_DIMENSION=%IN_MEMORIA_EMBEDDING_DIMENSION%

echo.
echo Starting In-Memoria MCP server...
npx in-memoria server

pause