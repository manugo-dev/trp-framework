import js from '@eslint/js';
import nodePlugin from 'eslint-plugin-node';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import fivemServerTypes from '@citizenfx/server';
import fivemClientTypes from '@citizenfx/client';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        fivemClientTypes.globals,
        fivemServerTypes.globals
      }
    },
    plugins: {
      node: nodePlugin,
      import: importPlugin,
      prettier: prettierPlugin
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      'prettier/prettier': 'error',
      'import/no-extraneous-dependencies': 'off',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index'
          ],
          'newlines-between': 'always'
        }
      ]
    }
  }
];
