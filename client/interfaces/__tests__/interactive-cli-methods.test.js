import { describe, test, beforeEach, expect, jest } from '@jest/globals';

describe('InteractiveCLI Methods Tests', () => {
  
  describe('Initial Input Handling', () => {
    test('should accept initial input parameter in start method', async () => {
      // This test will fail until we implement the feature
      const mockAgent = {
        startConversation: jest.fn().mockResolvedValue({
          response: 'Initial response',
          cost: 0.01,
          turnCount: 1
        })
      };
      
      const mockSessionManager = {
        startNewSession: jest.fn().mockResolvedValue({
          context: { repoOwner: 'test', repoName: 'repo' }
        }),
        updateSessionState: jest.fn()
      };
      
      const mockUIManager = {
        displayHeader: jest.fn()
      };
      
      const InteractiveCLI = (await import('../interactive-cli.js')).InteractiveCLI;
      const cli = new InteractiveCLI(mockAgent, null, null);
      
      // Override components for testing
      cli.sessionManager = mockSessionManager;
      cli.uiManager = mockUIManager;
      cli.displayBAResponse = jest.fn();
      cli.displaySessionInfo = jest.fn();
      cli.conversationLoop = jest.fn();
      
      // Mock readline
      cli.rl = { close: jest.fn() };
      
      const initialInput = "I want to add unit tests";
      
      // This should NOT throw an error when we pass initial input
      await expect(cli.start('test/repo', null, initialInput)).resolves.not.toThrow();
      
      // The agent should receive context with the initial input
      expect(mockAgent.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          initialInput: expect.stringContaining(initialInput)
        })
      );
    });
  });

  let InteractiveCLI;
  let cli;
  let mockConversationalAgent;
  let mockConversationManager;
  let mockSessionService;
  
  beforeEach(async () => {
    // Dynamic import to avoid module loading issues
    const module = await import('../interactive-cli.js');
    InteractiveCLI = module.InteractiveCLI;
    
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
    
    cli = new InteractiveCLI(
      mockConversationalAgent,
      mockConversationManager,
      mockSessionService
    );
  });

  describe('Token Budget Management', () => {
    test('should update token budget', () => {
      const initialTokens = cli.tokenBudget.sessionTokensUsed;
      const initialCost = cli.tokenBudget.sessionCostUsed;
      
      cli.updateTokenBudget(100, 0.05);
      
      expect(cli.tokenBudget.sessionTokensUsed).toBe(initialTokens + 100);
      expect(cli.tokenBudget.sessionCostUsed).toBeCloseTo(initialCost + 0.05, 2);
    });

    test('should detect approaching token limit', () => {
      // Use public API instead of directly setting properties
      cli.updateTokenBudget(8500, 0); // 85% of default 10000
      
      expect(cli.isApproachingTokenLimit()).toBe(true);
    });

    test('should detect approaching cost limit', () => {
      // Use public API instead of directly setting properties
      cli.updateTokenBudget(0, 4.25); // 85% of default 5.00
      
      expect(cli.isApproachingCostLimit()).toBe(true);
    });

    test('should calculate utilization percentages', () => {
      // Use public API instead of directly setting properties
      cli.updateTokenBudget(3000, 2.5);
      
      expect(cli.getTokenUtilization()).toBe(0.3);
      expect(cli.getCostUtilization()).toBe(0.5);
    });
  });

  describe('Agent Management', () => {
    test('should get current agent in single mode', () => {
      const currentAgent = cli.getCurrentAgent();
      expect(currentAgent).toBe(mockConversationalAgent);
    });

    test('should switch agents in multi-agent mode', async () => {
      const mockTechLeadAgent = {
        getName: jest.fn().mockReturnValue('tl-agent')
      };
      
      cli.multiAgentMode = true;
      cli.techLeadAgent = mockTechLeadAgent;
      
      expect(cli.activeAgent).toBe('ba');
      
      await cli.switchAgent('tl');
      expect(cli.activeAgent).toBe('tl');
      
      await cli.switchAgent('ba');
      expect(cli.activeAgent).toBe('ba');
    });

    test('should not switch agents in single mode', async () => {
      cli.multiAgentMode = false;
      expect(cli.activeAgent).toBe('ba');
      
      await cli.switchAgent('tl');
      expect(cli.activeAgent).toBe('ba'); // Should remain unchanged
    });

    test('should get tech lead agent when active', () => {
      const mockTechLeadAgent = {
        getName: jest.fn().mockReturnValue('tl-agent')
      };
      
      cli.multiAgentMode = true;
      cli.techLeadAgent = mockTechLeadAgent;
      cli.activeAgent = 'tl';
      
      const currentAgent = cli.getCurrentAgent();
      expect(currentAgent).toBe(mockTechLeadAgent);
    });
  });

  describe('Session Context', () => {
    test('should create session context', () => {
      const context = cli.createSessionContext('test-owner', 'test-repo', 'session-123');
      
      expect(context).toEqual({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'session-123',
        getRepository: expect.any(Function)
      });
      
      expect(context.getRepository()).toBe('test-owner/test-repo');
    });
  });

  describe('Special Commands', () => {
    test('should handle help command', async () => {
      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = jest.fn();
      
      const result = await cli.handleSpecialCommand('help');
      
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalled();
      
      console.log = originalLog;
    });

    test('should handle status command', async () => {
      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = jest.fn();
      
      const result = await cli.handleSpecialCommand('status');
      
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalled();
      
      console.log = originalLog;
    });

    test('should handle exit command', async () => {
      const result = await cli.handleSpecialCommand('exit');
      expect(result).toBe('exit');
    });

    test('should not handle unknown commands', async () => {
      const result = await cli.handleSpecialCommand('unknown');
      expect(result).toBe(false);
    });

    test('should handle switch command in multi-agent mode', async () => {
      const mockTechLeadAgent = {
        getName: jest.fn().mockReturnValue('tl-agent')
      };
      
      cli.multiAgentMode = true;
      cli.techLeadAgent = mockTechLeadAgent;
      cli.activeAgent = 'ba';
      
      // Mock console.log
      const originalLog = console.log;
      console.log = jest.fn();
      
      const result = await cli.handleSpecialCommand('switch');
      
      expect(result).toBe(true);
      expect(cli.activeAgent).toBe('tl');
      expect(console.log).toHaveBeenCalled();
      
      console.log = originalLog;
    });

    test('should handle @ba agent command', async () => {
      const mockTechLeadAgent = {
        getName: jest.fn().mockReturnValue('tl-agent')
      };
      
      cli.multiAgentMode = true;
      cli.techLeadAgent = mockTechLeadAgent;
      cli.activeAgent = 'tl';
      
      // Mock processUserInput to avoid recursive calls
      cli.processUserInput = jest.fn().mockResolvedValue(true);
      
      const result = await cli.handleSpecialCommand('@ba test message');
      
      expect(result).toBe(true);
      expect(cli.activeAgent).toBe('ba');
      expect(cli.processUserInput).toHaveBeenCalledWith('test message');
    });

    test('should handle @tl agent command', async () => {
      const mockTechLeadAgent = {
        getName: jest.fn().mockReturnValue('tl-agent')
      };
      
      cli.multiAgentMode = true;
      cli.techLeadAgent = mockTechLeadAgent;
      cli.activeAgent = 'ba';
      
      // Mock processUserInput to avoid recursive calls
      cli.processUserInput = jest.fn().mockResolvedValue(true);
      
      const result = await cli.handleSpecialCommand('@tl technical question');
      
      expect(result).toBe(true);
      expect(cli.activeAgent).toBe('tl');
      expect(cli.processUserInput).toHaveBeenCalledWith('technical question');
    });
  });

  describe('Display Methods', () => {
    test('should have displayHelp method', () => {
      expect(typeof cli.displayHelp).toBe('function');
    });

    test('should have displayStatus method', () => {
      expect(typeof cli.displayStatus).toBe('function');
    });

    test('should have displayHeader method', () => {
      expect(typeof cli.displayHeader).toBe('function');
    });

    test('should have displaySessionInfo method', () => {
      expect(typeof cli.displaySessionInfo).toBe('function');
    });
  });
});