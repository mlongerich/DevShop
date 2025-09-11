import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { TechLeadAgent } from '../tech-lead-agent.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('TechLeadAgent Integration Tests (TDD Red Phase)', () => {
  let techLeadAgent;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    techLeadAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock repository analysis to avoid complex setup
    techLeadAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'GitHub Pages Jekyll static site'
    });
  });

  describe('Real Execution Path Integration (TDD Red Phase)', () => {
    test('FAILING: execute() should call analyzeQuestionComplexity for simple requests', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'What testing framework should we use?',
        validate: () => true
      };

      // Spy on the complexity analysis method
      const complexitySpy = jest.spyOn(techLeadAgent, 'analyzeQuestionComplexity');
      
      // Mock LLM to return current broken behavior
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [
            { decision: 'Host as GitHub Pages static site' },
            { decision: 'Content source and templating strategy' },
            { decision: 'CI/CD and preview strategy' }
          ]
        })
      });

      await techLeadAgent.execute(context);

      // THIS SHOULD FAIL - complexity analysis should be called but isn't
      expect(complexitySpy).toHaveBeenCalledWith(context);
      expect(complexitySpy).toHaveBeenCalledTimes(1);
    });

    test('FAILING: execute() should use generateDirectTechnicalAnswer for simple questions', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Should we use Jest or Vitest?',
        validate: () => true
      };

      // Mock generateLLMResponse to avoid MCP client issues
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          technology_recommendations: [{
            category: 'Testing Framework',
            recommendation: 'Jest with jsdom',
            rationale: 'Good for static sites'
          }]
        })
      });

      // Spy on the direct answer method
      const directAnswerSpy = jest.spyOn(techLeadAgent, 'generateDirectTechnicalAnswer');
      
      await techLeadAgent.execute(context);

      // THIS SHOULD PASS - direct answer should be used for simple questions
      expect(directAnswerSpy).toHaveBeenCalled();
    });

    test('FAILING: trace real execution path from BA to TL', async () => {
      const baContext = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Add unit tests to the static site',
        validate: () => true
      };

      // Mock the actual LLM call that happens in execute()
      const generateLLMResponseSpy = jest.spyOn(techLeadAgent, 'generateLLMResponse');
      generateLLMResponseSpy.mockResolvedValue({
        content: JSON.stringify({
          technology_recommendations: [{
            category: 'Testing Framework',
            recommendation: 'Jest with jsdom',
            rationale: 'Good for static sites'
          }]
        })
      });

      const result = await techLeadAgent.execute(baContext);

      // Verify the execution path
      expect(generateLLMResponseSpy).toHaveBeenCalledTimes(1);
      
      // Check what prompt was actually sent to LLM
      const llmCall = generateLLMResponseSpy.mock.calls[0];
      const agentRole = llmCall[0]; // first arg is agent role
      const systemPrompt = llmCall[1]; // second arg is system prompt  
      const analysisRequest = llmCall[2]; // third arg is the analysis request
      
      console.log('LLM Call Details:');
      console.log('Agent Role:', agentRole);
      console.log('Analysis Request:', analysisRequest);
      
      // Verify this is calling the direct technical answer path
      expect(agentRole).toBe('tech-lead');
      expect(analysisRequest).toContain('Provide a direct, concise answer');
      expect(analysisRequest).toContain('Do not include comprehensive architecture analysis');
    });

    test('FAILING: verify generateTechLeadAnalysis integration', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner', 
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'What testing framework should we use?',
        validate: () => true
      };

      // Mock generateLLMResponse to avoid MCP client issues
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          technology_recommendations: [{
            category: 'Testing Framework',
            recommendation: 'Jest with jsdom',
            rationale: 'Good for static sites'
          }]
        })
      });

      // Spy on generateTechLeadAnalysis to see if it's called
      const analysisMethodSpy = jest.spyOn(techLeadAgent, 'generateTechLeadAnalysis');
      
      await techLeadAgent.execute(context);

      // THIS SHOULD PASS - this method should be called
      expect(analysisMethodSpy).toHaveBeenCalled();
      
      if (analysisMethodSpy.mock.calls.length > 0) {
        const callArgs = analysisMethodSpy.mock.calls[0];
        // Verify the context was passed
        expect(callArgs[0]).toEqual(expect.objectContaining({
          businessRequirements: 'What testing framework should we use?'
        }));
      }
    });
  });

  describe('Current Broken Behavior Documentation (Red Phase)', () => {
    test('documents current over-engineering behavior', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Add unit testing to static site',
        validate: () => true
      };

      // Mock the current broken behavior from the logs
      techLeadAgent.generateLLMResponse = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [
            { decision: 'Host as a GitHub Pages static site' },
            { decision: 'Content source and templating strategy' },
            { decision: 'CI/CD and preview strategy' },
            { decision: 'SEO, accessibility, and performance baseline' }
          ],
          implementation_plan: {
            overview: 'A staged plan to stabilize the current GitHub Pages site',
            phases: [
              { phase: 'Phase 1 - Baseline Assessment & Stabilization' },
              { phase: 'Phase 2 - CI/CD, Quality Gates & Basic SEO/Performance' },
              { phase: 'Phase 3 - Modernization & Enhanced Developer Experience' }
            ]
          }
        })
      });

      const result = await techLeadAgent.execute(context);

      // This documents the CURRENT BROKEN behavior
      expect(result.architecture_decisions).toHaveLength(4); // Currently over-engineering
      expect(result.implementation_plan.phases).toHaveLength(3); // Currently creating multi-phase plans
      
      // These expectations SHOULD FAIL when we fix the integration
      // For simple questions, we want:
      // expect(result.architecture_decisions).toHaveLength(1); // Only testing decision
      // expect(result.implementation_plan.phases).toHaveLength(1); // Only testing setup
    });
  });
});