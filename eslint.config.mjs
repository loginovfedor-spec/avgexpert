import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  Event: 'readonly',
  MouseEvent: 'readonly',
  KeyboardEvent: 'readonly',
  DragEvent: 'readonly',
  StorageEvent: 'readonly',
  File: 'readonly',
  Blob: 'readonly',
  crypto: 'readonly',
  marked: 'readonly',
  hljs: 'readonly',
  DOMPurify: 'readonly',
};

const nodeGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  setImmediate: 'readonly',
  TextDecoder: 'readonly',
  URLSearchParams: 'readonly',
  AbortSignal: 'readonly',
  NodeJS: 'readonly'
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'webui_dist/**'
    ]
  },
  js.configs.recommended,
  {
    files: [
      'src/**/*.ts',
      'server.ts',
      'tests/**/*.ts',
      'scripts/**/*.ts',
      'scratch/**/*.ts',
      'webui_src/ts/**/*.ts',
      'llm-network-proxy/**/*.ts',
      'ecosystem.config.ts'
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'require-yield': 'off'
    }
  },
  {
    files: ['webui_src/ts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'require-yield': 'off'
    }
  }
];
