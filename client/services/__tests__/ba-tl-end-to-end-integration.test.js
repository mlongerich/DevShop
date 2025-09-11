import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { ConversationalBAAgent } from '../../agents/conversational-ba-agent.js';
import { TechLeadAgent } from '../../agents/tech-lead-agent.js';
import { TLCommand } from '../../commands/tl-command.js';
import { AgentCommunicationService } from '../agent-communication-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('BA-TL End-to-End Integration Fix Validation (TDD Blue Phase)', () => {
  let baAgent;
  let tlAgent;
  let tlCommand;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    // Mock config service for TL command
    const mockConfigService = {
      getConfig: () => mockConfig
    };
    
    baAgent = new ConversationalBAAgent(mockMCPClientManager, mockSessionService, mockConfig);
    tlAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    tlCommand = new TLCommand(mockConfigService, mockSessionService, mockMCPClientManager);
    
    // Mock repository analysis
    baAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
    tlAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
    
    // Set up TL command in BA agent for real integration
    baAgent.tlCommand = tlCommand;
  });

  describe('Fixed Simple Request Flow (Blue Phase)', () => {
    test('simple request "i want to add unit tests" should get direct TL answer', async () => {
      const originalUserRequest = 'i want to add unit tests';
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: originalUserRequest,
        validate: () => true
      };

      // Mock conversation context with user request
      const conversationContext = {
        sessionId: 'test-session',
        repository: 'test-user/test-repo',
        history: [
          { speaker: 'user', message: originalUserRequest, timestamp: new Date() }
        ]
      };

      // Step 1: Verify BA detects this as simple technical request
      const isSimple = baAgent.isSimpleTechnicalRequest(originalUserRequest);
      expect(isSimple).toBe(true);

      // Step 2: Verify BA simplifies the request correctly
      const simplified = baAgent.simplifyForTechnicalLead(originalUserRequest, { repoName: 'test-repo' });
      expect(simplified).toBe('Add unit tests to the test-repo static site');
      expect(simplified.length).toBeLessThan(100);

      // Step 3: Verify extractTechnicalQuestions uses simplified version
      const extractedQuestions = baAgent.extractTechnicalQuestions('BA response about testing', conversationContext);
      expect(extractedQuestions).toBe('Add unit tests to the test-repo static site');
      expect(extractedQuestions).not.toContain('clarifying questions');

      // Step 4: Mock TL Command execution to verify context passing
      let capturedTLOptions;
      tlCommand.execute = jest.fn().mockImplementation((options) => {
        capturedTLOptions = options;
        return Promise.resolve({
          technology_recommendations: [{
            category: 'Testing Framework',
            recommendation: 'Jest with jsdom',
            rationale: 'Good for static sites'
          }],
          implementation_plan: {
            overview: 'Simple testing setup',
            steps: ['Install Jest', 'Configure tests', 'Write initial tests']
          },
          summary: 'Jest with jsdom testing framework recommended for static sites'
        });
      });

      // Step 5: Execute BA consultation with TL
      const tlResponse = await baAgent.consultTechLead(context, 'BA response about testing', conversationContext);

      // Step 6: Verify TL received correct context
      expect(capturedTLOptions).toBeDefined();
      expect(capturedTLOptions.originalUserRequest).toBe(originalUserRequest);
      expect(capturedTLOptions.isSimplifiedFromBA).toBe(true);
      expect(capturedTLOptions.description).toBe('Add unit tests to the test-repo static site');
      
      // Step 7: Verify TL response is focused, not over-engineered
      expect(tlResponse).toContain('Jest with jsdom');
      expect(tlResponse).toContain('testing');
      expect(tlResponse).not.toContain('three-phase');
      expect(tlResponse).not.toContain('comprehensive analysis');
    });

    test('complex request should still get comprehensive analysis', async () => {
      const complexUserRequest = 'We need to completely redesign our architecture to support microservices and scale to millions of users';
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: complexUserRequest,
        validate: () => true
      };

      const conversationContext = {
        sessionId: 'test-session',
        repository: 'test-user/test-repo',
        history: [
          { speaker: 'user', message: complexUserRequest, timestamp: new Date() }
        ]
      };

      // Step 1: Verify BA detects this as complex request
      const isSimple = baAgent.isSimpleTechnicalRequest(complexUserRequest);
      expect(isSimple).toBe(false);

      // Step 2: Mock TL Command for complex analysis
      let capturedTLOptions;
      tlCommand.execute = jest.fn().mockImplementation((options) => {
        capturedTLOptions = options;
        return Promise.resolve({
          architecture_decisions: [
            { decision: 'Migrate to microservices architecture' },
            { decision: 'Implement event-driven communication' },
            { decision: 'Add distributed caching layer' }
          ],
          implementation_plan: {
            overview: 'Multi-phase migration',
            phases: [
              { phase: 'Architecture Design' },
              { phase: 'Service Extraction' },
              { phase: 'Migration' }
            ]
          },
          technical_risks: [
            { risk: 'Increased system complexity' },
            { risk: 'Network latency issues' }
          ],
          summary: 'Comprehensive microservices architecture migration plan with multiple phases'
        });
      });

      // Step 3: Execute BA consultation
      const tlResponse = await baAgent.consultTechLead(context, 'BA analysis of complex request', conversationContext);

      // Step 4: Verify complex request handling
      expect(capturedTLOptions.isSimplifiedFromBA).toBe(false);
      expect(capturedTLOptions.originalUserRequest).toBe(complexUserRequest);
      
      // Step 5: Verify comprehensive response for complex request
      expect(tlResponse).toContain('microservices');
      expect(tlResponse).toContain('architecture');
      expect(tlResponse).toContain('phase');
    });
  });

  describe('TL Agent Context Processing (Blue Phase)', () => {
    test('TL agent correctly handles simplified BA requests', async () => {
      const tlContext = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        businessRequirements: 'Add unit tests to the static site',
        originalUserRequest: 'i want to add unit tests',
        isSimplifiedFromBA: true,
        validate: () => true
      };

      // Mock TL LLM response
      let capturedPrompt;
      tlAgent.generateLLMResponse = jest.fn().mockImplementation((role, systemPrompt, analysisRequest) => {
        capturedPrompt = analysisRequest;
        return Promise.resolve({
          content: JSON.stringify({
            technology_recommendations: [{
              category: 'Testing Framework',
              recommendation: 'Jest with jsdom',
              rationale: 'Well-suited for static sites'
            }]
          })
        });
      });

      const result = await tlAgent.execute(tlContext);

      // Verify TL detected this as simple due to isSimplifiedFromBA flag
      expect(capturedPrompt).toContain('Provide a direct, concise answer');
      expect(capturedPrompt).toContain('unit tests');
      expect(capturedPrompt).not.toContain('comprehensive analysis');
      
      // Verify focused response
      expect(result.technology_recommendations).toBeDefined();
      expect(result.technology_recommendations).toHaveLength(1);
      expect(result.technology_recommendations[0].category).toBe('Testing Framework');
    });

    test('TL complexity analysis respects isSimplifiedFromBA flag', () => {
      const tlContext = {
        businessRequirements: 'Add unit tests to the static site',
        originalUserRequest: 'i want to add unit tests',
        isSimplifiedFromBA: true
      };

      const complexity = tlAgent.analyzeQuestionComplexity(tlContext);

      expect(complexity.isSimple).toBe(true);
      expect(complexity.isComplex).toBe(false);
      expect(complexity.scope).toBe('simple');
      expect(complexity.source).toBe('simplified_by_ba');
    });
  });

  describe('Communication Service Integration (Blue Phase)', () => {
    test('preserveOriginalUserContext works correctly', () => {
      const communicationService = new AgentCommunicationService(mockSessionService);
      
      // Test simple request preservation
      const simpleContext = communicationService.preserveOriginalUserContext(
        'test-session',
        'i want to add unit tests',
        { technical_questions: ['BA elaborated question'] }
      );

      expect(simpleContext.originalUserRequest).toBe('i want to add unit tests');
      expect(simpleContext.simplifiedForTL).toBe('Add unit tests to the static site');
      expect(simpleContext.skipElaboration).toBe(true);
      expect(simpleContext.isSimplifiedFromBA).toBe(true);

      // Test complex request preservation
      const complexContext = communicationService.preserveOriginalUserContext(
        'test-session',
        'redesign architecture for microservices',
        { technical_questions: ['Complex architectural questions'] }
      );

      expect(complexContext.skipElaboration).toBe(false);
      expect(complexContext.isSimplifiedFromBA).toBe(false);
    });
  });

  describe('Regression Prevention (Blue Phase)', () => {
    test('preserves complex request handling', async () => {
      const complexRequest = 'We need comprehensive architecture analysis for enterprise scalability';
      
      // Should not be detected as simple
      expect(baAgent.isSimpleTechnicalRequest(complexRequest)).toBe(false);
      
      // Should get complex analysis
      const tlContext = {
        businessRequirements: complexRequest,
        featureDescription: ''
      };
      
      const complexity = tlAgent.analyzeQuestionComplexity(tlContext);
      expect(complexity.scope).toBe('complex');
    });

    test('preserves medium complexity detection', async () => {
      const mediumRequest = 'Add user management with roles and permissions plus site optimization features';
      
      const tlContext = {
        businessRequirements: mediumRequest,
        featureDescription: ''
      };
      
      const complexity = tlAgent.analyzeQuestionComplexity(tlContext);
      expect(complexity.scope).toBe('medium');
    });
  });
});