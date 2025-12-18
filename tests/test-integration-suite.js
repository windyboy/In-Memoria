#!/usr/bin/env node

/**
 * Integration Test Suite for In-Memoria Refactor
 * 
 * Implements comprehensive integration testing as required by task 27:
 * 1. Full "Learn -> Search" cycle test on sample repository
 * 2. CLI snapshot tests to verify output format consistency  
 * 3. MCP tool schema validation tests
 * 4. Error handling across all interfaces
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

class IntegrationTestSuite {
  constructor() {
    this.results = [];
    this.testDir = join(tmpdir(), 'in-memoria-test-' + Date.now());
    this.serverProcess = null;
  }

  async run() {
    console.log('🧪 Running Integration Test Suite...\n');
    
    try {
      await this.setupTestEnvironment();
      await this.testLearnSearchCycle();
      await this.testCLISnapshots();
      await this.testMCPSchemaValidation();
      await this.testErrorHandling();
      
      this.reportResults();
      
    } catch (error) {
      console.error('💥 Test suite failed:', error);
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
    
    // Create sample project
    const files = {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        main: 'index.js'
      }, null, 2),
      
      'index.js': `
// Sample JavaScript project for testing
const express = require('express');

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

function sanitize(input) {
  return input.trim();
}

module.exports = { formatDate, sanitize };
      `
    };
    
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(this.testDir, filename), content);
    }
    
    console.log(`✅ Test environment ready: ${this.testDir}`);
  }

  async testLearnSearchCycle() {
    console.log('\n📚 Testing Learn -> Search Cycle...');
    
    try {
      // Step 1: Learn from test project
      console.log('  Learning from codebase...');
      const learnResult = await this.runCLI('learn', [this.testDir, '--verbose']);
      
      if (learnResult.exitCode !== 0) {
        throw new Error(`Learn failed: ${learnResult.stderr || learnResult.stdout}`);
      }
      
      // Verify learning output
      const output = learnResult.stdout;
      if (!output.includes('Concepts:') || !output.includes('Patterns:')) {
        throw new Error('Learning output missing expected metrics');
      }
      
      // Step 2: Start MCP server and test search
      console.log('  Testing search via MCP...');
      await this.startMCPServer();
      
      // Test search functionality
      const searchResult = await this.callMCPTool('search_codebase', {
        query: 'function',
        type: 'text',
        limit: 5
      });
      
      if (!Array.isArray(searchResult)) {
        throw new Error('Search did not return array results');
      }
      
      // Test analysis
      const analysisResult = await this.callMCPTool('analyze_codebase', {
        path: this.testDir
      });
      
      if (!analysisResult || !analysisResult.languages) {
        throw new Error('Analysis did not return expected structure');
      }
      
      await this.stopMCPServer();
      
      this.addResult('Learn -> Search Cycle', true, 'Full cycle completed successfully');
      
    } catch (error) {
      this.addResult('Learn -> Search Cycle', false, error.message);
    }
  }

  async testCLISnapshots() {
    console.log('\n📸 Testing CLI Output Snapshots...');
    
    const tests = [
      {
        name: 'Learn Command',
        cmd: 'learn',
        args: [this.testDir],
        patterns: [/Concepts:\s*\d+/, /Patterns:\s*\d+/, /Duration:\s*\d+s/]
      },
      {
        name: 'Analyze Command',
        cmd: 'analyze',
        args: [this.testDir],
        patterns: [/Codebase Analysis Results/, /Languages:/, /Intelligence Data:/]
      },
      {
        name: 'Status Command',
        cmd: 'status',
        args: [this.testDir],
        patterns: [/Learning Status/, /Intelligence Available:/, /Data Freshness:/]
      }
    ];
    
    for (const test of tests) {
      try {
        console.log(`  Testing ${test.name}...`);
        
        const result = await this.runCLI(test.cmd, test.args);
        
        if (result.exitCode !== 0) {
          throw new Error(`Command failed: ${result.stderr}`);
        }
        
        // Check output patterns
        const missing = test.patterns.filter(pattern => !pattern.test(result.stdout));
        if (missing.length > 0) {
          throw new Error(`Missing patterns: ${missing.map(p => p.toString()).join(', ')}`);
        }
        
        this.addResult(`CLI Snapshot: ${test.name}`, true, 'Output format validated');
        
      } catch (error) {
        this.addResult(`CLI Snapshot: ${test.name}`, false, error.message);
      }
    }
  }

  async testMCPSchemaValidation() {
    console.log('\n🔍 Testing MCP Schema Validation...');
    
    await this.startMCPServer();
    
    const tests = [
      // Valid cases
      {
        name: 'Valid analyze_codebase',
        tool: 'analyze_codebase',
        args: { path: this.testDir },
        expectError: false
      },
      {
        name: 'Valid search_codebase',
        tool: 'search_codebase',
        args: { query: 'test', type: 'text' },
        expectError: false
      },
      
      // Invalid cases
      {
        name: 'Invalid analyze - missing path',
        tool: 'analyze_codebase',
        args: {},
        expectError: true
      },
      {
        name: 'Invalid search - empty query',
        tool: 'search_codebase',
        args: { query: '' },
        expectError: true
      },
      {
        name: 'Invalid search - bad type',
        tool: 'search_codebase',
        args: { query: 'test', type: 'invalid' },
        expectError: true
      },
      {
        name: 'Invalid search - limit too high',
        tool: 'search_codebase',
        args: { query: 'test', limit: 500 },
        expectError: true
      }
    ];
    
    for (const test of tests) {
      try {
        console.log(`  Testing ${test.name}...`);
        
        const result = await this.callMCPTool(test.tool, test.args);
        
        if (test.expectError) {
          this.addResult(`MCP Schema: ${test.name}`, false, 'Expected error but got success');
        } else {
          this.addResult(`MCP Schema: ${test.name}`, true, 'Valid input accepted');
        }
        
      } catch (error) {
        if (test.expectError) {
          this.addResult(`MCP Schema: ${test.name}`, true, `Correctly rejected: ${error.message}`);
        } else {
          this.addResult(`MCP Schema: ${test.name}`, false, `Unexpected error: ${error.message}`);
        }
      }
    }
    
    await this.stopMCPServer();
  }

  async testErrorHandling() {
    console.log('\n⚠️  Testing Error Handling...');
    
    // CLI error tests
    const cliTests = [
      {
        name: 'CLI Learn - Invalid Path',
        cmd: 'learn',
        args: ['/nonexistent/path'],
        expectError: true
      },
      {
        name: 'CLI Analyze - Invalid Path',
        cmd: 'analyze',
        args: ['/nonexistent/path'],
        expectError: true
      }
    ];
    
    for (const test of cliTests) {
      try {
        console.log(`  Testing ${test.name}...`);
        
        const result = await this.runCLI(test.cmd, test.args);
        
        if (test.expectError) {
          if (result.exitCode === 0) {
            this.addResult(`Error: ${test.name}`, false, 'Expected error but got success');
          } else {
            // Check error format
            const hasErrorCode = result.stderr.includes('[') && result.stderr.includes(']');
            this.addResult(`Error: ${test.name}`, hasErrorCode, 
              hasErrorCode ? 'Error properly formatted' : 'Error format incorrect');
          }
        } else {
          this.addResult(`Error: ${test.name}`, result.exitCode === 0, 'Command succeeded');
        }
        
      } catch (error) {
        this.addResult(`Error: ${test.name}`, false, `Test failed: ${error.message}`);
      }
    }
    
    // MCP error tests
    await this.startMCPServer();
    
    try {
      console.log('  Testing MCP invalid tool...');
      await this.callMCPTool('invalid_tool', {});
      this.addResult('Error: MCP Invalid Tool', false, 'Expected error but got success');
    } catch (error) {
      this.addResult('Error: MCP Invalid Tool', true, `Correctly handled: ${error.message}`);
    }
    
    await this.stopMCPServer();
  }

  async runCLI(command, args) {
    return new Promise((resolve) => {
      const cliPath = join(process.cwd(), 'dist', 'index.js');
      const child = spawn('node', [cliPath, command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => stdout += data.toString());
      child.stderr.on('data', (data) => stderr += data.toString());
      
      child.on('close', (code) => {
        resolve({ exitCode: code, stdout, stderr });
      });
      
      setTimeout(() => {
        child.kill();
        resolve({ exitCode: -1, stdout, stderr: 'Timeout' });
      }, 30000);
    });
  }

  async startMCPServer() {
    if (this.serverProcess) return;
    
    return new Promise((resolve, reject) => {
      const serverPath = join(process.cwd(), 'dist', 'index.js');
      this.serverProcess = spawn('node', [serverPath, 'server'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let ready = false;
      
      this.serverProcess.stderr.on('data', (data) => {
        if (data.toString().includes('MCP Server started') && !ready) {
          ready = true;
          resolve();
        }
      });
      
      setTimeout(() => {
        if (!ready) reject(new Error('Server startup timeout'));
      }, 10000);
    });
  }

  async stopMCPServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async callMCPTool(tool, args) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool, arguments: args }
      };
      
      let handled = false;
      
      const handler = (data) => {
        if (handled) return;
        
        try {
          const response = JSON.parse(data.toString());
          handled = true;
          
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            const result = response.result ? 
              JSON.parse(response.result.content[0].text) : null;
            resolve(result);
          }
        } catch (error) {
          if (!handled) {
            handled = true;
            reject(error);
          }
        }
      };
      
      this.serverProcess.stdout.on('data', handler);
      
      setTimeout(() => {
        if (!handled) {
          handled = true;
          reject(new Error('MCP call timeout'));
        }
      }, 8000);
      
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  addResult(name, success, message) {
    this.results.push({ name, success, message });
  }

  async cleanup() {
    await this.stopMCPServer();
    
    if (existsSync(this.testDir)) {
      try {
        rmSync(this.testDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
  }

  reportResults() {
    console.log('\n📊 Integration Test Results:');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed (${Math.round(passed/total * 100)}%)`);
    
    // Group by category
    const categories = {};
    this.results.forEach(result => {
      const category = result.name.split(':')[0] || result.name.split(' ')[0];
      if (!categories[category]) categories[category] = [];
      categories[category].push(result);
    });
    
    Object.entries(categories).forEach(([category, tests]) => {
      const categoryPassed = tests.filter(t => t.success).length;
      const status = categoryPassed === tests.length ? '✅' : '❌';
      console.log(`\n${status} ${category}: ${categoryPassed}/${tests.length}`);
      
      tests.forEach(test => {
        const icon = test.success ? '  ✅' : '  ❌';
        console.log(`${icon} ${test.name}: ${test.message}`);
      });
    });
    
    console.log('\n' + '='.repeat(50));
    
    if (passed === total) {
      console.log('🎉 All integration tests passed!');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Review before deployment.');
      process.exit(1);
    }
  }
}

// Run the test suite
const suite = new IntegrationTestSuite();
suite.run().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});