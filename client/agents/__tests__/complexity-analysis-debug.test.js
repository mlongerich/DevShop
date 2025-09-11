import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { TechLeadAgent } from '../tech-lead-agent.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('Complexity Analysis Debug', () => {
  let techLeadAgent;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    techLeadAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
  });

  describe('Debug Question Classification', () => {
    test('should classify "Add unit tests to the static site" as simple', () => {
      const context = {
        businessRequirements: 'Add unit tests to the static site',
        featureDescription: ''
      };

      const result = techLeadAgent.analyzeQuestionComplexity(context);
      
      console.log('Question:', context.businessRequirements);
      console.log('Analysis Result:', result);
      console.log('Is Simple:', result.isSimple);
      console.log('Is Complex:', result.isComplex);
      console.log('Scope:', result.scope);
      
      // This should be simple but currently isn't
      expect(result.scope).toBe('simple');
    });

    test('should classify "What testing framework should we use?" as simple', () => {
      const context = {
        businessRequirements: 'What testing framework should we use?',
        featureDescription: ''
      };

      const result = techLeadAgent.analyzeQuestionComplexity(context);
      
      console.log('Question:', context.businessRequirements);
      console.log('Analysis Result:', result);
      
      // This should definitely be simple
      expect(result.scope).toBe('simple');
    });

    test('should classify "Should we use Jest or Vitest?" as simple', () => {
      const context = {
        businessRequirements: 'Should we use Jest or Vitest?',
        featureDescription: ''
      };

      const result = techLeadAgent.analyzeQuestionComplexity(context);
      
      console.log('Question:', context.businessRequirements);
      console.log('Analysis Result:', result);
      
      // This should definitely be simple
      expect(result.scope).toBe('simple');
    });

    test('should classify complex architectural question correctly', () => {
      const context = {
        businessRequirements: 'We need to completely redesign our architecture to support microservices and scale to millions of users',
        featureDescription: ''
      };

      const result = techLeadAgent.analyzeQuestionComplexity(context);
      
      console.log('Question:', context.businessRequirements);
      console.log('Analysis Result:', result);
      
      // This should be complex
      expect(result.scope).toBe('complex');
    });
  });
});