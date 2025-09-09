import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Test helper utilities for DevShop testing

/**
 * Create a temporary directory for test files
 */
export async function createTempDir(prefix = 'devshop-test-') {
  const tempDir = path.join('/tmp', `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up test directories
 */
export async function cleanupTempDir(dirPath) {
  try {
    await fs.rmdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create test files with content
 */
export async function createTestFile(filePath, content = '{}') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

/**
 * Wait for async operations in tests
 */
export function waitForAsync(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create comprehensive mock context for agent testing
 */
export function createTestContext(overrides = {}) {
  return {
    repoOwner: 'test-owner',
    repoName: 'test-repo',
    sessionId: 'test-session-123',
    description: 'Test feature implementation',
    initialInput: 'Add user authentication',
    userInput: 'Add user authentication',
    taskType: 'feature',
    getRepository() {
      return `${this.repoOwner}/${this.repoName}`;
    },
    getFullPath() {
      return `https://github.com/${this.repoOwner}/${this.repoName}`;
    },
    ...overrides
  };
}

/**
 * Create mock LLM response for testing
 */
export function createMockLLMResponse(content = 'Mock response', tokenCount = 100) {
  return {
    content,
    usage: {
      tokens: tokenCount,
      prompt_tokens: Math.floor(tokenCount * 0.3),
      completion_tokens: Math.floor(tokenCount * 0.7),
      total_tokens: tokenCount
    }
  };
}

/**
 * Assert that a function was called with specific partial arguments
 */
export function expectCalledWithPartial(mockFn, expectedPartialArgs) {
  const calls = mockFn.mock.calls;
  const matchingCall = calls.find(call => {
    return Object.keys(expectedPartialArgs).every(key => {
      if (typeof expectedPartialArgs[key] === 'object' && expectedPartialArgs[key] !== null) {
        return JSON.stringify(call[0][key]) === JSON.stringify(expectedPartialArgs[key]);
      }
      return call[0][key] === expectedPartialArgs[key];
    });
  });
  
  expect(matchingCall).toBeDefined();
  return matchingCall;
}

/**
 * Create a spy that tracks all method calls on an object
 */
export function spyOnAllMethods(obj, mockImplementations = {}) {
  const spies = {};
  
  Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
    .filter(prop => typeof obj[prop] === 'function' && prop !== 'constructor')
    .forEach(methodName => {
      spies[methodName] = jest.spyOn(obj, methodName);
      if (mockImplementations[methodName]) {
        spies[methodName].mockImplementation(mockImplementations[methodName]);
      }
    });
    
  return spies;
}

/**
 * Mock process.env for testing
 */
export function mockEnvironment(envVars = {}) {
  const originalEnv = { ...process.env };
  
  // Set test environment variables
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ...envVars
  });
  
  // Return cleanup function
  return () => {
    process.env = originalEnv;
  };
}

/**
 * Capture console output during test execution
 */
export function captureConsoleOutput() {
  const originalMethods = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };
  
  const captured = {
    log: [],
    error: [],
    warn: [],
    info: []
  };
  
  // Mock console methods to capture output
  console.log = jest.fn((...args) => captured.log.push(args.join(' ')));
  console.error = jest.fn((...args) => captured.error.push(args.join(' ')));
  console.warn = jest.fn((...args) => captured.warn.push(args.join(' ')));
  console.info = jest.fn((...args) => captured.info.push(args.join(' ')));
  
  // Return captured output and cleanup function
  return {
    captured,
    restore: () => {
      Object.assign(console, originalMethods);
    }
  };
}

/**
 * Create mock for async generator (for streaming responses)
 */
export async function* createMockAsyncGenerator(values) {
  for (const value of values) {
    yield value;
  }
}

/**
 * Test suite runner for agent tests
 */
export function createAgentTestSuite(AgentClass, options = {}) {
  const { 
    agentName = 'TestAgent',
    mockDependencies = {},
    requiredMethods = ['execute', 'getName']
  } = options;
  
  return () => {
    let agent;
    let mockMCPClientManager, mockSessionService, mockConfig;
    
    beforeEach(() => {
      mockMCPClientManager = mockDependencies.mcpClientManager || createMockMCPClientManager();
      mockSessionService = mockDependencies.sessionService || createMockSessionService();
      mockConfig = mockDependencies.config || createMockConfigService();
      
      agent = new AgentClass(mockMCPClientManager, mockSessionService, mockConfig);
    });
    
    test(`should create ${agentName} instance`, () => {
      expect(agent).toBeInstanceOf(AgentClass);
    });
    
    requiredMethods.forEach(method => {
      test(`should have ${method} method`, () => {
        expect(typeof agent[method]).toBe('function');
      });
    });
    
    return { agent, mockMCPClientManager, mockSessionService, mockConfig };
  };
}

/**
 * Assertion helpers for DevShop-specific testing
 */
export const DevShopAssertions = {
  /**
   * Assert that a session ID is valid format
   */
  expectValidSessionId(sessionId) {
    expect(sessionId).toMatch(/^[a-zA-Z0-9-]+$/);
    expect(sessionId.length).toBeGreaterThan(8);
  },
  
  /**
   * Assert that cost tracking is working
   */
  expectCostTracking(result) {
    expect(result).toHaveProperty('cost');
    expect(typeof result.cost).toBe('number');
    expect(result.cost).toBeGreaterThanOrEqual(0);
  },
  
  /**
   * Assert that LLM usage is tracked
   */
  expectUsageTracking(result) {
    expect(result).toHaveProperty('usage');
    expect(result.usage).toHaveProperty('tokens');
    expect(typeof result.usage.tokens).toBe('number');
  },
  
  /**
   * Assert that repository context is valid
   */
  expectValidRepositoryContext(context) {
    expect(context).toHaveProperty('repoOwner');
    expect(context).toHaveProperty('repoName');
    expect(context).toHaveProperty('sessionId');
    expect(typeof context.getRepository).toBe('function');
    expect(context.getRepository()).toBe(`${context.repoOwner}/${context.repoName}`);
  }
};