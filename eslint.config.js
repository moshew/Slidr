import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/src-tauri/gen/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'examples/**',
      // Spikes are throwaway feasibility code; their findings live in docs/adr.
      'spikes/**',
      // Slidr Studio's Python environment, and its local requests and renders.
      'management/server/.venv/**',
      'management/.data*/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['**/*.tsx', 'apps/desktop/src/**/*.ts', 'packages/{renderer,ui}/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },

  {
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}', '**/scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },

  // Development scripts that drive the running app over the DevTools protocol: Node, with code
  // for the app's pages inside.
  {
    files: ['apps/desktop/scripts/import/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // The studio's tools (management/README.md): Node, and a headless browser driven from it.
  {
    files: ['management/web/tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // The tools that render, check and package the authored templates and designs
  // (packages/templates/src/authoring): Node, and a headless browser driven from it; and the
  // three.js scenes their pictures were rendered from, which run in that browser.
  {
    files: ['packages/templates/src/authoring/tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['packages/templates/src/authoring/artwork/**/*.js'],
    languageOptions: { globals: globals.browser },
  },

  // Dependency rule of SPEC 14.2: `model` stands alone and never touches React or the DOM.
  {
    files: ['packages/model/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@slidr/*'], message: '`model` depends on no other workspace package.' },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'No React in `model`.',
            },
          ],
        },
      ],
    },
  },
);
