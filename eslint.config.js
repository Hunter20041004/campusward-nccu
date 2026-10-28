import { builtinModules } from 'node:module';
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 引擎只能是純邏輯：不得引用 Node 內建模組或畫面框架，也不得碰執行環境的全域（設計 8.1）。
const ENGINE_FORBIDDEN_GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'process', 'Buffer', 'global', 'globalThis',
  'require', '__dirname', '__filename',
].map((name) => ({ name, message: '引擎須保持純邏輯；請由呼叫端注入。' }));

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'scripts/checks/fixtures/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: builtinModules.map((name) => ({ name, message: '引擎不得使用 Node 內建模組。' })),
        patterns: [
          { group: ['node:*'], message: '引擎不得使用 Node 內建模組。' },
          { group: ['react', 'react-*', 'react/*', '@react*'], message: '引擎不得依賴畫面框架。' },
        ],
      }],
      'no-restricted-globals': ['error', ...ENGINE_FORBIDDEN_GLOBALS],
    },
  },
  {
    // 型別測試檔刻意引用禁用全域，用來證明 tsc 會擋下。
    files: ['packages/engine/src/__typetests__/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { react },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // AI 回覆與外部資料一律不以 HTML 直接插入（設計 6.4）。
      'react/no-danger': 'error',
    },
  },
);
