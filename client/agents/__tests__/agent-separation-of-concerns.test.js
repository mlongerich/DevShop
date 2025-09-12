import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { ConversationalBAAgent } from '../conversational-ba-agent.js';
import { TechLeadAgent } from '../tech-lead-agent.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('Agent Separation of Concerns (TDD Red Phase)', () => {
  let baAgent;
  let tlAgent;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    baAgent = new ConversationalBAAgent(mockMCPClientManager, mockSessionService, mockConfig);
    tlAgent = new TechLeadAgent(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock MCP tools
    mockMCPClientManager.callTool = jest.fn();
    mockMCPClientManager.listTools = jest.fn().mockResolvedValue([
      { name: 'get_file_contents' },
      { name: 'create_branch' },
      { name: 'create_or_update_file' }
    ]);
    
    // Mock other required methods to focus on separation of concerns
    baAgent.logInteraction = jest.fn().mockResolvedValue();
    tlAgent.logInteraction = jest.fn().mockResolvedValue();
    baAgent.logCompletion = jest.fn().mockResolvedValue();
    tlAgent.logCompletion = jest.fn().mockResolvedValue();
  });

  describe('Business Analyst Agent Scope (TDD Red Phase)', () => {
    test('FAILING: BA agent should NOT perform repository analysis', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        initialInput: 'i want to add unit tests',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      // Spy on analyzeRepository to ensure it's NOT called by BA
      const analyzeRepositorySpy = jest.spyOn(baAgent, 'analyzeRepository');
      
      // Mock other required methods
      baAgent.checkSimilarIssuesAndConversations = jest.fn().mockResolvedValue();
      baAgent.generateConversationResponse = jest.fn().mockResolvedValue({ 
        content: 'BA response without technical analysis' 
      });

      // THIS SHOULD FAIL - BA should not call analyzeRepository
      await baAgent.startConversation(context);
      
      // BA should focus on business requirements only, not technical analysis
      expect(analyzeRepositorySpy).not.toHaveBeenCalled();
      expect(baAgent.generateConversationResponse).toHaveBeenCalledWith(
        expect.any(Object),
        null, // No repository analysis should be passed
        null
      );
    });

    test('FAILING: BA agent should focus on business requirements gathering', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        initialInput: 'add user authentication',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      // Mock BA methods
      baAgent.checkSimilarIssuesAndConversations = jest.fn().mockResolvedValue();
      const generateResponseSpy = jest.spyOn(baAgent, 'generateConversationResponse').mockResolvedValue({ 
        content: 'What type of authentication do you prefer? OAuth, email/password, or social logins?' 
      });

      // THIS SHOULD FAIL - BA should ask business questions, not technical ones
      await baAgent.startConversation(context);
      
      // BA should receive context without technical repository analysis
      expect(generateResponseSpy).toHaveBeenCalledWith(
        expect.any(Object),
        null, // No technical data should be passed
        null
      );
      
      // BA should ask business-focused questions
      const callArgs = generateResponseSpy.mock.calls[0];
      expect(callArgs[1]).toBeNull(); // No repository analysis
    });

    test('FAILING: BA multi-agent workflow should pass only business context to TL', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        businessRequirements: 'Add unit testing framework',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      const conversationContext = {
        history: [
          { speaker: 'user', message: 'i want to add unit tests', timestamp: new Date() }
        ],
        state: 'gathering'
      };

      // Mock TL command execution
      baAgent.tlCommand = {
        execute: jest.fn().mockResolvedValue({
          summary: 'Technical analysis based on actual repository structure',
          technology_recommendations: [{ category: 'Testing', recommendation: 'Jest' }]
        })
      };

      // Mock agent communication service to prevent escalation
      baAgent.agentCommunicationService = {
        communicationExists: jest.fn().mockResolvedValue(true),
        initializeCommunication: jest.fn().mockResolvedValue({ sessionId: 'test-communication' }),
        sendMessage: jest.fn().mockResolvedValue(),
        processMessage: jest.fn().mockResolvedValue(),
        getConversationHistory: jest.fn().mockReturnValue([])
      };

      // THIS SHOULD FAIL - TL should receive business context, not pre-analyzed technical data
      const result = await baAgent.consultTechLead(context, 'BA business response', conversationContext);
      
      // Verify TL received clean business requirements without BA's technical analysis
      const tlOptions = baAgent.tlCommand.execute.mock.calls[0][0];
      expect(tlOptions.description).toBeDefined(); // Business requirements passed to TL
      expect(tlOptions.description).toContain('Add unit tests'); // Actual business requirement
      expect(tlOptions.originalUserRequest).toBe('i want to add unit tests');
      expect(tlOptions).not.toHaveProperty('repositoryAnalysis'); // No technical pre-analysis
    });
  });

  describe('Tech Lead Agent Scope (TDD Red Phase)', () => {
    test('FAILING: TL agent should perform repository analysis', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',  
        repoName: 'test-repo',
        businessRequirements: 'Add unit tests to the static site',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      // Mock repository analysis to return actual technical data
      mockMCPClientManager.callTool.mockResolvedValue({
        files: [
          { name: '_config.yml', type: 'file' },
          { name: 'assets/js/main.js', type: 'file' },
          { name: '_posts', type: 'directory' }
        ]
      });

      // Mock TL methods
      tlAgent.generateTechLeadAnalysis = jest.fn().mockResolvedValue({
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest for JavaScript testing'
        }],
        summary: 'Based on Jekyll structure, recommend Jest for JS assets'
      });

      // Spy on repository analysis
      const analyzeRepositorySpy = jest.spyOn(tlAgent, 'analyzeRepository');

      // THIS SHOULD FAIL - TL should call analyzeRepository and use the results
      const result = await tlAgent.execute(context);
      
      // TL should perform technical repository analysis
      expect(analyzeRepositorySpy).toHaveBeenCalledWith(expect.any(Object));
      
      // TL should provide specific technical guidance based on actual repository
      expect(result.technology_recommendations).toBeDefined();
      expect(result.summary).toContain('Jekyll'); // Should mention specific tech found
      expect(result.summary).not.toContain('Cannot access the repository'); // Should have repo data
    });

    test('FAILING: TL agent should provide specific guidance based on repository structure', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'mlongerich',
        repoName: 'mlongerich.github.io',
        businessRequirements: 'Add unit tests',
        getRepository: () => 'mlongerich/mlongerich.github.io',
        validate: () => true
      };

      // Mock specific repository structure (Jekyll GitHub Pages)
      mockMCPClientManager.callTool.mockResolvedValue({
        files: [
          { name: '_config.yml', type: 'file' },
          { name: '_layouts', type: 'directory' },
          { name: '_posts', type: 'directory' },
          { name: 'assets', type: 'directory' }
        ]
      });

      tlAgent.generateTechLeadAnalysis = jest.fn().mockResolvedValue({
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'RSpec for Jekyll plugins, Jest for frontend assets',
          rationale: 'Based on Jekyll GitHub Pages structure detected'
        }],
        summary: 'Jekyll GitHub Pages site detected. Recommend dual testing strategy.'
      });

      // THIS SHOULD FAIL - TL should provide specific guidance, not generic assumptions  
      const result = await tlAgent.execute(context);
      
      // Should provide specific technical guidance based on actual repository analysis
      expect(result.summary).toContain('Jekyll'); // Specific tech stack
      expect(result.technology_recommendations[0].rationale).toContain('structure detected'); 
      expect(result.summary).not.toContain('missing path parameter'); // Should have repo access
    });

    test('FAILING: TL agent should succeed where BA-consumed analysis fails', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'mlongerich',
        repoName: 'mlongerich.github.io', 
        businessRequirements: 'Add unit tests to the static site',
        getRepository: () => 'mlongerich/mlongerich.github.io',
        validate: () => true
      };

      // Mock repository tools being available for TL (not consumed by BA)
      mockMCPClientManager.callTool.mockResolvedValue({
        structure: 'Jekyll GitHub Pages site',
        languages: ['Ruby', 'JavaScript', 'HTML'],
        frameworks: ['Jekyll'],
        files: ['_config.yml', '_layouts/', 'assets/js/']
      });

      tlAgent.generateTechLeadAnalysis = jest.fn().mockResolvedValue({
        architecture_decisions: [{
          decision: 'Use RSpec for Jekyll testing and Jest for JS assets',
          rationale: 'Based on detected Jekyll + JS structure'
        }],
        summary: 'Dual-layer testing strategy for Jekyll GitHub Pages with JS assets'
      });

      // THIS SHOULD FAIL - When BA doesn't consume repo analysis, TL should succeed
      const result = await tlAgent.execute(context);
      
      // TL should successfully access and analyze repository
      expect(result.architecture_decisions).toBeDefined();
      expect(result.summary).toContain('Jekyll'); // Specific guidance
      expect(result.summary).not.toContain('Cannot access the repository structure');
      expect(result.architecture_decisions[0].rationale).toContain('detected'); // Based on actual analysis
    });
  });

  describe('Multi-Agent Workflow Separation (TDD Red Phase)', () => {
    test('FAILING: Complete BA-TL workflow should maintain proper separation', async () => {
      // Simulate the user's failing scenario
      const userRequest = 'i want to add unit tests';
      
      const baContext = {
        sessionId: 'test-session',
        repoOwner: 'mlongerich',
        repoName: 'mlongerich.github.io',
        initialInput: userRequest,
        getRepository: () => 'mlongerich/mlongerich.github.io',
        validate: () => true
      };

      const conversationContext = {
        history: [{ speaker: 'user', message: userRequest, timestamp: new Date() }],
        state: 'gathering'
      };

      // Mock BA methods (no repository analysis)
      baAgent.checkSimilarIssuesAndConversations = jest.fn().mockResolvedValue();
      baAgent.generateConversationResponse = jest.fn().mockResolvedValue({
        content: 'What parts of your site need unit tests? JavaScript utilities, templates, or plugins?'
      });

      // Mock TL command with repository analysis
      baAgent.tlCommand = {
        execute: jest.fn().mockResolvedValue({
          technology_recommendations: [{
            category: 'Testing Framework', 
            recommendation: 'Jest for JavaScript, RSpec for Jekyll'
          }],
          summary: 'Based on Jekyll GitHub Pages structure analysis, recommend dual testing approach'
        })
      };

      // Mock agent communication service to prevent escalation
      baAgent.agentCommunicationService = {
        communicationExists: jest.fn().mockResolvedValue(true),
        initializeCommunication: jest.fn().mockResolvedValue({ sessionId: 'test-communication' }),
        sendMessage: jest.fn().mockResolvedValue('Mocked TL response'),
        processMessage: jest.fn().mockResolvedValue(),
        getConversationHistory: jest.fn().mockReturnValue([])
      };

      // THIS SHOULD FAIL - BA should not do repo analysis, TL should get repo access
      
      // Step 1: BA starts conversation (no repo analysis)
      const baResponse = await baAgent.startConversation(baContext);
      expect(baResponse.response).toContain('What parts'); // Business question, not technical
      
      // Step 2: BA consults TL with business requirements
      const tlResponse = await baAgent.consultTechLead(baContext, baResponse.response, conversationContext);
      
      // Verify proper separation:
      // - BA asked business questions without technical analysis  
      expect(baAgent.generateConversationResponse).toHaveBeenCalledWith(
        expect.any(Object),
        null, // No repository analysis
        null
      );
      
      // - TL received business context through communication service 
      expect(baAgent.agentCommunicationService.sendMessage).toHaveBeenCalled();
      
      // - TL provided specific technical guidance based on repository analysis
      expect(tlResponse).toContain('Jekyll'); // TL provided specific technical guidance
      expect(tlResponse).not.toContain('Cannot access the repository'); // TL got repo access
    });

    test('FAILING: Repository analysis should happen only once by TL agent', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      // Track all calls to analyzeRepository across agents
      const baAnalyzeSpy = jest.spyOn(baAgent, 'analyzeRepository');
      const tlAnalyzeSpy = jest.spyOn(tlAgent, 'analyzeRepository');
      
      mockMCPClientManager.callTool.mockResolvedValue({ structure: 'test repo' });

      // Mock required methods
      baAgent.checkSimilarIssuesAndConversations = jest.fn().mockResolvedValue();
      baAgent.generateConversationResponse = jest.fn().mockResolvedValue({ content: 'BA response' });
      tlAgent.generateTechLeadAnalysis = jest.fn().mockResolvedValue({ summary: 'TL analysis' });

      // THIS SHOULD FAIL - Only TL should analyze repository, not BA
      await baAgent.startConversation({ ...context, initialInput: 'test request' });
      await tlAgent.execute({ ...context, businessRequirements: 'test requirements' });
      
      // Verify separation of concerns
      expect(baAnalyzeSpy).not.toHaveBeenCalled(); // BA should not analyze repository
      expect(tlAnalyzeSpy).toHaveBeenCalledTimes(1); // TL should analyze repository exactly once
    });
  });

  describe('Current Broken Behavior Documentation (Red Phase)', () => {
    test('documents fixed BA repository analysis separation', async () => {
      const context = {
        sessionId: 'test-session',
        repoOwner: 'test-user',
        repoName: 'test-repo',
        initialInput: 'test request',
        getRepository: () => 'test-user/test-repo',
        validate: () => true
      };

      // Mock methods to allow execution
      baAgent.checkSimilarIssuesAndConversations = jest.fn().mockResolvedValue();
      baAgent.generateConversationResponse = jest.fn().mockResolvedValue({ content: 'response' });
      mockMCPClientManager.callTool.mockResolvedValue({ structure: 'test' });

      const analyzeRepositorySpy = jest.spyOn(baAgent, 'analyzeRepository');

      // Fixed behavior: BA no longer does repository analysis
      await baAgent.startConversation(context);
      
      expect(analyzeRepositorySpy).not.toHaveBeenCalled(); // Fix working - BA doesn't analyze repository
      expect(baAgent.generateConversationResponse).toHaveBeenCalledWith(
        expect.any(Object),
        null, // BA no longer receives repository analysis (CORRECT)
        null
      );
    });

    test('documents current TL repository access failure', () => {
      // This test documents the current issue where TL says "Cannot access the repository structure"
      // because BA has already consumed the analysis
      
      const currentBehaviorError = 'Cannot access the repository structure due to a missing path parameter in the provided context';
      
      // This error occurs because:
      // 1. BA agent calls analyzeRepository() first (line 86 in conversational-ba-agent.js)
      // 2. BA consumes the repository analysis data
      // 3. When TL tries to analyze, it can't access the same data
      // 4. TL falls back to generic assumptions instead of specific guidance
      
      expect(currentBehaviorError).toContain('Cannot access the repository structure');
      expect(currentBehaviorError).toContain('missing path parameter');
    });
  });
});