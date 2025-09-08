import { BaseAgent, AgentResult } from './base-agent.js';
import chalk from 'chalk';

/**
 * Business Analyst Agent
 * Analyzes requirements, creates detailed specifications, and generates GitHub issues
 */
export class BAAgent extends BaseAgent {
  constructor(mcpClientManager, sessionService, config) {
    super(mcpClientManager, sessionService);
    this.config = config;
  }

  getName() {
    return 'ba';
  }

  getDescription() {
    return 'Business Analyst agent for requirements analysis and specification creation';
  }

  getRequiredContextParams() {
    return ['repoOwner', 'repoName', 'featureDescription'];
  }

  validateContext(context) {
    try {
      const enhancedContext = this.ensureContextMethods(context);
      enhancedContext.validate(this.getRequiredContextParams());
      return true;
    } catch (error) {
      throw new Error(`BA Agent context validation failed: ${error.message}`);
    }
  }

  /**
   * Execute BA Agent workflow
   * @param {Object} context - Execution context with repoOwner, repoName, featureDescription
   * @returns {Promise<AgentResult>} Analysis result
   */
  async execute(context) {
    console.log(chalk.cyan(`\n🔍 BA Agent analyzing request for ${context.repoOwner}/${context.repoName}`));
    
    // Ensure context has required methods and validate
    const enhancedContext = this.ensureContextMethods(context);
    this.validateContext(enhancedContext);

    try {
      // Start session if not provided
      if (!enhancedContext.sessionId) {
        enhancedContext.sessionId = await this.sessionService.createSession(
          'ba', 
          `Repository: ${enhancedContext.repoOwner}/${enhancedContext.repoName}`
        );
      }

      await this.logInteraction('agent_start', 'BA Agent started analysis', {
        repository: enhancedContext.getRepository(),
        feature_description: enhancedContext.featureDescription
      });

      // Step 1: Analyze repository structure
      const repoAnalysis = await this.analyzeRepository(enhancedContext);
      
      // Step 2: Generate requirements analysis
      const requirementsAnalysis = await this.generateRequirements(enhancedContext, repoAnalysis);
      
      // Step 3: Create GitHub issue if needed
      let issueResult = null;
      if (this.shouldCreateIssue(requirementsAnalysis)) {
        issueResult = await this.createGitHubIssue(enhancedContext, requirementsAnalysis);
      }

      // Step 4: Log completion and costs
      await this.logCompletion(enhancedContext);

      const result = {
        analysis: requirementsAnalysis,
        repository_analysis: repoAnalysis,
        issue: issueResult,
        session_id: enhancedContext.sessionId
      };

      await this.logInteraction('agent_complete', 'BA Agent completed analysis', result);
      
      return AgentResult.success(result, 'Requirements analysis completed successfully');
      
    } catch (error) {
      await this.logError(error, { repository: enhancedContext.getRepository() });
      console.error(chalk.red(`❌ BA Agent failed: ${error.message}`));
      return AgentResult.error(`BA Agent failed: ${error.message}`);
    }
  }


  /**
   * Generate requirements analysis using LLM
   */
  async generateRequirements(context, repoAnalysis) {
    const userContent = `Please analyze the repository ${context.repoOwner}/${context.repoName} and create detailed requirements for this feature: "${context.featureDescription}"\n\nRepository structure:\n${repoAnalysis.structure}\n\nPlease:\n1. Ask any clarifying questions if needed\n2. Analyze the existing codebase structure\n3. Create a detailed GitHub issue with requirements\n4. Include acceptance criteria and technical considerations`;

    return await this.generateLLMResponse('ba', this.getBASystemPrompt.bind(this), userContent, context);
  }

  /**
   * Determine if a GitHub issue should be created
   */
  shouldCreateIssue(analysis) {
    const content = analysis.content.toLowerCase();
    return content.includes('github issue') || 
           content.includes('requirements') ||
           content.includes('create issue');
  }

  /**
   * Create GitHub issue based on analysis
   */
  async createGitHubIssue(context, analysis) {
    const issueTitle = `Feature: ${context.featureDescription}`;
    
    // Format the content for GitHub - clean up escape sequences and format as markdown
    const cleanContent = this.formatLLMResponseForDisplay(analysis.content, {}, false);
    const issueBody = `# Requirements Analysis\n\n${cleanContent}`;

    return await this.createRepositoryIssue(
      context, 
      issueTitle, 
      issueBody, 
      ['enhancement', 'devshop-generated']
    );
  }


  /**
   * Get BA agent system prompt
   */
  async getBASystemPrompt() {
    return await this.generateAgentPrompt('ba', 'Analyze requirements and create specifications');
  }
}