// Mocha configuration. Uses tsx loader to execute TypeScript test files
// directly (matches the host tsconfig's module:ESNext +
// moduleResolution:Bundler so deep .mjs imports in src/ resolve identically
// during testing).
module.exports = {
  extension: ['ts'],
  spec: 'test/unit/**/*.test.ts',
  recursive: true,
  timeout: 10000,
  'node-option': ['import=tsx', 'no-warnings=ExperimentalWarning'],
};
