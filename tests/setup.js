import { jest } from '@jest/globals';

// Global test setup and utilities

// Mock console methods by default to reduce test noise
// Tests can restore specific methods when needed
global.mockConsole = () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
};

// Restore console methods
global.restoreConsole = () => {
  console.log.mockRestore?.();
  console.info.mockRestore?.();
  console.warn.mockRestore?.();
  console.error.mockRestore?.();
};

// Common test utilities
global.createMockContext = (overrides = {}) => ({
  repoOwner: 'test-owner',
  repoName: 'test-repo',
  sessionId: 'test-session-123',
  description: 'Test feature description',
  getRepository: function() {
    return `${this.repoOwner}/${this.repoName}`;
  },
  ...overrides
});

// Mock file system paths for consistent testing
global.mockPaths = {
  logDir: '/tmp/test-logs',
  configDir: '/tmp/test-config',
  dataDir: '/tmp/test-data'
};

// Default environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Set up default mocks that are commonly needed
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Mock console by default to reduce noise
  mockConsole();
});

afterEach(() => {
  // Restore console after each test
  restoreConsole();
});

// Cleanup after all tests
afterAll(() => {
  // Restore all mocks
  jest.restoreAllMocks();
});