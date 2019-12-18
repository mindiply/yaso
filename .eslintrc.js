module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion:  2018,  // Allows for the parsing of modern ECMAScript features
    sourceType:  'module',
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/interface-name-prefix': ['error', 'always'],
    'no-unused-vars': ['error'],
    "@typescript-eslint/no-use-before-define": ["error", { "functions": false, "classes": true }]
  }
};
