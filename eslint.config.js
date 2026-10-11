import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'

const browserGlobals = {
  URL: 'readonly',
  Headers: 'readonly',
  FormData: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  window: 'readonly',
  fetch: 'readonly',
}

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
}

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js'],
    languageOptions: { globals: nodeGlobals },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: browserGlobals,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
    },
  },
]
