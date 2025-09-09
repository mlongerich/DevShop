import { jest } from '@jest/globals';

// Mock factories for common DevShop components

export const createMockMCPClientManager = (overrides = {}) => ({
  getClient: jest.fn().mockResolvedValue({
    callTool: jest.fn().mockResolvedValue({ result: 'mock result' }),
    listTools: jest.fn().mockResolvedValue(['tool1', 'tool2']),
    close: jest.fn().mockResolvedValue()
  }),
  createFastMCPClient: jest.fn().mockResolvedValue({}),
  createGitHubClient: jest.fn().mockResolvedValue({}),
  ...overrides
});

export const createMockSessionService = (overrides = {}) => ({
  logDir: '/tmp/test-logs',
  createSession: jest.fn().mockReturnValue('test-session-123'),
  logInteraction: jest.fn().mockResolvedValue(),
  logError: jest.fn().mockResolvedValue(),
  logCompletion: jest.fn().mockResolvedValue(),
  getSessionPath: jest.fn().mockReturnValue('/tmp/test-logs/test-session-123'),
  ...overrides
});

export const createMockConfigService = (overrides = {}) => ({
  getConfig: jest.fn().mockReturnValue({
    providers: {
      openai: { models: { ba: 'gpt-4', developer: 'gpt-4' } },
      anthropic: { models: { ba: 'claude-3-sonnet', developer: 'claude-3-haiku' } }
    },
    github: { baseUrl: 'https://api.github.com' },
    cost: { sessionTokens: 10000, sessionCost: 5.00 }
  }),
  loadConfig: jest.fn().mockResolvedValue(),
  validateConfig: jest.fn().mockResolvedValue(true),
  ...overrides
});

export const createMockConversationManager = (overrides = {}) => ({
  initializeConversation: jest.fn().mockResolvedValue(),
  getConversationState: jest.fn().mockResolvedValue({
    state: 'gathering',
    history: [],
    tokenCount: 0,
    estimatedCost: 0
  }),
  storeConversationTurn: jest.fn().mockResolvedValue(),
  updateConversationState: jest.fn().mockResolvedValue(),
  finalizeConversation: jest.fn().mockResolvedValue([]),
  formatConversationHistory: jest.fn().mockResolvedValue('Formatted history'),
  conversationExists: jest.fn().mockResolvedValue(false),
  ...overrides
});

export const createMockAgentCommunicationService = (overrides = {}) => ({
  initializeCommunication: jest.fn().mockResolvedValue(),
  sendMessage: jest.fn().mockResolvedValue(),
  processMessage: jest.fn().mockResolvedValue(),
  communicationExists: jest.fn().mockResolvedValue(false),
  getCommunicationStatus: jest.fn().mockResolvedValue({
    exchangeCount: 0,
    limitReached: false
  }),
  ...overrides
});

export const createMockAgent = (agentType = 'ba', overrides = {}) => ({
  getName: jest.fn().mockReturnValue(`${agentType}-agent`),
  execute: jest.fn().mockResolvedValue({
    summary: `Mock ${agentType} response`,
    cost: 0.05,
    usage: { tokens: 100 }
  }),
  ensureContextMethods: jest.fn().mockImplementation(ctx => ({
    ...ctx,
    getRepository: () => `${ctx.repoOwner}/${ctx.repoName}`
  })),
  generateLLMResponse: jest.fn().mockResolvedValue({
    content: 'Mock LLM response',
    usage: { tokens: 100 }
  }),
  analyzeRepository: jest.fn().mockResolvedValue('Mock repository analysis'),
  logInteraction: jest.fn().mockResolvedValue(),
  logError: jest.fn().mockResolvedValue(),
  ...overrides
});

export const createMockTechLeadAgent = (overrides = {}) => createMockAgent('tl', {
  execute: jest.fn().mockResolvedValue({
    technical_analysis: 'Mock technical analysis',
    summary: 'Mock TL summary',
    cost: 0.08,
    usage: { tokens: 150 }
  }),
  ...overrides
});

export const createMockInteractiveCLI = (overrides = {}) => ({
  start: jest.fn().mockResolvedValue(),
  handleInput: jest.fn().mockResolvedValue(),
  switchAgent: jest.fn().mockResolvedValue(),
  showStatus: jest.fn().mockResolvedValue(),
  exit: jest.fn().mockResolvedValue(),
  currentAgent: 'ba',
  sessionId: 'test-session-123',
  ...overrides
});

// Readline interface mocks for InteractiveCLI testing
export const createMockReadlineInterface = (overrides = {}) => ({
  question: jest.fn().mockImplementation((prompt, callback) => {
    callback('mocked user input');
  }),
  close: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  setPrompt: jest.fn(),
  prompt: jest.fn(),
  ...overrides
});

// File system mocks
export const createMockFS = () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('{}'),
  promises: {
    readFile: jest.fn().mockResolvedValue('{}'),
    writeFile: jest.fn().mockResolvedValue(),
    mkdir: jest.fn().mockResolvedValue(),
    access: jest.fn().mockResolvedValue()
  }
});

// Chalk mock for testing colored output
export const mockChalk = {
  cyan: jest.fn(str => str),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  blue: jest.fn(str => str),
  gray: jest.fn(str => str),
  white: jest.fn(str => str),
  bold: jest.fn(str => str),
  dim: jest.fn(str => str)
};

// UUID mock
export const mockUUID = {
  v4: jest.fn().mockReturnValue('test-uuid-123')
};