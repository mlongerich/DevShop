import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
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
      context.validate(this.getRequiredContextParams());
      
      if (!Number.isInteger(context.issueNumber) || context.issueNumber <= 0) {
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
    
    // Validate context
    this.validateContext(context);

    try {
      // Start session if not provided
      if (!context.sessionId) {
        context.sessionId = await this.sessionService.createSession(
          'developer', 
          `Repository: ${context.repoOwner}/${context.repoName}, Issue: #${context.issueNumber}`
        );
      }

      await this.logInteraction('agent_start', 'Developer Agent started implementation', {
        repository: context.getRepository(),
        issue_number: context.issueNumber
      });

      // Step 1: Get issue details
      const issue = await this.getIssueDetails(context);
      
      // Step 2: Analyze repository structure
      const repoAnalysis = await this.analyzeRepository(context);
      
      // Step 3: Generate implementation plan
      const implementation = await this.generateImplementation(context, issue, repoAnalysis);
      
      // Step 4: Log completion and costs
      await this.logCompletion(context);

      const result = {
        implementation,
        issue_details: issue,
        repository_analysis: repoAnalysis,
        session_id: context.sessionId
      };

      await this.logInteraction('agent_complete', 'Developer Agent completed implementation', result);
      
      return AgentResult.success(result, 'Implementation analysis completed successfully');
      
    } catch (error) {
      await this.logError(error, { 
        repository: context.getRepository(),
        issue_number: context.issueNumber 
      });
      console.error(chalk.red(`❌ Developer Agent failed: ${error.message}`));
      return AgentResult.error(`Developer Agent failed: ${error.message}`);
    }
  }

  /**
   * Get GitHub issue details
   */
  async getIssueDetails(context) {
    console.log(chalk.blue(`📋 Fetching issue #${context.issueNumber} details...`));
    
    try {
      const issue = await this.callMCPTool('github', 'github_get_issue', {
        owner: context.repoOwner,
        repo: context.repoName,
        issue_number: context.issueNumber,
        token: this.config.github.token
      });

      const issueData = JSON.parse(issue.content[0].text);
      
      return {
        title: issueData.title,
        body: issueData.body,
        state: issueData.state,
        labels: issueData.labels,
        fetched_at: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to fetch issue details: ${error.message}`);
    }
  }

  /**
   * Analyze repository structure and context
   */
  async analyzeRepository(context) {
    console.log(chalk.blue('📁 Analyzing repository structure...'));
    
    try {
      const repoFiles = await this.callMCPTool('github', 'github_list_files', {
        owner: context.repoOwner,
        repo: context.repoName,
        token: this.config.github.token
      });

      return {
        structure: repoFiles.content[0].text,
        analyzed_at: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to analyze repository: ${error.message}`);
    }
  }

  /**
   * Generate implementation plan using LLM
   */
  async generateImplementation(context, issue, repoAnalysis) {
    console.log(chalk.blue('🤖 Generating implementation plan...'));

    // Load Developer agent system prompt
    const systemPrompt = await this.getDeveloperSystemPrompt();

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Please implement the following issue:\n\n**Title:** ${issue.title}\n\n**Description:**\n${issue.body}\n\nRepository structure:\n${repoAnalysis.structure}\n\nPlease:\n1. Analyze the existing codebase\n2. Plan the implementation\n3. Create/update necessary files\n4. Follow the project's existing patterns and conventions`
      }
    ];

    const completion = await this.callMCPTool('litellm', 'llm_chat_completion', {
      messages: messages,
      model: this.config.models.developer,
      api_key: this.config.llm.api_key,
      base_url: this.config.llm.base_url,
      session_id: context.sessionId,
      agent_role: 'developer'
    });

    const response = JSON.parse(completion.content[0].text);
    
    console.log(chalk.green('\\n🔨 Developer Agent Response:'));
    console.log(response.content);

    return {
      content: response.content,
      usage: response.usage,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Log completion and cost information
   */
  async logCompletion(context) {
    try {
      const usage = await this.callMCPTool('litellm', 'llm_get_usage', {});
      const usageData = JSON.parse(usage.content[0].text);
      
      console.log(chalk.gray(`\\n💰 Session cost: $${usageData.total_cost.toFixed(4)} (${usageData.total_tokens} tokens)`));
      
      await this.logInteraction('cost_summary', 'Session cost calculated', {
        total_cost: usageData.total_cost,
        total_tokens: usageData.total_tokens,
        session_id: context.sessionId
      });
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not retrieve usage information'));
    }
  }

  /**
   * Get Developer agent system prompt
   */
  async getDeveloperSystemPrompt() {
    try {
      const promptResult = await this.callMCPTool('litellm', 'llm_create_agent_prompt', {
        agent_role: 'developer',
        task_description: 'Implement features and analyze code'
      });
      
      const prompt = JSON.parse(promptResult.content[0].text);
      return prompt.system_prompt;
    } catch (error) {
      // Fallback system prompt
      return "You are a Developer AI assistant. Your role is to write clean, efficient, and well-documented code. Follow best practices, consider edge cases, and ensure code is maintainable and scalable.";
    }
  }

  /**
   * Future enhancement: Actually create/modify files
   * This would parse the LLM response and create actual code files
   */
  async implementFiles(implementation) {
    // TODO: Parse implementation response and create actual files
    // This could include:
    // - Parsing code blocks from the response
    // - Creating new files via GitHub API
    // - Updating existing files
    // - Creating pull requests
    console.log(chalk.yellow('📝 File implementation would happen here (future enhancement)'));
  }
}