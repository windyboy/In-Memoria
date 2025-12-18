#!/usr/bin/env node

/**
 * Minimal Integration Tests for In-Memoria Refactor
 * 
 * Tests core integration requirements without Rust dependencies:
 * 1. MCP tool schema validation (pure JavaScript)
 * 2. CLI interface structure validation
 * 3. Error handling patterns
 * 4. Service interface contracts
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

class MinimalIntegrationTester {
  constructor() {
    this.results = [];
  }

  async run() {
    console.log('🧪 Running Minimal Integration Tests...\n');
    
    try {
      await this.testMCPSchemaValidation();
      await this.testCLIInterfaceStructure();
      await this.testErrorHandlingPatterns();
      await this.testServiceInterfaceContracts();
      
      this.reportResults();
      
    } catch (error) {
      console.error('💥 Minimal integration tests failed:', error);
      process.exit(1);
    }
  }

  async testMCPSchemaValidation() {
    console.log('🔍 Testing MCP Schema Validation...');
    
    try {
      const { validateInput, VALIDATION_SCHEMAS } = await import('../dist/mcp/validation.js');
      
      // Test 1: Valid analyze_codebase input
      console.log('  Testing valid analyze_codebase input...');
      const validAnalyze = validateInput(
        VALIDATION_SCHEMAS.analyze_codebase,
        { path: '/test/path' },
        'analyze_codebase'
      );
      
      if (validAnalyze.path !== '/test/path') {
        throw new Error('Valid analyze input validation failed');
      }
      
      // Test 2: Valid search_codebase input with defaults
      console.log('  Testing valid search_codebase input...');
      const validSearch = validateInput(
        VALIDATION_SCHEMAS.search_codebase,
        { query: 'test function' },
        'search_codebase'
      );
      
      if (validSearch.query !== 'test function' || validSearch.type !== 'text' || validSearch.limit !== 20) {
        throw new Error('Valid search input validation failed - defaults not applied');
      }
      
      // Test 3: Valid search with explicit parameters
      const validSearchExplicit = validateInput(
        VALIDATION_SCHEMAS.search_codebase,
        { query: 'test', type: 'semantic', limit: 50 },
        'search_codebase'
      );
      
      if (validSearchExplicit.type !== 'semantic' || validSearchExplicit.limit !== 50) {
        throw new Error('Valid search input validation failed - explicit params');
      }
      
      // Test 4: Invalid inputs should be rejected
      console.log('  Testing invalid input rejection...');
      
      // Empty path should fail
      try {
        validateInput(VALIDATION_SCHEMAS.analyze_codebase, {}, 'analyze_codebase');
        throw new Error('Should have rejected empty analyze input');
      } catch (error) {
        if (!error.message.includes('required') && !error.message.includes('Required')) {
          throw new Error(`Wrong validation error: ${error.message}`);
        }
      }
      
      // Empty query should fail
      try {
        validateInput(VALIDATION_SCHEMAS.search_codebase, { query: '' }, 'search_codebase');
        throw new Error('Should have rejected empty query');
      } catch (error) {
        if (!error.message.includes('1 character') && !error.message.includes('required')) {
          throw new Error(`Wrong validation error for empty query: ${error.message}`);
        }
      }
      
      // Invalid enum should fail
      try {
        validateInput(VALIDATION_SCHEMAS.search_codebase, { query: 'test', type: 'invalid' }, 'search_codebase');
        throw new Error('Should have rejected invalid type');
      } catch (error) {
        if (!error.message.includes('enum') && !error.message.includes('Invalid')) {
          throw new Error(`Wrong validation error for invalid enum: ${error.message}`);
        }
      }
      
      // Limit too high should fail
      try {
        validateInput(VALIDATION_SCHEMAS.search_codebase, { query: 'test', limit: 500 }, 'search_codebase');
        throw new Error('Should have rejected high limit');
      } catch (error) {
        if (!error.message.includes('100') && !error.message.includes('maximum')) {
          throw new Error(`Wrong validation error for high limit: ${error.message}`);
        }
      }
      
      this.addResult('MCP Schema Validation', true, 'All schema validations working correctly');
      
    } catch (error) {
      this.addResult('MCP Schema Validation', false, error.message);
    }
  }

  async testCLIInterfaceStructure() {
    console.log('\n📋 Testing CLI Interface Structure...');
    
    try {
      // Test CLI argument parsing functions exist and work
      console.log('  Testing CLI argument parsers...');
      
      const { parseAnalyzeArgs } = await import('../dist/cli/analyze.js');
      const { parseLearnArgs } = await import('../dist/cli/learn.js');
      const { parseStatusArgs } = await import('../dist/cli/status.js');
      
      // Test analyze args parsing
      const analyzeArgs = parseAnalyzeArgs(['/test/path', '--verbose', '--metrics', '--concepts']);
      if (analyzeArgs.path !== '/test/path' || !analyzeArgs.verbose || !analyzeArgs.metrics || !analyzeArgs.concepts) {
        throw new Error('Analyze args parsing failed');
      }
      
      // Test learn args parsing
      const learnArgs = parseLearnArgs(['/test/path', '--force', '--verbose']);
      if (learnArgs.path !== '/test/path' || !learnArgs.force || !learnArgs.verbose) {
        throw new Error('Learn args parsing failed');
      }
      
      // Test status args parsing
      const statusArgs = parseStatusArgs(['/test/path', '--verbose', '--health', '--system', '--intelligence']);
      if (statusArgs.path !== '/test/path' || !statusArgs.verbose || !statusArgs.health || !statusArgs.system || !statusArgs.intelligence) {
        throw new Error('Status args parsing failed');
      }
      
      // Test default path handling
      const defaultArgs = parseAnalyzeArgs(['--verbose']);
      if (!defaultArgs.path || defaultArgs.path.length === 0) {
        throw new Error('Default path handling failed');
      }
      
      this.addResult('CLI Interface Structure', true, 'All CLI argument parsers working correctly');
      
    } catch (error) {
      this.addResult('CLI Interface Structure', false, error.message);
    }
  }

  async testErrorHandlingPatterns() {
    console.log('\n⚠️  Testing Error Handling Patterns...');
    
    try {
      console.log('  Testing error classes and translation...');
      
      const { 
        translateError, 
        ValidationError, 
        PathError, 
        LearningError, 
        StorageError, 
        SearchError 
      } = await import('../dist/core/errors.js');
      
      // Test error class hierarchy
      const validationError = new ValidationError('Invalid input data');
      if (validationError.code !== 'VALIDATION_ERROR' || validationError.category !== 'validation') {
        throw new Error('ValidationError properties incorrect');
      }
      
      const pathError = new PathError('Path not found');
      if (pathError.code !== 'PATH_ERROR' || pathError.category !== 'path') {
        throw new Error('PathError properties incorrect');
      }
      
      const learningError = new LearningError('Learning failed');
      if (learningError.code !== 'LEARNING_ERROR' || learningError.category !== 'learning') {
        throw new Error('LearningError properties incorrect');
      }
      
      const storageError = new StorageError('Database error');
      if (storageError.code !== 'STORAGE_ERROR' || storageError.category !== 'storage') {
        throw new Error('StorageError properties incorrect');
      }
      
      const searchError = new SearchError('Search failed');
      if (searchError.code !== 'SEARCH_ERROR' || searchError.category !== 'search') {
        throw new Error('SearchError properties incorrect');
      }
      
      // Test error inheritance
      if (!(validationError instanceof Error)) {
        throw new Error('ValidationError not instance of Error');
      }
      
      // Test error translation
      const originalError = new Error('Original error message');
      const translatedError = translateError(originalError, 'Test context');
      
      if (!translatedError.message.includes('Original error message')) {
        throw new Error('Error translation failed to preserve message');
      }
      
      // Test error translation with cause
      const errorWithCause = new ValidationError('Validation failed', originalError);
      if (errorWithCause.cause !== originalError) {
        throw new Error('Error cause not preserved');
      }
      
      this.addResult('Error Handling Patterns', true, 'Error classes and translation working correctly');
      
    } catch (error) {
      this.addResult('Error Handling Patterns', false, error.message);
    }
  }

  async testServiceInterfaceContracts() {
    console.log('\n🔧 Testing Service Interface Contracts...');
    
    try {
      console.log('  Testing service interface definitions...');
      
      // Test that service classes exist and have expected methods
      const { AnalysisServiceImpl } = await import('../dist/core/services/AnalysisService.js');
      const { LearningServiceImpl } = await import('../dist/core/services/LearningService.js');
      const { SearchServiceImpl } = await import('../dist/core/services/SearchService.js');
      const { DiagnosticServiceImpl } = await import('../dist/core/services/DiagnosticService.js');
      
      // Check AnalysisService interface
      const analysisServiceMethods = ['analyzeCodebase', 'getLanguageMetrics', 'getComplexityMetrics', 'extractConcepts'];
      for (const method of analysisServiceMethods) {
        if (typeof AnalysisServiceImpl.prototype[method] !== 'function') {
          throw new Error(`AnalysisService missing method: ${method}`);
        }
      }
      
      // Check LearningService interface
      const learningServiceMethods = ['learnFromCodebase', 'updateProjectMetadata', 'storeSemanticConcepts', 'storeDeveloperPatterns'];
      for (const method of learningServiceMethods) {
        if (typeof LearningServiceImpl.prototype[method] !== 'function') {
          throw new Error(`LearningService missing method: ${method}`);
        }
      }
      
      // Check SearchService interface
      const searchServiceMethods = ['searchSemantic', 'searchPatterns', 'searchText'];
      for (const method of searchServiceMethods) {
        if (typeof SearchServiceImpl.prototype[method] !== 'function') {
          throw new Error(`SearchService missing method: ${method}`);
        }
      }
      
      // Check DiagnosticService interface
      const diagnosticServiceMethods = ['getLearningStatus', 'getSystemMetrics', 'getIntelligenceMetrics', 'getHealthStatus'];
      for (const method of diagnosticServiceMethods) {
        if (typeof DiagnosticServiceImpl.prototype[method] !== 'function') {
          throw new Error(`DiagnosticService missing method: ${method}`);
        }
      }
      
      // Test DI Container interface
      const { Container } = await import('../dist/core/container/container.js');
      
      // Verify container interface exists
      if (typeof Container !== 'function') {
        throw new Error('Container class not found');
      }
      
      this.addResult('Service Interface Contracts', true, 'All service interfaces have required methods');
      
    } catch (error) {
      this.addResult('Service Interface Contracts', false, error.message);
    }
  }

  addResult(name, success, message) {
    this.results.push({ name, success, message });
  }

  reportResults() {
    console.log('\n📊 Minimal Integration Test Results:');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed (${Math.round(passed/total * 100)}% success rate)`);
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.message}`);
    });
    
    // Test coverage summary
    console.log('\n📊 Integration Test Coverage:');
    console.log('  ✅ MCP Tool Schema Validation - Validates all tool input schemas');
    console.log('  ✅ CLI Interface Structure - Validates argument parsing and defaults');
    console.log('  ✅ Error Handling Patterns - Validates standardized error hierarchy');
    console.log('  ✅ Service Interface Contracts - Validates service method signatures');
    
    console.log('\n' + '='.repeat(60));
    
    if (passed === total) {
      console.log('🎉 All minimal integration tests passed!');
      console.log('✨ Core integration requirements are satisfied.');
      console.log('📝 Note: Full Learn->Search cycle testing requires Rust binaries.');
      process.exit(0);
    } else {
      console.log('⚠️  Some integration tests failed. Review failures above.');
      process.exit(1);
    }
  }
}

// Run the minimal integration tests
const tester = new MinimalIntegrationTester();
tester.run().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});