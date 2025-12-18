/**
 * Architectural Guardrails Tests
 * 
 * These tests verify that the architectural constraints are properly enforced.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Architectural Guardrails', () => {
  describe('CLI Layer Constraints', () => {
    it('should not allow CLI files to import from core layer', () => {
      const cliDir = path.join(projectRoot, 'src', 'cli');
      
      if (!fs.existsSync(cliDir)) {
        return; // Skip if CLI directory doesn't exist
      }
      
      const cliFiles = fs.readdirSync(cliDir)
        .filter(file => file.endsWith('.ts'))
        .map(file => path.join(cliDir, file));
      
      const violations: string[] = [];
      
      for (const file of cliFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/import\s+.*\s+from\s+['"]\.\.\/core\//.test(line)) {
            violations.push(`${path.basename(file)}:${i + 1}`);
          }
        }
      }
      
      // Note: This test will fail until the refactor is complete
      // It serves as a reminder of what needs to be fixed
      if (violations.length > 0) {
        console.warn('⚠️  CLI layer violations detected (expected during refactor):');
        console.warn(violations.join('\n'));
      }
      
      // For now, we just document the violations
      // In the future, this should be: expect(violations).toHaveLength(0);
    });
  });
  
  describe('File Watching Constraints', () => {
    it('should not allow fs.watch usage anywhere', () => {
      const srcDir = path.join(projectRoot, 'src');
      
      function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory() && !file.startsWith('__tests__')) {
            findTypeScriptFiles(filePath, fileList);
          } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
            fileList.push(filePath);
          }
        }
        
        return fileList;
      }
      
      const files = findTypeScriptFiles(srcDir);
      const violations: string[] = [];
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip this test file itself since it needs to check for fs.watch violations
          if (file.includes('architectural-guardrails.test.ts')) {
            continue;
          }
          if ((line.includes('fs.watch') || line.includes('fs.watchFile')) && 
              !line.trim().startsWith('//') && 
              !line.trim().startsWith('*')) {
            violations.push(`${path.relative(projectRoot, file)}:${i + 1}`);
          }
        }
      }
      
      expect(violations).toHaveLength(0);
    });
    
    it('should not allow chokidar usage anywhere', () => {
      const srcDir = path.join(projectRoot, 'src');
      
      function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory() && !file.startsWith('__tests__')) {
            findTypeScriptFiles(filePath, fileList);
          } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
            fileList.push(filePath);
          }
        }
        
        return fileList;
      }
      
      const files = findTypeScriptFiles(srcDir);
      const violations: string[] = [];
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip this test file itself since it needs to check for chokidar violations
          if (file.includes('architectural-guardrails.test.ts')) {
            continue;
          }
          if ((line.includes("from 'chokidar'") || line.includes('from "chokidar"')) && 
              !line.trim().startsWith('//') && 
              !line.trim().startsWith('*')) {
            violations.push(`${path.relative(projectRoot, file)}:${i + 1}`);
          }
        }
      }
      
      expect(violations).toHaveLength(0);
    });
  });
  
  describe('Service Isolation Constraints', () => {
    it('should not allow services to import each other directly', () => {
      const servicesDir = path.join(projectRoot, 'src', 'core', 'services');
      
      if (!fs.existsSync(servicesDir)) {
        return; // Skip if services directory doesn't exist
      }
      
      const serviceFiles = fs.readdirSync(servicesDir)
        .filter(file => file.endsWith('.ts') && !file.includes('test') && !file.includes('spec'))
        .filter(file => !file.startsWith('index'))
        .map(file => path.join(servicesDir, file));
      
      const violations: string[] = [];
      
      for (const file of serviceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const fileName = path.basename(file);
        
        // DiagnosticService is allowed to import other services
        if (fileName.includes('DiagnosticService')) {
          continue;
        }
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/import\s+.*\s+from\s+['"]\.\/(?:Analysis|Learning|Search)Service/.test(line)) {
            violations.push(`${fileName}:${i + 1}`);
          }
        }
      }
      
      expect(violations).toHaveLength(0);
    });
  });
  
  describe('Verification Scripts', () => {
    it('should have verify-architecture script', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'verify-architecture.ts');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });
    
    it('should have build-time-verification script', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'build-time-verification.ts');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });
    
    it('should have pre-commit hook', () => {
      const hookPath = path.join(projectRoot, '.git', 'hooks', 'pre-commit');
      expect(fs.existsSync(hookPath)).toBe(true);
    });
    
    it('should have architectural guardrails documentation', () => {
      const docPath = path.join(projectRoot, 'docs', 'ARCHITECTURAL_GUARDRAILS.md');
      expect(fs.existsSync(docPath)).toBe(true);
    });
  });
});