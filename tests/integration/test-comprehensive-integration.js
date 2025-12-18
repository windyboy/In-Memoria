#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Comprehensive Integration Tests for In-Memoria Refactor
 * 
 * This test suite implements:
 * 1. Full "Learn -> Search" cycle test on sample repository
 * 2. CLI snapshot tests to verify output format consistency
 * 3. MCP tool schema validation tests
 * 4. Error handling across all interfaces
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

class ComprehensiveIntegrationTester {
  constructor() {
    this.testResults = [];
    this.testProjectPath = join(tmpdir(), 'in-memoria-integration-test');
    this.serverProcess = null;
    this.cliSnapshots = new Map();
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive Integration Tests...\n');
    
    try {
      // Setup test environment
      await this.setupTestProject();
      
      // Test 1: Full Learn -> Search Cycle
      await this.testLearnSearchCycle();
      
      // Test 2: CLI Snapshot Tests
      await this.testCLISnapshots();
      
      // Test 3: MCP Tool Schema Validation
      await this.testMCPSchemaValidation();
      
      // Test 4: Error Handling Across Interfaces
      await this.testErrorHandling();
      
      // Test 5: Service Layer Integration
      await this.testServiceLayerIntegration();
      
      // Cleanup
      await this.cleanup();
      
      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error('💥 Integration test suite failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  async setupTestProject() {
    console.log('🔧 Setting up test project...');
    
    // Create test project directory
    if (existsSync(this.testProjectPath)) {
      rmSync(this.testProjectPath, { recursive: true, force: true });
    }
    mkdirSync(this.testProjectPath, { recursive: true });
    
    // Create sample code files for testing
    const sampleFiles = {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        main: 'index.js',
        dependencies: {
          'express': '^4.18.0'
        }
      }, null, 2),
      
      'index.js': `
const express = require('express');
const app = express();

// User management functions
function createUser(userData) {
  return {
    id: generateId(),
    ...userData,
    createdAt: new Date()
  };
}

function validateUser(user) {
  if (!user.email || !user.name) {
    throw new Error('Invalid user data');
  }
  return true;
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Express routes
app.get('/users', (req, res) => {
  res.json({ users: [] });
});

app.post('/users', (req, res) => {
  try {
    const user = createUser(req.body);
    validateUser(user);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
      `,
      
      'utils/helpers.js': `
// Utility functions
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function sanitizeInput(input) {
  return input.trim().toLowerCase();
}

module.exports = {
  formatDate,
  sanitizeInput
};
      `,
      
      'README.md': `
# Test Project

This is a sample project for integration testing.

## Features
- User management
- Express API
- Utility functions
      `
    };
    
    // Write sample files
    for (const [filename, content] of Object.entries(sampleFiles)) {
      const filePath = join(this.testProjectPath, filename);
      const dir = join(filePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, content);
    }
    
    console.log(`✅ Test project created at: ${this.testProjectPath}`);
  }

  async testLearnSearchCycle() {
    console.log('\n📚 Testing Full Learn -> Search Cycle...');
    
    try {
      // Step 1: Learn from codebase using CLI
      console.log('  Step 1: Learning from codebase...');
      const learnResult = await this.runCLICommand('learn', [
        this.testProjectPath,
        '--verbose'
      ]);
      
      if (!learnResult.success) {
        throw new Error(`Learn command failed: ${learnResult.error}`);
      }
      
      // Verify learning output contains expected elements
      const learnOutput = learnResult.output;
      const hasConceptsLearned = learnOutput.includes('Concepts:') || learnOutput.includes('concepts');
      const hasPatternsLearned = learnOutput.includes('Patterns:') || learnOutput.includes('patterns');
      
      if (!hasConceptsLearned || !hasPatternsLearned) {
        throw new Error('Learning output missing expected metrics');
      }
      
      // Step 2: Search using MCP tools
      console.log('  Step 2: Searching learned data via MCP...');
      
      // Start MCP server
      await this.startMCPServer();
      
      // Test semantic search
      const semanticSearchResult = await this.callMCPTool('search_codebase', {
        query: 'user management',
        type: 'semantic',
        limit: 5
      });
      
      // Test text search
      const textSearchResult = await this.callMCPTool('search_codebase', {
        query: 'function',
        type: 'text',
        limit: 10
      });
      
      // Test pattern recommendations
      const patternResult = await this.callMCPTool('get_pattern_recommendations', {
        problemDescription: 'Need to validate user input',
        currentFile: join(this.testProjectPath, 'index.js')
      });
      
      // Step 3: Verify search results contain learned data
      console.log('  Step 3: Verifying search results...');
      
      // Verify semantic search found relevant results
      if (!semanticSearchResult || !Array.isArray(semanticSearchResult)) {
        throw new Error('Semantic search did not return valid results');
      }
      
      // Verify text search found code elements
      if (!textSearchResult || !Array.isArray(textSearchResult)) {
        throw new Error('Text search did not return valid results');
      }
      
      // Verify pattern recommendations were generated
      if (!patternResult || !patternResult.recommendations) {
        throw new Error('Pattern recommendations not generated');
      }
      
      // Step 4: Test project blueprint
      const blueprintResult = await this.callMCPTool('get_project_blueprint', {
        path: this.testProjectPath,
        includeFeatureMap: true
      });
      
      if (!blueprintResult || !blueprintResult.structure) {
        throw new Error('Project blueprint not generated');
      }
      
      await this.stopMCPServer();
      
      this.addTestResult('Learn -> Search Cycle', true, 'Full cycle completed successfully');
      
    } catch (error) {
      this.addTestResult('Learn -> Search Cycle', false, error.message);
    }
  }

  async testCLISnapshots() {
    console.log('\n📸 Testing CLI Output Snapshots...');
    
    const cliTests = [
      {
        name: 'Learn Command Basic',
        command: 'learn',
        args: [this.testProjectPath],
        expectedPatterns: [
          /Concepts:\s*\d+/,
          /Patterns:\s*\d+/,
          /Duration:\s*\d+s/
        ]
      },
      {
        name: 'Learn Command Verbose',
        command: 'learn',
        args: [this.testProjectPath, '--verbose'],
        expectedPatterns: [
          /Learning Details:/,
          /Concepts:\s*\d+/,
          /Patterns:\s*\d+/
        ]
      },
      {
        name: 'Analyze Command Basic',
        command: 'analyze',
        args: [this.testProjectPath],
        expectedPatterns: [
          /Codebase Analysis Results/,
          /Languages:/,
          /Intelligence Data:/
        ]
      },
      {
        name: 'Analyze Command Verbose',
        command: 'analyze',
        args: [this.testProjectPath, '--verbose', '--metrics'],
        expectedPatterns: [
          /Language Distribution/,
          /Complexity Metrics/,
          /Fresh Concepts/
        ]
      },
      {
        name: 'Status Command Basic',
        command: 'status',
        args: [this.testProjectPath],
        expectedPatterns: [
          /Learning Status/,
          /Intelligence Available:/,
          /Data Freshness:/
        ]
      },
      {
        name: 'Status Command Verbose',
        command: 'status',
        args: [this.testProjectPath, '--verbose'],
        expectedPatterns: [
          /System Health/,
          /Intelligence Metrics/,
          /System Metrics/
        ]
      }
    ];
    
    for (const test of cliTests) {
      try {
        console.log(`  Testing: ${test.name}`);
        
        const result = await this.runCLICommand(test.command, test.args);
        
        if (!result.success) {
          throw new Error(`CLI command failed: ${result.error}`);
        }
        
        // Check output patterns
        const output = result.output;
        const missingPatterns = [];
        
        for (const pattern of test.expectedPatterns) {
          if (!pattern.test(output)) {
            missingPatterns.push(pattern.toString());
          }
        }
        
        if (missingPatterns.length > 0) {
          throw new Error(`Missing expected patterns: ${missingPatterns.join(', ')}`);
        }
        
        // Store snapshot for consistency checking
        this.cliSnapshots.set(test.name, {
          command: test.command,
          args: test.args,
          outputStructure: this.extractOutputStructure(output)
        });
        
        this.addTestResult(`CLI Snapshot: ${test.name}`, true, 'Output format matches expected patterns');
        
      } catch (error) {
        this.addTestResult(`CLI Snapshot: ${test.name}`, false, error.message);
      }
    }
  }

  async testMCPSchemaValidation() {
    console.log('\n🔍 Testing MCP Tool Schema Validation...');
    
    await this.startMCPServer();
    
    const schemaTests = [
      {
        name: 'Valid analyze_codebase',
        tool: 'analyze_codebase',
        args: { path: this.testProjectPath },
        expectSuccess: true
      },
      {
        name: 'Invalid analyze_codebase - missing path',
        tool: 'analyze_codebase',
        args: {},
        expectSuccess: false,
        expectedError: 'Path is required'
      },
      {
        name: 'Valid search_codebase',
        tool: 'search_codebase',
        args: { query: 'function', type: 'text', limit: 5 },
        expectSuccess: true
      },
      {
        name: 'Invalid search_codebase - empty query',
        tool: 'search_codebase',
        args: { query: '', type: 'text' },
        expectSuccess: false,
        expectedError: 'Query is required'
      },
      {
        name: 'Invalid search_codebase - invalid type',
        tool: 'search_codebase',
        args: { query: 'test', type: 'invalid_type' },
        expectSuccess: false,
        expectedError: 'Invalid enum value'
      },
      {
        name: 'Invalid search_codebase - limit too high',
        tool: 'search_codebase',
        args: { query: 'test', limit: 500 },
        expectSuccess: false,
        expectedError: 'Number must be less than or equal to 100'
      },
      {
        name: 'Valid learn_codebase_intelligence',
        tool: 'learn_codebase_intelligence',
        args: { path: this.testProjectPath, force: true },
        expectSuccess: true
      },
      {
        name: 'Valid get_pattern_recommendations',
        tool: 'get_pattern_recommendations',
        args: { 
          problemDescription: 'Need to validate input',
          currentFile: join(this.testProjectPath, 'index.js')
        },
        expectSuccess: true
      },
      {
        name: 'Invalid get_pattern_recommendations - empty description',
        tool: 'get_pattern_recommendations',
        args: { problemDescription: '' },
        expectSuccess: false,
        expectedError: 'Problem description is required'
      },
      {
        name: 'Valid get_project_blueprint',
        tool: 'get_project_blueprint',
        args: { path: this.testProjectPath, includeFeatureMap: true },
        expectSuccess: true
      }
    ];
    
    for (const test of schemaTests) {
      try {
        console.log(`  Testing: ${test.name}`);
        
        const result = await this.callMCPTool(test.tool, test.args);
        
        if (test.expectSuccess) {
          if (!result) {
            throw new Error('Expected successful result but got null/undefined');
          }
          this.addTestResult(`MCP Schema: ${test.name}`, true, 'Schema validation passed');
        } else {
          // Should not reach here if expecting failure
          this.addTestResult(`MCP Schema: ${test.name}`, false, 'Expected validation error but got success');
        }
        
      } catch (error) {
        if (test.expectSuccess) {
          this.addTestResult(`MCP Schema: ${test.name}`, false, `Unexpected error: ${error.message}`);
        } else {
          // Check if error message contains expected text
          const errorMessage = error.message || '';
          const hasExpectedError = test.expectedError ? 
            errorMessage.includes(test.expectedError) : true;
          
          if (hasExpectedError) {
            this.addTestResult(`MCP Schema: ${test.name}`, true, `Correctly rejected invalid input: ${errorMessage}`);
          } else {
            this.addTestResult(`MCP Schema: ${test.name}`, false, `Wrong error message: ${errorMessage}`);
          }
        }
      }
    }
    
    await this.stopMCPServer();
  }

  async testErrorHandling() {
    console.log('\n⚠️  Testing Error Handling Across Interfaces...');
    
    // CLI Error Handling Tests
    const cliErrorTests = [
      {
        name: 'CLI Learn - Invalid Path',
        command: 'learn',
        args: ['/nonexistent/path'],
        expectError: true
      },
      {
        name: 'CLI Analyze - Invalid Path',
        command: 'analyze',
        args: ['/nonexistent/path'],
        expectError: true
      },
      {
        name: 'CLI Status - Invalid Path',
        command: 'status',
        args: ['/nonexistent/path'],
        expectError: true
      }
    ];
    
    for (const test of cliErrorTests) {
      try {
        console.log(`  Testing: ${test.name}`);
        
        const result = await this.runCLICommand(test.command, test.args);
        
        if (test.expectError) {
          if (result.success) {
            this.addTestResult(`Error Handling: ${test.name}`, false, 'Expected error but got success');
          } else {
            // Check if error message is properly formatted
            const hasErrorCode = result.error.includes('[') && result.error.includes(']');
            const hasErrorMessage = result.error.length > 0;
            
            if (hasErrorCode && hasErrorMessage) {
              this.addTestResult(`Error Handling: ${test.name}`, true, 'Error properly formatted with code');
            } else {
              this.addTestResult(`Error Handling: ${test.name}`, false, 'Error format incorrect');
            }
          }
        } else {
          if (result.success) {
            this.addTestResult(`Error Handling: ${test.name}`, true, 'Command succeeded as expected');
          } else {
            this.addTestResult(`Error Handling: ${test.name}`, false, `Unexpected error: ${result.error}`);
          }
        }
        
      } catch (error) {
        this.addTestResult(`Error Handling: ${test.name}`, false, `Test execution failed: ${error.message}`);
      }
    }
    
    // MCP Error Handling Tests
    await this.startMCPServer();
    
    const mcpErrorTests = [
      {
        name: 'MCP Invalid Tool Name',
        tool: 'invalid_tool_name',
        args: {},
        expectError: true
      },
      {
        name: 'MCP Invalid Path',
        tool: 'analyze_codebase',
        args: { path: '/nonexistent/path' },
        expectError: true
      }
    ];
    
    for (const test of mcpErrorTests) {
      try {
        console.log(`  Testing: ${test.name}`);
        
        const result = await this.callMCPTool(test.tool, test.args);
        
        if (test.expectError) {
          this.addTestResult(`Error Handling: ${test.name}`, false, 'Expected error but got success');
        } else {
          this.addTestResult(`Error Handling: ${test.name}`, true, 'MCP call succeeded as expected');
        }
        
      } catch (error) {
        if (test.expectError) {
          this.addTestResult(`Error Handling: ${test.name}`, true, `Correctly handled error: ${error.message}`);
        } else {
          this.addTestResult(`Error Handling: ${test.name}`, false, `Unexpected error: ${error.message}`);
        }
      }
    }
    
    await this.stopMCPServer();
  }

  async testServiceLayerIntegration() {
    console.log('\n🔧 Testing Service Layer Integration...');
    
    await this.startMCPServer();
    
    try {
      // Test that all services are accessible through MCP
      console.log('  Testing AnalysisService integration...');
      const analysisResult = await this.callMCPTool('analyze_codebase', {
        path: this.testProjectPath
      });
      
      if (!analysisResult || !analysisResult.languages) {
        throw new Error('AnalysisService integration failed');
      }
      
      console.log('  Testing SearchService integration...');
      const searchResult = await this.callMCPTool('search_codebase', {
        query: 'function',
        type: 'text'
      });
      
      if (!Array.isArray(searchResult)) {
        throw new Error('SearchService integration failed');
      }
      
      console.log('  Testing LearningService integration...');
      const learnResult = await this.callMCPTool('learn_codebase_intelligence', {
        path: this.testProjectPath,
        force: true
      });
      
      if (!learnResult || typeof learnResult.success !== 'boolean') {
        throw new Error('LearningService integration failed');
      }
      
      this.addTestResult('Service Layer Integration', true, 'All services accessible through MCP');
      
    } catch (error) {
      this.addTestResult('Service Layer Integration', false, error.message);
    }
    
    await this.stopMCPServer();
  }

  async runCLICommand(command, args) {
    return new Promise((resolve) => {
      const cliPath = join(process.cwd(), 'dist', 'index.js');
      const fullArgs = [cliPath, command, ...args];
      
      const child = spawn('node', fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Command timeout',
          output: stdout,
          stderr: stderr
        });
      }, 30000); // 30 second timeout
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          error: code !== 0 ? (stderr || stdout || `Exit code: ${code}`) : null,
          output: stdout,
          stderr: stderr,
          exitCode: code
        });
      });
      
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message,
          output: stdout,
          stderr: stderr
        });
      });
    });
  }

  async startMCPServer() {
    if (this.serverProcess) {
      return; // Already running
    }
    
    return new Promise((resolve, reject) => {
      const serverPath = join(process.cwd(), 'dist', 'index.js');
      
      this.serverProcess = spawn('node', [serverPath, 'server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });
      
      let serverReady = false;
      
      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('In Memoria MCP Server started') && !serverReady) {
          serverReady = true;
          resolve();
        }
      });
      
      this.serverProcess.on('error', (error) => {
        if (!serverReady) {
          reject(new Error(`Failed to start MCP server: ${error.message}`));
        }
      });
      
      // Timeout for server startup
      setTimeout(() => {
        if (!serverReady) {
          reject(new Error('MCP server startup timeout'));
        }
      }, 15000);
    });
  }

  async stopMCPServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async callMCPTool(toolName, args) {
    if (!this.serverProcess) {
      throw new Error('MCP server not running');
    }
    
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };
      
      let responseReceived = false;
      
      const responseHandler = (data) => {
        if (responseReceived) return;
        
        try {
          const response = JSON.parse(data.toString());
          responseReceived = true;
          
          if (response.error) {
            reject(new Error(response.error.message || 'MCP tool error'));
          } else {
            resolve(response.result ? JSON.parse(response.result.content[0].text) : null);
          }
        } catch (error) {
          if (!responseReceived) {
            reject(new Error(`Failed to parse MCP response: ${error.message}`));
          }
        }
        
        this.serverProcess.stdout.removeListener('data', responseHandler);
      };
      
      this.serverProcess.stdout.on('data', responseHandler);
      
      // Timeout for MCP call
      setTimeout(() => {
        if (!responseReceived) {
          this.serverProcess.stdout.removeListener('data', responseHandler);
          reject(new Error('MCP tool call timeout'));
        }
      }, 10000);
      
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  extractOutputStructure(output) {
    // Extract key structural elements from CLI output for consistency checking
    const lines = output.split('\n');
    const structure = {
      hasHeaders: lines.some(line => line.includes('===')),
      hasMetrics: lines.some(line => /\d+/.test(line)),
      hasEmojis: lines.some(line => /[✅❌⚠️📊🔍]/.test(line)),
      lineCount: lines.length,
      sections: lines.filter(line => line.includes('===')).length
    };
    
    return structure;
  }

  addTestResult(name, success, message) {
    this.testResults.push({
      name,
      success,
      message,
      timestamp: new Date().toISOString()
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');
    
    // Stop MCP server if running
    await this.stopMCPServer();
    
    // Remove test project
    if (existsSync(this.testProjectPath)) {
      try {
        rmSync(this.testProjectPath, { recursive: true, force: true });
        console.log('✅ Test project cleaned up');
      } catch (error) {
        console.warn('⚠️  Failed to clean up test project:', error.message);
      }
    }
  }

  reportResults() {
    console.log('\n📊 Comprehensive Integration Test Results:');
    console.log('=' .repeat(60));
    
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => r.success === false).length;
    const total = this.testResults.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed (${Math.round((passed/total) * 100)}% success rate)`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`  - ${result.name}: ${result.message}`);
        });
    }
    
    console.log('\n✅ Passed Tests:');
    this.testResults
      .filter(r => r.success)
      .forEach(result => {
        console.log(`  - ${result.name}: ${result.message}`);
      });
    
    // Test categories summary
    const categories = {
      'Learn -> Search Cycle': this.testResults.filter(r => r.name.includes('Learn -> Search')),
      'CLI Snapshots': this.testResults.filter(r => r.name.includes('CLI Snapshot')),
      'MCP Schema Validation': this.testResults.filter(r => r.name.includes('MCP Schema')),
      'Error Handling': this.testResults.filter(r => r.name.includes('Error Handling')),
      'Service Integration': this.testResults.filter(r => r.name.includes('Service Layer'))
    };
    
    console.log('\n📋 Results by Category:');
    Object.entries(categories).forEach(([category, tests]) => {
      const categoryPassed = tests.filter(t => t.success).length;
      const categoryTotal = tests.length;
      const status = categoryPassed === categoryTotal ? '✅' : '❌';
      console.log(`  ${status} ${category}: ${categoryPassed}/${categoryTotal}`);
    });
    
    // CLI Snapshot consistency check
    if (this.cliSnapshots.size > 0) {
      console.log('\n📸 CLI Output Consistency:');
      this.cliSnapshots.forEach((snapshot, name) => {
        console.log(`  ✅ ${name}: Structure validated`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (failed === 0) {
      console.log('🎉 All comprehensive integration tests passed!');
      console.log('✨ The refactored system meets all integration requirements.');
      process.exit(0);
    } else {
      console.log('⚠️  Some integration tests failed. Review failures before deployment.');
      process.exit(1);
    }
  }
}

// Run the comprehensive integration tests
const tester = new ComprehensiveIntegrationTester();
tester.runAllTests().catch(error => {
  console.error('💥 Integration test execution failed:', error);
  process.exit(1);
});