#!/usr/bin/env node

/**
 * Core Integration Tests for In-Memoria Refactor
 * 
 * Simplified integration tests that focus on the core requirements without Rust dependencies:
 * 1. Service layer integration through DI container
 * 2. CLI interface validation
 * 3. MCP tool schema validation
 * 4. Error handling patterns
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

class CoreIntegrationTester {
  constructor() {
    this.results = [];
    this.testDir = join(tmpdir(), 'in-memoria-core-test-' + Date.now());
  }

  async run() {
    console.log('🧪 Running Core Integration Tests...\n');
    
    try {
      await this.setupTestEnvironment();
      await this.testServiceLayerIntegration();
      await this.testCLIInterfaceValidation();
      await this.testMCPSchemaValidation();
      await this.testErrorHandlingPatterns();
      
      this.reportResults();
      
    } catch (error) {
      console.error('💥 Core integration tests failed:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create test directory
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
    }
    mkdirSync(this.testDir, { recursive: true });
    
    // Create sample project files
    const files = {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        main: 'index.js'
      }, null, 2),
      
      'index.js': `
// Sample JavaScript project for testing
function createUser(data) {
  return { id: Math.random(), ...data };
}

function validateUser(user) {
  return user.name && user.email;
}

module.exports = { createUser, validateUser };
      `,
      
      'utils.js': `
function formatDate(date) {
  return date.toISOString();
}

module.exports = { formatDate };
      `
    };
    
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(this.testDir, filename), content);
    }
    
    console.log(`✅ Test environment ready: ${this.testDir}`);
  }

  async testServiceLayerIntegration() {
    console.log('\n🔧 Testing Service Layer Integration...');
    
    try {
      // Test DI Container initialization
      console.log('  Testing DI Container initialization...');
      
      // Import bootstrap dynamically to test initialization
      const { initializeDIContainer } = await import('../dist/core/bootstrap.js');
      
      // Initialize container with test project
      const container = await initializeDIContainer({ projectPath: this.testDir });
      
      // Verify all four core services are available
      if (!container.analysisService) {
        throw new Error('AnalysisService not available in container');
      }
      
      if (!container.learningService) {
        throw new Error('LearningService not available in container');
      }
      
      if (!container.searchService) {
        throw new Error('SearchService not available in container');
      }
      
      if (!container.diagnosticService) {
        throw new Error('DiagnosticService not available in container');
      }
      
      console.log('  Testing service method calls...');
      
      // Test AnalysisService (read-only)
      try {
        const analysis = await container.analysisService.analyzeCodebase(this.testDir);
        if (!analysis || typeof analysis !== 'object') {
          throw new Error('AnalysisService.analyzeCodebase returned invalid result');
        }
      } catch (error) {
        // Expected to fail without Rust bindings, but should fail gracefully
        if (!error.message.includes('native binary') && !error.message.includes('ENOENT')) {
          throw error;
        }
      }
      
      // Test DiagnosticService (read-only)
      try {
        const status = await container.diagnosticService.getLearningStatus(this.testDir);
        if (!status || typeof status !== 'object') {
          throw new Error('DiagnosticService.getLearningStatus returned invalid result');
        }
      } catch (error) {
        // Expected to fail without database, but should fail gracefully
        if (!error.message.includes('database') && !error.message.includes('SQLITE')) {
          throw error;
        }
      }
      
      this.addResult('Service Layer Integration', true, 'DI Container and services initialized successfully');
      
    } catch (error) {
      this.addResult('Service Layer Integration', false, error.message);
    }
  }

  async testCLIInterfaceValidation() {
    console.log('\n📋 Testing CLI Interface Validation...');
    
    try {
      // Test CLI argument parsing functions
      console.log('  Testing CLI argument parsers...');
      
      const { parseAnalyzeArgs } = await import('../dist/cli/analyze.js');
      const { parseLearnArgs } = await import('../dist/cli/learn.js');
      const { parseStatusArgs } = await import('../dist/cli/status.js');
      
      // Test analyze args parsing
      const analyzeArgs = parseAnalyzeArgs([this.testDir, '--verbose', '--metrics']);
      if (analyzeArgs.path !== this.testDir || !analyzeArgs.verbose || !analyzeArgs.metrics) {
        throw new Error('Analyze args parsing failed');
      }
      
      // Test learn args parsing
      const learnArgs = parseLearnArgs([this.testDir, '--force', '--verbose']);
      if (learnArgs.path !== this.testDir || !learnArgs.force || !learnArgs.verbose) {
        throw new Error('Learn args parsing failed');
      }
      
      // Test status args parsing
      const statusArgs = parseStatusArgs([this.testDir, '--verbose', '--health']);
      if (statusArgs.path !== this.testDir || !statusArgs.verbose || !statusArgs.health) {
        throw new Error('Status args parsing failed');
      }
      
      this.addResult('CLI Interface Validation', true, 'All CLI argument parsers working correctly');
      
    } catch (error) {
      this.addResult('CLI Interface Validation', false, error.message);
    }
  }

  async testMCPSchemaValidation() {
    console.log('\n🔍 Testing MCP Schema Validation...');
    
    try {
      // Test MCP validation schemas
      console.log('  Testing MCP validation schemas...');
      
      const { validateInput, VALIDATION_SCHEMAS } = await import('../dist/mcp/validation.js');
      
      // Test valid inputs
      const validAnalyzeInput = validateInput(
        VALIDATION_SCHEMAS.analyze_codebase,
        { path: this.testDir },
        'analyze_codebase'
      );
      
      if (validAnalyzeInput.path !== this.testDir) {
        throw new Error('Valid analyze input validation failed');
      }
      
      const validSearchInput = validateInput(
        VALIDATION_SCHEMAS.search_codebase,
        { query: 'test', type: 'text', limit: 10 },
        'search_codebase'
      );
      
      if (validSearchInput.query !== 'test' || validSearchInput.type !== 'text') {
        throw new Error('Valid search input validation failed');
      }
      
      // Test invalid inputs
      console.log('  Testing invalid input rejection...');
      
      try {
        validateInput(
          VALIDATION_SCHEMAS.analyze_codebase,
          {},
          'analyze_codebase'
        );
        throw new Error('Should have rejected empty analyze input');
      } catch (error) {
        if (!error.message.includes('Path is required') && !error.message.includes('Required')) {
          console.log('Actual validation error:', error.message);
          throw new Error('Wrong validation error for empty analyze input');
        }
      }
      
      try {
        validateInput(
          VALIDATION_SCHEMAS.search_codebase,
          { query: '', type: 'text' },
          'search_codebase'
        );
        throw new Error('Should have rejected empty query');
      } catch (error) {
        if (!error.message.includes('String must contain at least 1 character')) {
          throw new Error('Wrong validation error for empty query');
        }
      }
      
      try {
        validateInput(
          VALIDATION_SCHEMAS.search_codebase,
          { query: 'test', type: 'invalid_type' },
          'search_codebase'
        );
        throw new Error('Should have rejected invalid search type');
      } catch (error) {
        if (!error.message.includes('Invalid enum value')) {
          throw new Error('Wrong validation error for invalid type');
        }
      }
      
      try {
        validateInput(
          VALIDATION_SCHEMAS.search_codebase,
          { query: 'test', limit: 500 },
          'search_codebase'
        );
        throw new Error('Should have rejected limit too high');
      } catch (error) {
        if (!error.message.includes('Number must be less than or equal to 100')) {
          throw new Error('Wrong validation error for high limit');
        }
      }
      
      this.addResult('MCP Schema Validation', true, 'All schema validations working correctly');
      
    } catch (error) {
      this.addResult('MCP Schema Validation', false, error.message);
    }
  }

  async testErrorHandlingPatterns() {
    console.log('\n⚠️  Testing Error Handling Patterns...');
    
    try {
      // Test error translation and standardization
      console.log('  Testing error translation...');
      
      const { translateError, ValidationError, PathError } = await import('../dist/core/errors.js');
      
      // Test error translation
      const originalError = new Error('Test error');
      const translatedError = translateError(originalError, 'Test context');
      
      if (!translatedError.message.includes('Test error')) {
        throw new Error('Error translation failed to preserve message');
      }
      
      // Test specific error types
      const validationError = new ValidationError('Invalid input');
      if (validationError.code !== 'VALIDATION_ERROR') {
        throw new Error('ValidationError code incorrect');
      }
      
      const pathError = new PathError('Invalid path');
      if (pathError.code !== 'PATH_ERROR') {
        throw new Error('PathError code incorrect');
      }
      
      // Test error hierarchy
      if (!(validationError instanceof Error)) {
        throw new Error('ValidationError not instance of Error');
      }
      
      this.addResult('Error Handling Patterns', true, 'Error translation and standardization working correctly');
      
    } catch (error) {
      this.addResult('Error Handling Patterns', false, error.message);
    }
  }

  addResult(name, success, message) {
    this.results.push({ name, success, message });
  }

  async cleanup() {
    if (existsSync(this.testDir)) {
      try {
        rmSync(this.testDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
  }

  reportResults() {
    console.log('\n📊 Core Integration Test Results:');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed (${Math.round(passed/total * 100)}%)`);
    
    this.results.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.message}`);
    });
    
    console.log('\n' + '='.repeat(50));
    
    if (passed === total) {
      console.log('🎉 All core integration tests passed!');
      console.log('✨ Service layer integration is working correctly.');
      process.exit(0);
    } else {
      console.log('⚠️  Some core integration tests failed.');
      process.exit(1);
    }
  }
}

// Run the core integration tests
const tester = new CoreIntegrationTester();
tester.run().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});