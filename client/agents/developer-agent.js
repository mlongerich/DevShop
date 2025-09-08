import { BaseAgent, AgentResult } from './base-agent.js';
import chalk from 'chalk';

/**
 * Developer Agent
 * Implements features, analyzes code, and creates technical solutions
 */
export class DeveloperAgent extends BaseAgent {
  constructor(mcpClientManager, sessionService, config) {
    super(mcpClientManager, sessionService);
    this.config = config;
  }

  getName() {
    return 'developer';
  }

  getDescription() {
    return 'Developer agent for feature implementation and code analysis';
  }

  getRequiredContextParams() {
    return ['repoOwner', 'repoName', 'issueNumber'];
  }

  validateContext(context) {
    try {
      const enhancedContext = this.ensureContextMethods(context);
      enhancedContext.validate(this.getRequiredContextParams());
      
      if (!Number.isInteger(enhancedContext.issueNumber) || enhancedContext.issueNumber <= 0) {
        throw new Error('issueNumber must be a positive integer');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Developer Agent context validation failed: ${error.message}`);
    }
  }

  /**
   * Execute Developer Agent workflow
   * @param {Object} context - Execution context with repoOwner, repoName, issueNumber
   * @returns {Promise<AgentResult>} Implementation result
   */
  async execute(context) {
    console.log(chalk.cyan(`\n👨‍💻 Developer Agent working on ${context.repoOwner}/${context.repoName} issue #${context.issueNumber}`));
    
    // Ensure context has required methods and validate
    const enhancedContext = this.ensureContextMethods(context);
    this.validateContext(enhancedContext);

    try {
      // Start session if not provided
      if (!enhancedContext.sessionId) {
        enhancedContext.sessionId = await this.sessionService.createSession(
          'developer', 
          `Repository: ${enhancedContext.repoOwner}/${enhancedContext.repoName}, Issue: #${enhancedContext.issueNumber}`
        );
      }

      await this.logInteraction('agent_start', 'Developer Agent started implementation', {
        repository: enhancedContext.getRepository(),
        issue_number: enhancedContext.issueNumber
      });

      // Step 1: Get issue details using base method with dynamic tool discovery
      const issue = await this.getGitHubIssue(enhancedContext, enhancedContext.issueNumber);
      
      // Step 2: Analyze repository structure using base method with dynamic tool discovery
      const repoAnalysis = await this.analyzeRepository(enhancedContext);
      
      // Step 3: Generate implementation plan
      const implementation = await this.generateImplementation(enhancedContext, issue, repoAnalysis);
      
      // Step 4: Log completion and costs using base method
      await this.logCompletion(enhancedContext);

      const result = {
        implementation,
        issue_details: issue,
        repository_analysis: repoAnalysis,
        session_id: enhancedContext.sessionId
      };

      await this.logInteraction('agent_complete', 'Developer Agent completed implementation', result);
      
      return AgentResult.success(result, 'Implementation analysis completed successfully');
      
    } catch (error) {
      await this.logError(error, { 
        repository: enhancedContext.getRepository(),
        issue_number: enhancedContext.issueNumber 
      });
      console.error(chalk.red(`❌ Developer Agent failed: ${error.message}`));
      return AgentResult.error(`Developer Agent failed: ${error.message}`);
    }
  }


  /**
   * Generate implementation plan using LLM
   */
  async generateImplementation(context, issue, repoAnalysis) {
    const userContent = `Please implement the following issue:\n\n**Title:** ${issue.title}\n\n**Description:**\n${issue.body}\n\nRepository structure:\n${repoAnalysis.structure}\n\nPlease:\n1. Analyze the existing codebase\n2. Plan the implementation\n3. Create/update necessary files\n4. Follow the project's existing patterns and conventions`;

    return await this.generateLLMResponse('developer', this.getDeveloperSystemPrompt.bind(this), userContent, context);
  }


  /**
   * Get Developer agent system prompt
   */
  async getDeveloperSystemPrompt() {
    return await this.generateAgentPrompt('developer', 'Implement features and analyze code');
  }

  /**
   * Future enhancement: Actually create/modify files
   * This would parse the LLM response and create actual code files
   */
  async implementFiles() {
    // Future enhancement: Parse implementation response and create actual files
    // This would include:
    // - Parsing code blocks from the LLM response
    // - Creating new files via GitHub API
    // - Updating existing files
    // - Creating pull requests with the changes
    console.log(chalk.yellow('📝 File implementation would happen here (future enhancement)'));
  }
}