import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Architectural constraint: Prevent CLI from importing core
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../core/*', '../core/**/*'],
              message: 'CLI layer cannot import from core layer. Use DI container through bootstrap instead.'
            }
          ]
        }
      ],
      
      // Prevent fs.watch usage anywhere
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='fs'][callee.property.name='watch']",
          message: 'fs.watch is not allowed. This violates the architectural constraint against file watchers.'
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='fs'][callee.property.name='watchFile']",
          message: 'fs.watchFile is not allowed. This violates the architectural constraint against file watchers.'
        },
        {
          selector: "ImportDeclaration[source.value='chokidar']",
          message: 'chokidar is not allowed. This violates the architectural constraint against file watchers.'
        }
      ]
    }
  },
  {
    // Special rules for CLI files
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../core/*', '../core/**/*'],
              message: 'CLI layer cannot import from core layer. Use DI container through bootstrap instead.'
            }
          ]
        }
      ]
    }
  }
];