import type { Config } from 'jest'

const config: Config = {
  // Test environment
  testEnvironment: 'node',

  // ESM support
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(chalk)/)'
  ],

  // Test file patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.js',
    '<rootDir>/**/*.test.js',
    '<rootDir>/**/*.spec.js'
  ],

  // Reporters
  reporters: [
    'default',
    [
      'tdd-guard-jest',
      {
        projectRoot: '/Users/michaellongerich/Documents/0.Inbox/Code/DevShop',
      },
    ],
  ],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'client/**/*.js',
    'servers/**/*.js',
    'utils/**/*.js',
    '!**/__tests__/**',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!coverage/**'
  ],
  coverageReporters: ['text', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20
    }
  },

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@client/(.*)$': '<rootDir>/client/$1',
    '^@services/(.*)$': '<rootDir>/client/services/$1',
    '^@agents/(.*)$': '<rootDir>/client/agents/$1',
    '^@commands/(.*)$': '<rootDir>/client/commands/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1'
  },

  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Transform configuration for ESM
  transform: {},

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output for debugging
  verbose: true,

  // Exit early on first test failure during development
  bail: 0,

  // Watch mode configuration
  watchman: false
}

export default config