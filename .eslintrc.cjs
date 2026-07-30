// 최소한의 린트. 스타일 규칙은 넣지 않는다 — 혼자 쓰는 앱에서 포맷 싸움은 비용만 든다.
// 잡고 싶은 건 딱 두 가지다: 안 쓰는 코드가 쌓이는 것, 훅 의존성 실수.
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', '*.local.mjs'],
  rules: {
    // 안 쓰는 변수·import는 지운다. _ 로 시작하면 의도적으로 버린 것으로 본다.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // 이 앱은 실패해도 조용히 넘어가야 하는 곳이 많다(오디오 재생·IndexedDB)
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['**/*.test.ts'],
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
  ],
}
