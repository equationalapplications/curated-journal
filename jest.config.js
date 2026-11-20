/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/__tests__/styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    // d3-force 3.0.1 ships ESM-only (.mjs main); jest resolves the UMD build.
    '^d3-force$': '<rootDir>/node_modules/d3-force/dist/d3-force.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@equationalapplications/.*|xstate|llama\\.rn|d3-.*)',
  ],
};
