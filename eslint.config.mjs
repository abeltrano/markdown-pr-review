// Flat ESLint config (ESLint 9 + typescript-eslint 8).
//
// Runs against TypeScript sources in src/** only. Bundled output in
// out/** is generated and explicitly ignored. Type-aware rules are
// disabled by default to keep `npm run lint` fast — enable them by
// switching `tseslint.configs.recommended` → `recommendedTypeChecked`
// and adding `parserOptions: { project: './tsconfig.json' }` if/when
// CI runtime becomes less of a concern.
//
// Run with: npm run lint
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'out/**',
            'node_modules/**',
            '.vscode-test/**',
            '*.vsix',
            'esbuild.js'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
        },
        rules: {
            // Prefer explicit `import type` for type-only imports —
            // helps esbuild strip them and avoids accidental runtime
            // dependencies on type-only modules.
// Tweak the rule to permit `typeof import('...')` type annotations,
// which are the canonical way to type a value populated by a dynamic
// import() at runtime (e.g. mermaid-loader.ts).
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'inline-type-imports',
                    disallowTypeAnnotations: false
                }
            ],
            // Match tsconfig's noUnusedLocals (4-space project style):
            // unused vars are an error; underscore-prefixed names are
            // intentionally unused (matches existing code conventions
            // like `_token: vscode.CancellationToken`).
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            // `any` is sometimes necessary at JSON / message boundaries
            // — warn, don't error, so escape hatches stay available
            // but visible.
            '@typescript-eslint/no-explicit-any': 'warn',
            // Disable the JS-only base rule in favour of the
            // TypeScript-aware one above.
            'no-unused-vars': 'off',
            // Use the extension's `getLogger(...)` instead of `console.*`
            // (output channel is colorized; console.log isn't surfaced
            // to users). `console.warn` / `.error` are still allowed
            // for last-resort diagnostics.
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            // Strict equality, but allow `== null` for the
            // null-or-undefined idiom.
            'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
            'curly': ['error', 'multi-line']
        }
    },
    {
        // Test files use chai's idiomatic getter-style assertions
        // (`expect(x).to.exist`, `expect(x).to.be.true`) which read
        // as bare expressions. Turn the rule off here rather than
        // rewrite every assertion to `.equal(true)` form.
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-expressions': 'off'
        }
    },
    {
        // CommonJS config files (.mocharc.cjs, etc.) — provide the
        // Node module globals so `module.exports = ...` lints clean.
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                module: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                exports: 'writable'
            }
        }
    }
);
