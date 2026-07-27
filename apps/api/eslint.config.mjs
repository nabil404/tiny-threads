// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    // Test files build their collaborators as loosely-typed jest mocks
    // (`const manager = { findOne: jest.fn() } as any`) on purpose: fully
    // typing an EntityManager or a ClsService double costs far more than the
    // type safety is worth in a test, and the assertions themselves are what
    // catch regressions. These stay as warnings so the signal is still visible
    // without failing CI — the same pragmatic tolerance the config already
    // grants no-floating-promises / no-unsafe-argument above. Production code
    // is unaffected.
    files: ['**/__tests__/**/*.ts', 'test/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      // Same population: `tenantDb.run` doubles are written as
      // `jest.fn((work: any) => work(manager))`, whose return type is `any`.
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },
);
