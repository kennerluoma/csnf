//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import noEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

export default [
  ...tanstackConfig,
  // Accessibility, the rules of React (incl. React Compiler diagnostics), and effects that should
  // be derived state, an event handler or a loader instead.
  { files: ['src/**/*.{ts,tsx}'], ...jsxA11y.flatConfigs.recommended },
  { files: ['src/**/*.{ts,tsx}'], ...reactHooks.configs.flat.recommended },
  { files: ['src/**/*.{ts,tsx}'], ...noEffect.configs.recommended },
  {
    files: ['src/**/*.tsx'],
    rules: {
      // Conditional classes go through cn() (src/lib/cn.ts), never string building.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='className'] TemplateLiteral[expressions.length>0]",
          message:
            'Use cn() from #/lib/cn for conditional or composed class names.',
        },
        {
          selector:
            "JSXAttribute[name.name='className'] BinaryExpression[operator='+']",
          message:
            'Use cn() from #/lib/cn for conditional or composed class names.',
        },
      ],
    },
  },
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'studio/.sanity/**',
      'studio/dist/**',
      'dist/**',
    ],
  },
]
