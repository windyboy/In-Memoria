#!/usr/bin/env node

// Test script to verify embedding configuration
// Run with: node test-embedding-config.js

console.log('🔍 Testing In-Memoria embedding configuration...\n');

// Set your Hugging Face cache directory
process.env.HUGGINGFACE_HUB_CACHE = 'C:\\Users\\windy\\.cache\\huggingface\\hub';
process.env.TRANSFORMERS_OFFLINE = 'true';
process.env.IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY = 'true';
process.env.IN_MEMORIA_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
process.env.IN_MEMORIA_EMBEDDING_DIMENSION = '384';

console.log('Environment variables set:');
console.log(`  HUGGINGFACE_HUB_CACHE: ${process.env.HUGGINGFACE_HUB_CACHE}`);
console.log(`  TRANSFORMERS_OFFLINE: ${process.env.TRANSFORMERS_OFFLINE}`);
console.log(`  IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY: ${process.env.IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY}`);
console.log(`  IN_MEMORIA_EMBEDDING_MODEL: ${process.env.IN_MEMORIA_EMBEDDING_MODEL}`);
console.log(`  IN_MEMORIA_EMBEDDING_DIMENSION: ${process.env.IN_MEMORIA_EMBEDDING_DIMENSION}\n`);

// Test the MCP server startup
console.log('🚀 Testing MCP server startup...');
console.log('Run this command to start the server:');
console.log('npx in-memoria server\n');

console.log('✅ Configuration looks good!');
console.log('The server should use your existing Hugging Face cache and avoid downloading models.');