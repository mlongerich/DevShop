import { describe, test, beforeEach, expect, jest } from '@jest/globals';

// Simple test to verify InteractiveCLI can be imported and instantiated
describe('InteractiveCLI Basic Tests', () => {
  let mockConversationalAgent;
  let mockConversationManager;
  let mockSessionService;
  
  beforeEach(() => {
    // Create simple mocks
    mockConversationalAgent = {
      getName: jest.fn().mockReturnValue('ba-agent'),
      startConversation: jest.fn().mockResolvedValue({
        content: 'Welcome message',
        cost: 0.05
      })
    };
    
    mockConversationManager = {
      initializeConversation: jest.fn().mockResolvedValue(),
      getConversationState: jest.fn().mockResolvedValue({
        state: 'gathering',
        history: []
      })
    };
    
    mockSessionService = {
      logDir: '/tmp/test',
      createSession: jest.fn().mockReturnValue('test-session-123'),
      logInteraction: jest.fn().mockResolvedValue()
    };
  });

  test('should be importable', async () => {
    const { InteractiveCLI } = await import('../interactive-cli.js');
    expect(InteractiveCLI).toBeDefined();
  });

  test('should instantiate with basic options', async () => {
    const { InteractiveCLI } = await import('../interactive-cli.js');
    
    const cli = new InteractiveCLI(
      mockConversationalAgent,
      mockConversationManager,
      mockSessionService
    );
    
    expect(cli).toBeDefined();
    expect(cli.multiAgentMode).toBe(false);
    expect(cli.activeAgent).toBe('ba');
    expect(cli.totalCost).toBe(0);
    expect(cli.turnCount).toBe(0);
  });

  test('should have essential methods', async () => {
    const { InteractiveCLI } = await import('../interactive-cli.js');
    
    const cli = new InteractiveCLI(
      mockConversationalAgent,
      mockConversationManager,
      mockSessionService
    );
    
    expect(typeof cli.start).toBe('function');
    expect(typeof cli.displayHeader).toBe('function');
    expect(typeof cli.startNewSession).toBe('function');
    expect(typeof cli.resumeSession).toBe('function');
    expect(typeof cli.processUserInput).toBe('function');
    expect(typeof cli.handleSpecialCommands).toBe('function');
  });

  test('should initialize token budget', async () => {
    const { InteractiveCLI } = await import('../interactive-cli.js');
    
    const cli = new InteractiveCLI(
      mockConversationalAgent,
      mockConversationManager,
      mockSessionService
    );
    
    expect(cli.tokenBudget).toBeDefined();
    expect(cli.tokenBudget.sessionTokensUsed).toBe(0);
    expect(cli.tokenBudget.sessionCostUsed).toBe(0);
    expect(cli.tokenBudget.maxTokensPerSession).toBeDefined();
    expect(cli.tokenBudget.maxCostPerSession).toBeDefined();
    expect(cli.tokenBudget.warningThreshold).toBe(0.8);
  });

  test('should support multi-agent configuration', async () => {
    const { InteractiveCLI } = await import('../interactive-cli.js');
    
    const mockTechLeadAgent = {
      getName: jest.fn().mockReturnValue('tl-agent')
    };
    
    const cli = new InteractiveCLI(
      mockConversationalAgent,
      mockConversationManager,
      mockSessionService,
      {
        multiAgent: true,
        techLeadAgent: mockTechLeadAgent
      }
    );
    
    expect(cli.multiAgentMode).toBe(true);
    expect(cli.techLeadAgent).toBe(mockTechLeadAgent);
    expect(cli.activeAgent).toBe('ba');
  });
});