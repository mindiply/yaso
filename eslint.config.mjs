

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    }}
);

// module.exports = {
//   parser: '@typescript-eslint/parser',
//   parserOptions: {
//     ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
//     sourceType: 'module'
//   },
//   extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
//   plugins: ['@typescript-eslint', 'prettier'],
//   rules: {
//     'prettier/prettier': 'error',
//     '@typescript-eslint/no-explicit-any': 'off',
//     'no-unused-vars': 'off',
//     '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_+$'}],
//     '@typescript-eslint/no-use-before-define': [
//       'error',
//       {functions: false, classes: true}
//     ],
//     '@typescript-eslint/ban-ts-comment': ['warn', {'ts-expect-error': false}]
//   }
// };
