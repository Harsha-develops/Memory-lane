import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'test-results/**',
      'playwright-report/**',
      'node_modules/**',
    ],
  },
  ...tseslint.configs.recommended,
  { files: ['scripts/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
