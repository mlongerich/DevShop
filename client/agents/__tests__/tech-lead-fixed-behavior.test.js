import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { TechLeadAgent } from '../tech-lead-agent.js';
import { DocumentService } from '../../services/document-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('TechLeadAgent Fixed Behavior Validation (TDD Blue Phase)', () => {
  let techLeadAgent;
  let documentService;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    techLeadAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    documentService = new DocumentService(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock repository analysis to avoid complex setup
    techLeadAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
  });

  describe('Fixed Complexity Analysis', () => {
    test('correctly classifies testing requests as simple', () => {
      const testCases = [
        'Add unit tests to the static site',
        'What testing framework should we use?',
        'Should we use Jest or Vitest?',
        'Set up testing for the project',
        'Implement unit testing',
        'Choose a test framework'
      ];

      testCases.forEach(request => {
        const context = { businessRequirements: request, featureDescription: '' };
        const result = techLeadAgent.analyzeQuestionComplexity(context);
        
        expect(result.scope).toBe('simple');
        expect(result.isSimple).toBe(true);
        expect(result.isComplex).toBe(false);
      });
    });

    test('correctly classifies complex architectural requests', () => {
      const testCases = [
        'We need to completely redesign our architecture to support microservices',
        'Migrate to a new infrastructure platform',
        'Complete system design overhaul',
        'Scale to millions of users with enterprise features'
      ];

      testCases.forEach(request => {
        const context = { businessRequirements: request, featureDescription: '' };
        const result = techLeadAgent.analyzeQuestionComplexity(context);
        
        expect(result.scope).toBe('complex');
        expect(result.isSimple).toBe(false);
        expect(result.isComplex).toBe(true);
      });
    });
  });

  describe('Fixed Prompt Generation', () => {
    test('generates direct technical prompts for simple questions', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Add unit tests to the static site',
        validate: () => true
      };

      // Mock LLM to capture the prompt
      let capturedPrompt = '';
      techLeadAgent.generateLLMResponse = jest.fn().mockImplementation((role, systemPrompt, analysisRequest) => {
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

      await techLeadAgent.execute(context);

      // Verify the prompt indicates direct technical answer
      expect(capturedPrompt).toContain('Provide a direct, concise answer');
      expect(capturedPrompt).toContain('Do not include comprehensive architecture analysis');
      expect(capturedPrompt).toContain('focused technical recommendation');
    });

    test('generates comprehensive prompts for complex questions', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'We need to completely redesign our architecture to support microservices and scale to millions of users',
        validate: () => true
      };

      // Mock LLM to capture the prompt
      let capturedPrompt = '';
      techLeadAgent.generateLLMResponse = jest.fn().mockImplementation((role, systemPrompt, analysisRequest) => {
        capturedPrompt = analysisRequest;
        return Promise.resolve({
          content: JSON.stringify({
            architecture_decisions: [
              { decision: 'Microservices architecture' },
              { decision: 'Container orchestration' },
              { decision: 'Event-driven communication' }
            ],
            implementation_plan: {
              phases: [
                { phase: 'Architecture Design' },
                { phase: 'Service Extraction' },
                { phase: 'Migration' }
              ]
            }
          })
        });
      });

      await techLeadAgent.execute(context);

      // Verify the prompt indicates comprehensive analysis
      expect(capturedPrompt).toContain('comprehensive technical analysis');
      expect(capturedPrompt).toContain('Architecture & Design');
      expect(capturedPrompt).toContain('Implementation Strategy');
    });
  });

  describe('Fixed Branch Naming', () => {
    test('generates short, meaningful branch names', () => {
      const testCases = [
        {
          title: 'Unit Testing Framework Selection',
          expected: /^add-testing-framework$/
        },
        {
          title: 'Please provide technical guidance for technical implementation What are the recommended approaches tools and best practices',
          expected: /^add-please-implementation$/
        },
        {
          title: 'Authentication System Implementation',
          expected: /^add-auth-authentication$/
        }
      ];

      testCases.forEach(({ title, expected }) => {
        const branchName = documentService.generateBranchName(title);
        
        expect(branchName.length).toBeLessThan(50);
        expect(branchName).toMatch(expected);
        expect(branchName).toMatch(/^[a-z-]+$/); // Only lowercase letters and hyphens
      });
    });

    test('generates smart file names under 50 characters', () => {
      const longTitle = 'Please provide technical guidance for technical implementation What are the recommended approaches tools and best practices';
      
      const fileName = documentService.generateSmartFileName('ADR', longTitle);
      
      expect(fileName.length).toBeLessThan(50);
      expect(fileName).toMatch(/^ADR-\d+-[a-z-]+$/);
      expect(fileName).toContain('implementation'); // Should extract key terms
    });
  });

  describe('Fixed ADR Scoping', () => {
    test('determines simple decisions correctly', () => {
      const simpleDecision = { decision: 'Use Jest for testing' };
      const isSimple = documentService.isSimpleDecision(simpleDecision);
      
      expect(isSimple).toBe(true);
    });

    test('determines complex decisions correctly', () => {
      const complexDecision = { 
        architecture_decisions: [{}, {}, {}],
        technical_risks: [{}, {}],
        implementation_plan: { phases: [{}, {}, {}] }
      };
      const isSimple = documentService.isSimpleDecision(complexDecision);
      
      expect(isSimple).toBe(false);
    });

    test('shouldCreateADR returns appropriate values', () => {
      const simpleDecision = { decision: 'Use Jest for testing' };
      const complexDecision = { 
        architecture_decisions: [{}, {}, {}],
        technical_risks: [{}, {}]
      };

      expect(documentService.shouldCreateADR(simpleDecision)).toBe(false);
      expect(documentService.shouldCreateADR(complexDecision)).toBe(true);
    });
  });

  describe('Integration Validation', () => {
    test('complete workflow from simple request to focused response', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'What testing framework should we use for the static site?',
        validate: () => true
      };

      // Mock realistic LLM response for simple question
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          technology_recommendations: [{
            category: 'Testing Framework',
            recommendation: 'Jest with jsdom',
            rationale: 'Well-suited for static sites with JavaScript components'
          }],
          implementation_plan: {
            overview: 'Simple testing setup',
            steps: [
              'Install Jest and jsdom',
              'Configure test scripts',
              'Write initial tests'
            ]
          }
        })
      });

      const result = await techLeadAgent.execute(context);

      // Verify focused response
      expect(result.technology_recommendations).toBeDefined();
      expect(result.technology_recommendations).toHaveLength(1);
      expect(result.technology_recommendations[0].category).toBe('Testing Framework');
      
      // Should not have comprehensive architectural analysis for simple questions
      expect(result.architecture_decisions).toEqual([]);
      expect(result.technical_risks).toEqual([]);
    });

    test('complete workflow from complex request to comprehensive response', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'We need to redesign our architecture to support microservices and scale to millions of users',
        validate: () => true
      };

      // Mock realistic LLM response for complex question
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [
            { decision: 'Migrate to microservices architecture' },
            { decision: 'Implement event-driven communication' },
            { decision: 'Add distributed caching layer' }
          ],
          implementation_plan: {
            overview: 'Multi-phase migration to microservices',
            phases: [
              { phase: 'Service identification and boundaries' },
              { phase: 'Infrastructure setup' },
              { phase: 'Service migration' }
            ]
          },
          technical_risks: [
            { risk: 'Increased system complexity' },
            { risk: 'Network latency issues' }
          ]
        })
      });

      const result = await techLeadAgent.execute(context);

      // Verify comprehensive response
      expect(result.architecture_decisions).toBeDefined();
      expect(result.architecture_decisions.length).toBeGreaterThan(2);
      expect(result.implementation_plan.phases.length).toBeGreaterThan(2);
      expect(result.technical_risks).toBeDefined();
    });
  });
});