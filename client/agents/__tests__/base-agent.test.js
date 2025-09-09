import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('BaseAgent', () => {
  let BaseAgent;
  let AgentResult;
  let mockMCPClientManager;
  let mockSessionService;
  
  beforeEach(async () => {
    // Dynamic import to avoid module loading issues
    const module = await import('../base-agent.js');
    BaseAgent = module.BaseAgent;
    AgentResult = module.AgentResult;
    
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
  });

  describe('Abstract Class Behavior', () => {
    test('should not allow direct instantiation', () => {
      expect(() => new BaseAgent(mockMCPClientManager, mockSessionService))
        .toThrow('BaseAgent is an abstract class and cannot be instantiated directly');
    });
  });

  describe('Concrete Implementation Requirements', () => {
    let ConcreteAgent;
    let agent;
    
    beforeEach(() => {
      // Create a concrete implementation for testing
      ConcreteAgent = class extends BaseAgent {
        getName() { return 'test-agent'; }
        getDescription() { return 'Test agent for unit testing'; }
        async execute(context) { return { result: 'executed' }; }
        validateContext(context) { return true; }
      };
      
      agent = new ConcreteAgent(mockMCPClientManager, mockSessionService);
    });

    test('should instantiate concrete implementation', () => {
      expect(agent).toBeInstanceOf(BaseAgent);
      expect(agent).toBeInstanceOf(ConcreteAgent);
    });

    test('should have required dependencies injected', () => {
      expect(agent.mcpClientManager).toBe(mockMCPClientManager);
      expect(agent.sessionService).toBe(mockSessionService);
    });

    test('should implement required methods', () => {
      expect(agent.getName()).toBe('test-agent');
      expect(agent.getDescription()).toBe('Test agent for unit testing');
      expect(typeof agent.execute).toBe('function');
      expect(typeof agent.validateContext).toBe('function');
    });

    test('should execute successfully', async () => {
      const context = { test: 'context' };
      const result = await agent.execute(context);
      expect(result).toEqual({ result: 'executed' });
    });

    test('should validate context', () => {
      const context = { test: 'context' };
      const isValid = agent.validateContext(context);
      expect(isValid).toBe(true);
    });
  });

  describe('Abstract Method Enforcement', () => {
    let IncompleteAgent;
    
    beforeEach(() => {
      // Create an incomplete implementation missing required methods
      IncompleteAgent = class extends BaseAgent {};
    });

    test('should throw error for unimplemented getName', () => {
      const agent = new IncompleteAgent(mockMCPClientManager, mockSessionService);
      expect(() => agent.getName()).toThrow('getName() must be implemented by subclass');
    });

    test('should throw error for unimplemented getDescription', () => {
      const agent = new IncompleteAgent(mockMCPClientManager, mockSessionService);
      expect(() => agent.getDescription()).toThrow('getDescription() must be implemented by subclass');
    });

    test('should throw error for unimplemented execute', async () => {
      const agent = new IncompleteAgent(mockMCPClientManager, mockSessionService);
      await expect(agent.execute({})).rejects.toThrow('execute() must be implemented by subclass');
    });

    test('should throw error for unimplemented validateContext', () => {
      const agent = new IncompleteAgent(mockMCPClientManager, mockSessionService);
      expect(() => agent.validateContext({})).toThrow('validateContext() must be implemented by subclass');
    });
  });

  describe('BaseAgent Utility Methods', () => {
    let ConcreteAgent;
    let agent;
    
    beforeEach(() => {
      ConcreteAgent = class extends BaseAgent {
        getName() { return 'test-agent'; }
        getDescription() { return 'Test agent'; }
        async execute(context) { return { result: 'executed' }; }
        validateContext(context) { return true; }
      };
      
      agent = new ConcreteAgent(mockMCPClientManager, mockSessionService);
    });

    test('should have logInteraction method', () => {
      expect(typeof agent.logInteraction).toBe('function');
    });

    test('should have logError method', () => {
      expect(typeof agent.logError).toBe('function');
    });

    test('should have ensureContextMethods method', () => {
      expect(typeof agent.ensureContextMethods).toBe('function');
    });

    test('should have generateLLMResponse method', () => {
      expect(typeof agent.generateLLMResponse).toBe('function');
    });

    test('should have analyzeRepository method', () => {
      expect(typeof agent.analyzeRepository).toBe('function');
    });

    test('should have createRepositoryIssue method', () => {
      expect(typeof agent.createRepositoryIssue).toBe('function');
    });
  });

  describe('Context Method Enhancement', () => {
    let ConcreteAgent;
    let agent;
    
    beforeEach(() => {
      ConcreteAgent = class extends BaseAgent {
        getName() { return 'test-agent'; }
        getDescription() { return 'Test agent'; }
        async execute(context) { return { result: 'executed' }; }
        validateContext(context) { return true; }
      };
      
      agent = new ConcreteAgent(mockMCPClientManager, mockSessionService);
    });

    test('should enhance context with required methods', () => {
      const basicContext = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };
      
      const enhancedContext = agent.ensureContextMethods(basicContext);
      
      expect(enhancedContext).toHaveProperty('getRepository');
      expect(typeof enhancedContext.getRepository).toBe('function');
      expect(enhancedContext.getRepository()).toBe('test-owner/test-repo');
    });

    test('should preserve existing context properties', () => {
      const basicContext = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        customProperty: 'custom-value'
      };
      
      const enhancedContext = agent.ensureContextMethods(basicContext);
      
      expect(enhancedContext.repoOwner).toBe('test-owner');
      expect(enhancedContext.repoName).toBe('test-repo');
      expect(enhancedContext.sessionId).toBe('test-session');
      expect(enhancedContext.customProperty).toBe('custom-value');
    });
  });

  describe('Model Configuration', () => {
    let ConcreteAgent;
    let agent;
    
    beforeEach(() => {
      ConcreteAgent = class extends BaseAgent {
        getName() { return 'test-agent'; }
        getDescription() { return 'Test agent'; }
        async execute(context) { return { result: 'executed' }; }
        validateContext(context) { return true; }
      };
      
      agent = new ConcreteAgent(mockMCPClientManager, mockSessionService);
    });

    test('should have getModelForAgent instance method', () => {
      expect(typeof agent.getModelForAgent).toBe('function');
    });

    test('should return model for agent role', () => {
      // Mock environment variable
      process.env.OPENAI_BA_MODEL = 'gpt-4';
      
      const model = agent.getModelForAgent('ba');
      expect(model).toBe('gpt-4');
      
      // Cleanup
      delete process.env.OPENAI_BA_MODEL;
    });

    test('should have AgentResult class available', () => {
      expect(AgentResult).toBeDefined();
      expect(typeof AgentResult).toBe('function');
    });

    test('should create AgentResult success response', () => {
      const response = AgentResult.success({ test: 'data' }, 'Test success');
      expect(response.success).toBe(true);
      expect(response.message).toBe('Test success');
      expect(response.data).toEqual({ test: 'data' });
      expect(response.timestamp).toBeDefined();
    });

    test('should create AgentResult error response', () => {
      const response = AgentResult.error('Test error', { error: 'details' });
      expect(response.success).toBe(false);
      expect(response.message).toBe('Test error');
      expect(response.data).toEqual({ error: 'details' });
      expect(response.timestamp).toBeDefined();
    });

    test('should create AgentResult instance', () => {
      const result = new AgentResult(true, { test: 'data' }, 'Test message');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'data' });
      expect(result.message).toBe('Test message');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    let ConcreteAgent;
    let agent;
    
    beforeEach(() => {
      ConcreteAgent = class extends BaseAgent {
        getName() { return 'test-agent'; }
        getDescription() { return 'Test agent'; }
        async execute(context) { return { result: 'executed' }; }
        validateContext(context) { return true; }
      };
      
      agent = new ConcreteAgent(mockMCPClientManager, mockSessionService);
    });

    test('should log errors with context', async () => {
      const error = new Error('Test error');
      const context = { test: 'context' };
      
      // Mock sessionService.logError
      mockSessionService.logError = jest.fn().mockResolvedValue();
      
      await agent.logError(error, context);
      
      expect(mockSessionService.logError).toHaveBeenCalledWith(
        error,
        expect.objectContaining(context)
      );
    });

    test('should log interactions', async () => {
      const interaction = 'test_interaction';
      const message = 'Test message';
      const metadata = { key: 'value' };
      
      await agent.logInteraction(interaction, message, metadata);
      
      expect(mockSessionService.logInteraction).toHaveBeenCalledWith(
        interaction,
        message,
        expect.objectContaining({
          key: 'value',
          agent: 'test-agent'
        })
      );
    });
  });
});