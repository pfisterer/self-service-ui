import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat config. The point of having a linter here at all is the react-hooks
// plugin: a conditional `return` in front of a useEffect, or a setState in a
// render body, are silent in review and fatal at runtime — dyndns-config.jsx
// shipped with both. Those two are machine-checkable, so a machine checks them.
//
// eslint-plugin-react is deliberately NOT used: it still caps at eslint 9,
// and its remaining value (prop-types, legacy JSX rules) does not apply to
// this codebase (automatic JSX runtime, no prop-types).
export default [
    {
        ignores: ['dist/**', 'docs/**', 'node_modules/**', 'web/config.js'],
    },

    // Browser code.
    {
        files: ['web/**/*.{js,jsx}'],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: {
                ...globals.browser,
                // Injected by Vite's `define` (see vite.config.js).
                __APP_VERSION__: 'readonly',
            },
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...js.configs.recommended.rules,
            ...reactHooks.configs['recommended-latest'].rules,
            // JSX uses identifiers the base rule cannot see as "used".
            'no-unused-vars': ['error', {
                varsIgnorePattern: '^[A-Z_]',
                argsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
            'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
            eqeqeq: ['error', 'smart'],
        },
    },

    // Build tooling runs in Node, not in the browser.
    {
        files: ['*.config.js'],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },
];
