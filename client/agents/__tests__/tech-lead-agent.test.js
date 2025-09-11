import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { TechLeadAgent } from '../tech-lead-agent.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('TechLeadAgent', () => {
  let techLeadAgent;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    techLeadAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock the repository analysis to avoid complex setup
    techLeadAgent.analyzeRepository = jest.fn().mockResolvedValue({
      structure: 'Simple static site with HTML/CSS/JS'
    });
    
    // Mock the LLM response generation
    techLeadAgent.generateLLMResponse = jest.fn();
  });

  describe('Direct Technical Answers (TDD Red Phase)', () => {
    test('FAILING: should answer simple testing framework question directly', async () => {
      // Mock context for testing framework question
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner', 
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Do you have a preferred testing framework and setup (e.g., Jest or Vitest for JavaScript, npm scripts to run tests, and whether you want CI (GitHub Actions) to run them as well)?',
        validate: () => true
      };

      // Mock LLM to return the current broken behavior (comprehensive analysis)
      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [{ decision: 'Comprehensive site architecture' }],
          implementation_plan: { overview: '4-phase plan', phases: [] },
          technical_risks: [],
          technology_recommendations: [],
          performance_considerations: 'Full performance analysis',
          security_considerations: 'Full security analysis',
          development_strategy: 'Full development strategy'
        })
      });

      const result = await techLeadAgent.execute(context);

      // THIS SHOULD FAIL - TL should give direct answer, not comprehensive analysis
      expect(result.architecture_decisions).toHaveLength(0); // Should not have architectural decisions for simple question
      expect(result.implementation_plan.phases).toHaveLength(0); // Should not have multi-phase plan
      expect(result.technology_recommendations).toContainEqual(
        expect.objectContaining({
          category: 'Testing Framework',
          recommendation: 'Jest with jsdom',
          rationale: expect.stringContaining('static site')
        })
      );
    });

    test('FAILING: should provide concise answer to simple technical questions', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo', 
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'What testing framework should we use?',
        validate: () => true
      };

      // Mock current behavior (over-engineering)
      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [
            { decision: 'Host as GitHub Pages static site' },
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

      // THIS SHOULD FAIL - response should be proportional to question complexity
      expect(result.architecture_decisions).toHaveLength(1); // Only testing-related decision
      expect(result.implementation_plan.phases).toHaveLength(1); // Only testing implementation
      expect(result.architecture_decisions[0].decision).toContain('testing'); // Should be focused on testing
    });

    test('FAILING: should not punt technical decisions back to BA', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo', 
        businessRequirements: 'Which testing framework should we use for the static site?',
        validate: () => true
      };

      // Mock current behavior that includes questions back to BA
      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          questions_for_ba: [
            'Do you prefer to continue with GitHub Pages/Jekyll, or are you open to migrating to Netlify/Vercel?',
            'Is there a need for non-technical editors to publish content?'
          ],
          technology_recommendations: []
        })
      });

      const result = await techLeadAgent.execute(context);

      // THIS SHOULD FAIL - TL should make technical decisions, not ask BA
      expect(result.questions_for_ba || []).toHaveLength(0); // TL should not ask BA technical questions
      expect(result.technology_recommendations).toContainEqual(
        expect.objectContaining({
          category: 'Testing Framework',
          recommendation: expect.any(String)
        })
      );
    });
  });

  describe('Response Proportionality (TDD Red Phase)', () => {
    test('FAILING: complex architectural question should get full analysis', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'We need to completely redesign our architecture to support microservices, implement real-time features, and scale to millions of users.',
        validate: () => true
      };

      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [{ decision: 'Simple testing setup' }]
        })
      });

      const result = await techLeadAgent.execute(context);

      // THIS SHOULD FAIL - complex questions should get comprehensive analysis
      expect(result.architecture_decisions).toHaveLength(4); // Multiple architectural decisions for complex request
    });

    test('FAILING: simple question should get simple answer', async () => {
      const context = {
        sessionId: 'test-session', 
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'Should we use Jest or Vitest?',
        validate: () => true
      };

      // Mock current over-engineering behavior
      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          architecture_decisions: [
            { decision: 'Host as a GitHub Pages static site' },
            { decision: 'Content source and templating strategy' }, 
            { decision: 'CI/CD and preview strategy' },
            { decision: 'SEO, accessibility, and performance baseline' }
          ],
          implementation_plan: {
            phases: [
              { phase: 'Phase 1 - Baseline Assessment' },
              { phase: 'Phase 2 - CI/CD, Quality Gates' },
              { phase: 'Phase 3 - Modernization' }
            ]
          }
        })
      });

      const result = await techLeadAgent.execute(context);

      // THIS SHOULD FAIL - simple questions should get simple focused answers
      expect(result.architecture_decisions).toHaveLength(1); // Only testing framework decision
      expect(result.implementation_plan.phases).toHaveLength(1); // Only testing setup phase
    });
  });

  describe('Role Boundaries (TDD Red Phase)', () => {
    test('should make technical decisions within TL domain', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-owner', 
        repoName: 'test-repo',
        getRepository: () => 'test-owner/test-repo',
        businessRequirements: 'What testing framework and CI setup should we use?',
        validate: () => true
      };

      techLeadAgent.generateLLMResponse.mockResolvedValue({
        content: JSON.stringify({
          technology_recommendations: [
            {
              category: 'Testing Framework',
              recommendation: 'Jest with jsdom',
              rationale: 'Well-suited for static sites with JavaScript'
            },
            {
              category: 'CI/CD',
              recommendation: 'GitHub Actions',
              rationale: 'Native integration with GitHub Pages'
            }
          ]
        })
      });

      const result = await techLeadAgent.execute(context);

      // This should pass - TL making technical decisions
      expect(result.technology_recommendations).toHaveLength(2);
      expect(result.technology_recommendations[0].recommendation).toBe('Jest with jsdom');
      expect(result.technology_recommendations[1].recommendation).toBe('GitHub Actions');
    });
  });
});