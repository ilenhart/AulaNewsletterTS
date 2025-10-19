process.env.NODE_OPTIONS = '--experimental-vm-modules';

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      },
    }],
  },
  // Increase timeout for integration tests that call AWS
  testTimeout: 30000, // 30 seconds
  // Clear mocks between tests
  clearMocks: true,
  // Collect coverage from src directory
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  // Verbose output for better debugging
  verbose: true,
  // Don't transform node_modules except for AWS SDK packages
  transformIgnorePatterns: [
    'node_modules/(?!@aws-sdk)',
  ],
};
