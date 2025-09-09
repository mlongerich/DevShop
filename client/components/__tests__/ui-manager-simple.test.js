import { describe, test, beforeEach, afterEach, expect, jest } from '@jest/globals';

describe('UIManager Simple Tests', () => {
  let UIManager;
  let uiManager;
  let originalConsole;
  
  beforeEach(async () => {
    const module = await import('../ui-manager.js');
    UIManager = module.UIManager;
    uiManager = new UIManager();
    
    // Mock console to avoid test noise
    originalConsole = console.log;
    console.log = jest.fn();
  });
  
  afterEach(() => {
    console.log = originalConsole;
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      expect(uiManager.multiAgentMode).toBe(false);
      expect(uiManager.verbose).toBe(false);
    });

    test('should initialize with custom options', () => {
      const customUI = new UIManager({
        multiAgent: true,
        verbose: true
      });
      
      expect(customUI.multiAgentMode).toBe(true);
      expect(customUI.verbose).toBe(true);
    });
  });

  describe('Display Methods', () => {
    test('should have displayHeader method', () => {
      expect(typeof uiManager.displayHeader).toBe('function');
      uiManager.displayHeader('test/repo');
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displayHelp method', () => {
      expect(typeof uiManager.displayHelp).toBe('function');
      uiManager.displayHelp();
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displayStatus method', () => {
      expect(typeof uiManager.displayStatus).toBe('function');
      const statusData = {
        sessionId: 'test',
        totalCost: 0.05,
        turnCount: 1,
        tokensUsed: 100
      };
      uiManager.displayStatus(statusData);
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displaySessionInfo method', () => {
      expect(typeof uiManager.displaySessionInfo).toBe('function');
      const sessionData = {
        sessionId: 'test-session',
        totalCost: 0.03,
        turnCount: 2,
        activeAgent: 'ba'
      };
      uiManager.displaySessionInfo(sessionData);
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displayAgentSwitch method', () => {
      expect(typeof uiManager.displayAgentSwitch).toBe('function');
      uiManager.displayAgentSwitch('ba', 'tl');
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displayBudgetWarning method', () => {
      expect(typeof uiManager.displayBudgetWarning).toBe('function');
      uiManager.displayBudgetWarning('token', 0.85);
      expect(console.log).toHaveBeenCalled();
    });

    test('should have displayConversationState method', () => {
      expect(typeof uiManager.displayConversationState).toBe('function');
      uiManager.displayConversationState('gathering');
      expect(console.log).toHaveBeenCalled();
    });

    test('should have message display methods', () => {
      expect(typeof uiManager.displayError).toBe('function');
      expect(typeof uiManager.displaySuccess).toBe('function');
      expect(typeof uiManager.displayInfo).toBe('function');
      expect(typeof uiManager.displayWarning).toBe('function');
      
      uiManager.displayError(new Error('test'));
      uiManager.displaySuccess('test');
      uiManager.displayInfo('test');
      uiManager.displayWarning('test');
      
      expect(console.log).toHaveBeenCalledTimes(4);
    });

    test('should have displayLLMResponse method', () => {
      expect(typeof uiManager.displayLLMResponse).toBe('function');
      uiManager.displayLLMResponse('test response', 'ba', { tokens: 100, cost: 0.02 });
      expect(console.log).toHaveBeenCalled();
    });

    test('should have utility display methods', () => {
      expect(typeof uiManager.displayLoading).toBe('function');
      expect(typeof uiManager.displayFinalizationPrompt).toBe('function');
      expect(typeof uiManager.displayConversationHints).toBe('function');
      expect(typeof uiManager.displaySessionSummary).toBe('function');
      expect(typeof uiManager.displayConversationModeInfo).toBe('function');
      expect(typeof uiManager.clearScreen).toBe('function');
      
      // Reset console mock before counting
      console.log.mockClear();
      
      uiManager.displayLoading('test');
      uiManager.displayFinalizationPrompt('ready_to_finalize');
      uiManager.displayConversationHints({ turnCount: 0 });
      uiManager.displaySessionSummary({ totalTurns: 5, totalCost: 0.1 });
      uiManager.displayConversationModeInfo();
      
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Multi-Agent Mode', () => {
    test('should handle multi-agent mode correctly', () => {
      const multiUI = new UIManager({ multiAgent: true });
      expect(multiUI.multiAgentMode).toBe(true);
      
      multiUI.displayHeader('test/repo');
      multiUI.displayHelp();
      
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Verbose Mode', () => {
    test('should handle verbose mode correctly', () => {
      const verboseUI = new UIManager({ verbose: true });
      expect(verboseUI.verbose).toBe(true);
      
      const error = new Error('test error');
      error.stack = 'test stack';
      verboseUI.displayError(error);
      
      verboseUI.displayLLMResponse('test', 'tl', { tokens: 100 });
      
      expect(console.log).toHaveBeenCalled();
    });
  });
});