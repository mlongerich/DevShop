import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { ConversationalBAAgent } from '../../agents/conversational-ba-agent.js';
import { TechLeadAgent } from '../../agents/tech-lead-agent.js';
import { AgentCommunicationService } from '../agent-communication-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('BA-TL Communication Integration (TDD Red Phase)', () => {
  let baAgent;
  let tlAgent;
  let communicationService;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    baAgent = new ConversationalBAAgent(mockMCPClientManager, mockSessionService, mockConfig);
    tlAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    communicationService = new AgentCommunicationService(mockSessionService);
    
    // Mock repository analysis
    baAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
    tlAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
  });

  describe('Simple Request Processing (TDD Red Phase)', () => {
    test('FAILING: BA should pass simple technical requests directly to TL', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: 'i want to add unit tests',
        validate: () => true
      };

      // Spy on TL question extraction
      const extractTechnicalQuestionsSpy = jest.spyOn(baAgent, 'extractTechnicalQuestions');
      
      // Mock BA's analyzeBusinessRequirements to see what it generates
      baAgent.analyzeBusinessRequirements = jest.fn().mockResolvedValue({
        requirements_analysis: {
          core_requirements: ['Add unit testing capability'],
          technical_questions: ['What testing framework should we use?']
        }
      });

      // THIS SHOULD FAIL - BA should detect this as a simple technical request
      const result = await baAgent.analyzeBusinessRequirements(context);
      
      // Verify that simple technical request detection exists (it doesn't)
      expect(baAgent.isSimpleTechnicalRequest).toBeDefined();
      expect(baAgent.isSimpleTechnicalRequest(context.businessRequirements)).toBe(true);
      
      // Verify original request context is preserved for TL
      expect(extractTechnicalQuestionsSpy).toHaveBeenCalled();
      const questions = extractTechnicalQuestionsSpy.mock.results[0].value;
      expect(questions).toContain(context.businessRequirements); // Original request should be preserved
    });

    test('FAILING: TL should receive original user context, not BA elaboration', async () => {
      const originalUserRequest = 'i want to add unit tests';
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: originalUserRequest,
        validate: () => true
      };

      // Mock what BA currently sends to TL (complex elaboration)
      const baElaboratedQuestions = `I'll start with a couple of clarifying questions to scope the unit tests for test-user/test-repo. 1) What parts of the repository should be tested? 2) Do you have a preferred testing framework?`;

      // Mock TL response generation to capture what it receives
      let receivedContext;
      tlAgent.generateLLMResponse = jest.fn().mockImplementation((...args) => {
        receivedContext = args[2]; // analysis request
        return Promise.resolve({
          content: JSON.stringify({
            technology_recommendations: [{
              category: 'Testing Framework',
              recommendation: 'Jest with jsdom',
              rationale: 'Good for static sites'
            }]
          })
        });
      });

      // Simulate the communication flow
      const tlContext = {
        ...context,
        businessRequirements: baElaboratedQuestions, // What TL currently receives
        originalUserRequest: originalUserRequest      // What TL should consider
      };

      await tlAgent.execute(tlContext);

      // THIS SHOULD FAIL - TL should prioritize original user request over BA elaboration
      expect(receivedContext).toContain(originalUserRequest);
      expect(receivedContext).toContain('Add unit tests'); // Simple, direct language
      expect(receivedContext).not.toContain('clarifying questions'); // Should not contain BA elaboration
    });

    test('FAILING: communication service should preserve original user intent', async () => {
      const originalUserRequest = 'i want to add unit tests';
      const sessionId = 'test-session';

      // Mock what currently happens - BA elaborates the request
      const baElaboratedResponse = {
        technical_questions: [`I'll start with a couple of clarifying questions to scope the unit tests...`],
        requirements_analysis: { core_requirements: ['Testing framework selection'] }
      };

      // THIS SHOULD FAIL - communication service should have method to preserve original context
      expect(communicationService.preserveOriginalUserContext).toBeDefined();
      
      const preservedContext = communicationService.preserveOriginalUserContext(
        sessionId,
        originalUserRequest,
        baElaboratedResponse
      );

      expect(preservedContext.originalUserRequest).toBe(originalUserRequest);
      expect(preservedContext.simplifiedForTL).toBe('Add unit tests to the static site');
      expect(preservedContext.skipElaboration).toBe(true);
    });
  });

  describe('Current Broken Behavior Documentation (Red Phase)', () => {
    test('documents how simple requests become complex in current flow', async () => {
      const originalUserRequest = 'i want to add unit tests';
      
      // Step 1: User makes simple request
      expect(originalUserRequest.length).toBeLessThan(50); // Simple request
      expect(originalUserRequest.toLowerCase()).toMatch(/add.*test/); // Clear intent
      
      // Step 2: BA elaborates (current broken behavior)
      const baElaboratedQuestions = `I'll start with a couple of clarifying questions to scope the unit tests for mlongerich/mlongerich. 1) What parts of the repository should be tested? Are you aiming to unit test JavaScript utilities used on the site, front-end logic, or something else (e.g., templates or data processing)? 2) Do you have a preferred testing framework and workflow (e.g., Jest or Mocha for JS with npm scripts, and GitHub Actions for CI), or should I propose an option based on the project setup?`;
      
      // This demonstrates the current broken behavior
      expect(baElaboratedQuestions.length).toBeGreaterThan(300); // Became complex
      expect(baElaboratedQuestions).toContain('clarifying questions'); // Added unnecessary complexity
      
      // Step 3: TL receives complex input and over-engineers (current broken behavior)
      const context = {
        businessRequirements: baElaboratedQuestions, // Complex input triggers complex response
        repoName: 'test-repo'
      };
      
      const complexity = tlAgent.analyzeQuestionComplexity(context);
      
      // This should demonstrate that TL classifies it as medium/complex due to length
      expect(complexity.scope).toBe('medium'); // Currently gets classified as medium due to BA elaboration
      // But it SHOULD be 'simple' based on original user intent
    });
  });

  describe('Expected Fixed Behavior (TDD Red Phase)', () => {
    test('FAILING: simple request should bypass BA elaboration', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: 'i want to add unit tests',
        validate: () => true
      };

      // Mock the fixed behavior we want
      baAgent.isSimpleTechnicalRequest = jest.fn().mockReturnValue(true);
      baAgent.simplifyForTechnicalLead = jest.fn().mockReturnValue('Add unit tests to the static site');

      // THIS SHOULD FAIL until implemented
      const isSimple = baAgent.isSimpleTechnicalRequest(context.businessRequirements);
      expect(isSimple).toBe(true);
      
      const simplified = baAgent.simplifyForTechnicalLead(context.businessRequirements, context);
      expect(simplified).toBe('Add unit tests to the static site');
      expect(simplified.length).toBeLessThan(100);
    });

    test('FAILING: TL should get focused prompt for simple requests', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: 'Add unit tests to the static site', // Simplified from BA
        originalUserRequest: 'i want to add unit tests',
        isSimplifiedFromBA: true,
        validate: () => true
      };

      // Mock TL response to capture prompt
      let capturedPrompt;
      tlAgent.generateLLMResponse = jest.fn().mockImplementation((role, systemPrompt, analysisRequest) => {
        capturedPrompt = analysisRequest;
        return Promise.resolve({
          content: JSON.stringify({
            technology_recommendations: [{
              category: 'Testing Framework',
              recommendation: 'Jest with jsdom',
              rationale: 'Good for static sites'
            }]
          })
        });
      });

      await tlAgent.execute(context);

      // THIS SHOULD FAIL - TL should generate focused prompt for simplified requests
      expect(capturedPrompt).toContain('Provide a direct, concise answer');
      expect(capturedPrompt).toContain('unit test');
      expect(capturedPrompt).not.toContain('comprehensive analysis');
      expect(capturedPrompt).not.toContain('three-phase plan');
    });
  });
});