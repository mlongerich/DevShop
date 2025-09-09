import { describe, test, beforeEach, afterEach, expect, jest } from '@jest/globals';

describe('SessionManager Tests', () => {
  let SessionManager;
  let sessionManager;
  let mockSessionService;
  let mockConversationManager;
  let originalConsole;

  beforeEach(async () => {
    const module = await import('../session-manager.js');
    SessionManager = module.SessionManager;

    // Create mock services
    mockSessionService = {
      createSession: jest.fn().mockReturnValue('test-session-123'),
      logInteraction: jest.fn().mockResolvedValue()
    };

    mockConversationManager = {
      initializeConversation: jest.fn().mockResolvedValue(),
      conversationExists: jest.fn().mockResolvedValue(true),
      getConversationContext: jest.fn().mockResolvedValue({
        totalCost: 0.25,
        turnCount: 5,
        tokenBudget: {
          sessionTokensUsed: 1000,
          sessionCostUsed: 0.25,
          extensions: []
        }
      }),
      formatConversationHistory: jest.fn().mockResolvedValue('Mock conversation history'),
      formatMultiAgentConversationHistory: jest.fn().mockResolvedValue('Mock multi-agent history')
    };

    sessionManager = new SessionManager(mockSessionService, mockConversationManager);

    // Mock console to avoid test noise
    originalConsole = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsole;
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      expect(sessionManager.verbose).toBe(false);
      expect(sessionManager.currentSession).toBe(null);
      expect(sessionManager.totalCost).toBe(0);
      expect(sessionManager.turnCount).toBe(0);
    });

    test('should initialize with custom options', () => {
      const customManager = new SessionManager(mockSessionService, mockConversationManager, {
        verbose: true
      });

      expect(customManager.verbose).toBe(true);
      expect(customManager.sessionService).toBe(mockSessionService);
      expect(customManager.conversationManager).toBe(mockConversationManager);
    });
  });

  describe('Session Creation', () => {
    test('should start new session in single-agent mode', async () => {
      const result = await sessionManager.startNewSession('test-owner', 'test-repo', false);

      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        'interactive-ba',
        'Interactive BA conversation for test-owner/test-repo'
      );
      expect(result.sessionId).toBe('test-session-123');
      expect(result.context.repoOwner).toBe('test-owner');
      expect(result.context.repoName).toBe('test-repo');
      expect(result.context.getRepository()).toBe('test-owner/test-repo');
      expect(sessionManager.currentSession.sessionId).toBe('test-session-123');
    });

    test('should start new session in multi-agent mode', async () => {
      const result = await sessionManager.startNewSession('test-owner', 'test-repo', true);

      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        'interactive-multi-agent',
        'Interactive multi-agent conversation for test-owner/test-repo'
      );
      expect(mockConversationManager.initializeConversation).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          sessionId: 'test-session-123',
          repoOwner: 'test-owner',
          repoName: 'test-repo'
        }),
        'multi'
      );
    });

    test('should reset session counters on new session', async () => {
      // Set some existing values
      sessionManager.totalCost = 1.5;
      sessionManager.turnCount = 10;

      await sessionManager.startNewSession('test-owner', 'test-repo');

      expect(sessionManager.totalCost).toBe(0);
      expect(sessionManager.turnCount).toBe(0);
    });
  });

  describe('Session Resuming', () => {
    test('should resume existing session successfully', async () => {
      const result = await sessionManager.resumeSession('existing-session', 'test-owner', 'test-repo');

      expect(mockConversationManager.conversationExists).toHaveBeenCalledWith('existing-session');
      expect(mockConversationManager.getConversationContext).toHaveBeenCalledWith('existing-session');
      expect(result.sessionId).toBe('existing-session');
      expect(sessionManager.currentSession.sessionId).toBe('existing-session');
      expect(sessionManager.totalCost).toBe(0.25);
      expect(sessionManager.turnCount).toBe(5);
    });

    test('should throw error if session does not exist', async () => {
      mockConversationManager.conversationExists.mockResolvedValue(false);

      await expect(sessionManager.resumeSession('non-existent', 'test-owner', 'test-repo'))
        .rejects.toThrow('Session non-existent not found. Start a new session without --session flag.');
    });

    test('should handle missing context data gracefully', async () => {
      mockConversationManager.getConversationContext.mockResolvedValue({});

      const result = await sessionManager.resumeSession('existing-session', 'test-owner', 'test-repo');

      expect(result.sessionId).toBe('existing-session');
      expect(sessionManager.totalCost).toBe(0);
      expect(sessionManager.turnCount).toBe(0);
    });
  });

  describe('Session State Management', () => {
    test('should update session state', () => {
      sessionManager.updateSessionState(2.5, 15);

      expect(sessionManager.totalCost).toBe(2.5);
      expect(sessionManager.turnCount).toBe(15);
    });

    test('should create session context', () => {
      const context = sessionManager.createSessionContext('owner', 'repo', 'session-123');

      expect(context).toEqual({
        repoOwner: 'owner',
        repoName: 'repo',
        sessionId: 'session-123',
        getRepository: expect.any(Function)
      });
      expect(context.getRepository()).toBe('owner/repo');
    });

    test('should get current session', async () => {
      expect(sessionManager.getCurrentSession()).toBe(null);

      await sessionManager.startNewSession('test-owner', 'test-repo');
      const current = sessionManager.getCurrentSession();

      expect(current).not.toBe(null);
      expect(current.sessionId).toBe('test-session-123');
    });
  });

  describe('Session Display Methods', () => {
    test('should get session ID display', async () => {
      expect(sessionManager.getSessionIdDisplay()).toBe('No session');

      await sessionManager.startNewSession('test-owner', 'test-repo');
      expect(sessionManager.getSessionIdDisplay()).toBe('test-ses...');
      expect(sessionManager.getSessionIdDisplay(4)).toBe('test...');
    });

    test('should get session usage', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(1.25, 8);

      const usage = sessionManager.getSessionUsage();
      expect(usage).toEqual({
        totalCost: 1.25,
        turnCount: 8,
        sessionId: 'test-session-123'
      });
    });

    test('should display session info with no session', () => {
      sessionManager.displaySessionInfo();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No active session'));
    });

    test('should display session info in single-agent mode', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(0.15, 3);

      sessionManager.displaySessionInfo();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Session: test-ses... | Cost: $0.1500 | Turns: 3')
      );
    });

    test('should display session info in multi-agent mode', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(0.15, 3);

      sessionManager.displaySessionInfo(true, 'tl');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('🏗️ TL')
      );
    });
  });

  describe('Conversation History', () => {
    test('should display conversation history in single-agent mode', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');

      await sessionManager.displayConversationHistory();
      expect(mockConversationManager.formatConversationHistory).toHaveBeenCalledWith('test-session-123', false);
      expect(console.log).toHaveBeenCalledWith('Mock conversation history');
    });

    test('should display conversation history in multi-agent mode', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');

      await sessionManager.displayConversationHistory(null, true);
      expect(mockConversationManager.formatMultiAgentConversationHistory).toHaveBeenCalledWith('test-session-123', false, true);
      expect(console.log).toHaveBeenCalledWith('Mock multi-agent history');
    });

    test('should handle missing session for history', async () => {
      await sessionManager.displayConversationHistory();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No session available'));
    });

    test('should handle history errors gracefully', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      mockConversationManager.formatConversationHistory.mockRejectedValue(new Error('History error'));

      await sessionManager.displayConversationHistory();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed to load conversation history'));
    });
  });

  describe('Session Logging', () => {
    beforeEach(async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(0.5, 2);
    });

    test('should log user interaction', async () => {
      await sessionManager.logUserInteraction('test input', 'ba', false);

      expect(mockSessionService.logInteraction).toHaveBeenCalledWith(
        'user_input',
        'test input',
        {
          session_id: 'test-session-123',
          agent_mode: 'single-agent',
          active_agent: 'ba',
          turn_count: 3
        }
      );
    });

    test('should log user interaction in multi-agent mode', async () => {
      await sessionManager.logUserInteraction('test input', 'tl', true);

      expect(mockSessionService.logInteraction).toHaveBeenCalledWith(
        'user_input',
        'test input',
        expect.objectContaining({
          agent_mode: 'multi-agent',
          active_agent: 'tl'
        })
      );
    });

    test('should log agent response', async () => {
      await sessionManager.logAgentResponse('test response', 'ba', 'Business Analyst', { cost: 0.05, tokens: 100 });

      expect(mockSessionService.logInteraction).toHaveBeenCalledWith(
        'agent_response',
        'test response',
        {
          session_id: 'test-session-123',
          agent_type: 'ba',
          agent_name: 'Business Analyst',
          cost: 0.05,
          tokens: 100,
          turn_count: 2
        }
      );
    });

    test('should log agent error', async () => {
      await sessionManager.logAgentError('tl', 'Test error message', 'user input', { extra: 'context' });

      expect(mockSessionService.logInteraction).toHaveBeenCalledWith(
        'tl_error',
        'Test error message',
        expect.objectContaining({
          session_id: 'test-session-123',
          agent_type: 'tl',
          user_input: 'user input',
          extra: 'context',
          timestamp: expect.any(String)
        })
      );
    });

    test('should not log if no session service', async () => {
      const noServiceManager = new SessionManager(null, mockConversationManager);
      await noServiceManager.startNewSession('test-owner', 'test-repo');

      await noServiceManager.logUserInteraction('test', 'ba');
      // Should not throw and mockSessionService should not be called
      expect(mockSessionService.logInteraction).not.toHaveBeenCalled();
    });
  });

  describe('Session Display Messages', () => {
    test('should display session farewell', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');

      sessionManager.displaySessionFarewell();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Session test-ses... has been saved.')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('npm run logs --session=test-session-123')
      );
    });

    test('should not display farewell without session', () => {
      sessionManager.displaySessionFarewell();
      // Should not call console.log when no session
      expect(console.log).not.toHaveBeenCalled();
    });

    test('should display session summary', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(1.25, 8);

      sessionManager.displaySessionSummary();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Conversation ended'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-session-123'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$1.2500 (8 turns)'));
    });

    test('should display no session message for summary', () => {
      sessionManager.displaySessionSummary();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No active session'));
    });
  });

  describe('Session Utilities', () => {
    test('should check if session is active', async () => {
      expect(sessionManager.hasActiveSession()).toBe(false);

      await sessionManager.startNewSession('test-owner', 'test-repo');
      expect(sessionManager.hasActiveSession()).toBe(true);
    });

    test('should get repository string', async () => {
      expect(sessionManager.getRepositoryString()).toBe(null);

      await sessionManager.startNewSession('test-owner', 'test-repo');
      expect(sessionManager.getRepositoryString()).toBe('test-owner/test-repo');
    });

    test('should clear session', async () => {
      await sessionManager.startNewSession('test-owner', 'test-repo');
      sessionManager.updateSessionState(2.0, 10);

      expect(sessionManager.hasActiveSession()).toBe(true);

      sessionManager.clearSession();
      expect(sessionManager.hasActiveSession()).toBe(false);
      expect(sessionManager.totalCost).toBe(0);
      expect(sessionManager.turnCount).toBe(0);
    });
  });
});