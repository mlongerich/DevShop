import { describe, test, beforeEach, expect } from '@jest/globals';
import { mockEnvironment } from '../../../tests/helpers/test-helpers.js';

describe('BudgetTracker', () => {
  let BudgetTracker;
  let budgetTracker;
  let cleanupEnv;
  
  beforeEach(async () => {
    // Set up environment
    cleanupEnv = mockEnvironment({
      MAX_TOKENS_PER_SESSION: '10000',
      MAX_COST_PER_SESSION: '5.00'
    });
    
    const module = await import('../budget-tracker.js');
    BudgetTracker = module.BudgetTracker;
    budgetTracker = new BudgetTracker();
  });
  
  afterEach(() => {
    cleanupEnv?.();
  });

  describe('Initialization', () => {
    test('should initialize with default values from environment', () => {
      expect(budgetTracker.sessionTokensUsed).toBe(0);
      expect(budgetTracker.sessionCostUsed).toBe(0);
      expect(budgetTracker.maxTokensPerSession).toBe(10000);
      expect(budgetTracker.maxCostPerSession).toBe(5.00);
      expect(budgetTracker.warningThreshold).toBe(0.8);
      expect(budgetTracker.extensions).toEqual([]);
    });

    test('should initialize with custom options', () => {
      const customTracker = new BudgetTracker({
        maxTokens: 20000,
        maxCost: 10.00,
        warningThreshold: 0.9
      });
      
      expect(customTracker.maxTokensPerSession).toBe(20000);
      expect(customTracker.maxCostPerSession).toBe(10.00);
      expect(customTracker.warningThreshold).toBe(0.9);
    });
  });

  describe('Usage Tracking', () => {
    test('should update token and cost usage', () => {
      budgetTracker.updateUsage(150, 0.08);
      
      expect(budgetTracker.sessionTokensUsed).toBe(150);
      expect(budgetTracker.sessionCostUsed).toBeCloseTo(0.08, 2);
    });

    test('should accumulate usage over multiple updates', () => {
      budgetTracker.updateUsage(100, 0.05);
      budgetTracker.updateUsage(50, 0.03);
      
      expect(budgetTracker.sessionTokensUsed).toBe(150);
      expect(budgetTracker.sessionCostUsed).toBeCloseTo(0.08, 2);
    });
  });

  describe('Limit Detection', () => {
    test('should detect approaching token limit', () => {
      // Set to 85% of limit (above warning threshold)
      budgetTracker.updateUsage(8500, 0);
      
      expect(budgetTracker.isApproachingTokenLimit()).toBe(true);
    });

    test('should not detect approaching token limit when below threshold', () => {
      // Set to 70% of limit (below warning threshold)
      budgetTracker.updateUsage(7000, 0);
      
      expect(budgetTracker.isApproachingTokenLimit()).toBe(false);
    });

    test('should detect approaching cost limit', () => {
      // Set to 85% of cost limit
      budgetTracker.updateUsage(0, 4.25);
      
      expect(budgetTracker.isApproachingCostLimit()).toBe(true);
    });

    test('should detect when token limit exceeded', () => {
      budgetTracker.updateUsage(15000, 0); // Exceed limit
      
      expect(budgetTracker.isTokenLimitExceeded()).toBe(true);
    });

    test('should detect when cost limit exceeded', () => {
      budgetTracker.updateUsage(0, 6.00); // Exceed limit
      
      expect(budgetTracker.isCostLimitExceeded()).toBe(true);
    });
  });

  describe('Utilization Calculations', () => {
    test('should calculate token utilization percentage', () => {
      budgetTracker.updateUsage(3000, 0);
      
      expect(budgetTracker.getTokenUtilization()).toBe(0.3);
    });

    test('should calculate cost utilization percentage', () => {
      budgetTracker.updateUsage(0, 2.5);
      
      expect(budgetTracker.getCostUtilization()).toBe(0.5);
    });
  });

  describe('Extensions Management', () => {
    test('should add budget extension', () => {
      budgetTracker.addExtension(5000, 2.50, 'User requested extension');
      
      expect(budgetTracker.extensions).toHaveLength(1);
      expect(budgetTracker.extensions[0]).toEqual({
        tokens: 5000,
        cost: 2.50,
        reason: 'User requested extension',
        timestamp: expect.any(String)
      });
      expect(budgetTracker.maxTokensPerSession).toBe(15000); // 10000 + 5000
      expect(budgetTracker.maxCostPerSession).toBe(7.50); // 5.00 + 2.50
    });

    test('should track multiple extensions', () => {
      budgetTracker.addExtension(2000, 1.00, 'First extension');
      budgetTracker.addExtension(3000, 1.50, 'Second extension');
      
      expect(budgetTracker.extensions).toHaveLength(2);
      expect(budgetTracker.maxTokensPerSession).toBe(15000); // 10000 + 2000 + 3000
      expect(budgetTracker.maxCostPerSession).toBe(7.50); // 5.00 + 1.00 + 1.50
    });
  });

  describe('Budget Status', () => {
    test('should return comprehensive budget status', () => {
      budgetTracker.updateUsage(3000, 2.5);
      budgetTracker.addExtension(1000, 0.5, 'Test extension');
      
      const status = budgetTracker.getStatus();
      
      expect(status).toEqual({
        tokensUsed: 3000,
        costUsed: 2.5,
        maxTokens: 11000, // 10000 + 1000 extension
        maxCost: 5.5, // 5.00 + 0.5 extension
        tokenUtilization: 3000 / 11000,
        costUtilization: 2.5 / 5.5,
        isApproachingTokenLimit: false,
        isApproachingCostLimit: false,
        isTokenLimitExceeded: false,
        isCostLimitExceeded: false,
        extensionsCount: 1,
        warningThreshold: 0.8
      });
    });
  });

  describe('State Management', () => {
    test('should reset usage to zero', () => {
      budgetTracker.updateUsage(5000, 2.5);
      budgetTracker.resetUsage();
      
      expect(budgetTracker.sessionTokensUsed).toBe(0);
      expect(budgetTracker.sessionCostUsed).toBe(0);
    });

    test('should clear extensions and reset limits', () => {
      budgetTracker.addExtension(1000, 0.5, 'Test');
      budgetTracker.clearExtensions();
      
      expect(budgetTracker.extensions).toEqual([]);
      expect(budgetTracker.maxTokensPerSession).toBe(10000); // Back to original
      expect(budgetTracker.maxCostPerSession).toBe(5.00); // Back to original
    });

    test('should export current state', () => {
      budgetTracker.updateUsage(1000, 0.5);
      budgetTracker.addExtension(2000, 1.0, 'Test extension');
      
      const state = budgetTracker.exportState();
      
      expect(state).toEqual({
        sessionTokensUsed: 1000,
        sessionCostUsed: 0.5,
        maxTokensPerSession: 12000,
        maxCostPerSession: 6.0,
        extensions: [{
          tokens: 2000,
          cost: 1.0,
          reason: 'Test extension',
          timestamp: expect.any(String)
        }],
        warningThreshold: 0.8,
        originalMaxTokens: 10000,
        originalMaxCost: 5.0
      });
    });

    test('should load state from conversation context', () => {
      const conversationContext = {
        tokenBudget: {
          sessionTokensUsed: 2000,
          sessionCostUsed: 1.0,
          extensions: [
            { tokens: 1000, cost: 0.5, reason: 'Previous extension', timestamp: '2023-01-01T00:00:00.000Z' }
          ]
        }
      };
      
      budgetTracker.loadFromConversationContext(conversationContext);
      
      expect(budgetTracker.sessionTokensUsed).toBe(2000);
      expect(budgetTracker.sessionCostUsed).toBe(1.0);
      expect(budgetTracker.extensions).toHaveLength(1);
      expect(budgetTracker.maxTokensPerSession).toBe(11000); // 10000 + 1000 from extension
      expect(budgetTracker.maxCostPerSession).toBe(5.5); // 5.0 + 0.5 from extension
    });
  });
});