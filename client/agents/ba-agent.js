import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

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
      context.validate(this.getRequiredContextParams());
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
    
    // Validate context
    this.validateContext(context);

    try {
      // Start session if not provided
      if (!context.sessionId) {
        context.sessionId = await this.sessionService.createSession(
          'ba', 
          `Repository: ${context.repoOwner}/${context.repoName}`
        );
      }

      await this.logInteraction('agent_start', 'BA Agent started analysis', {
        repository: context.getRepository(),
        feature_description: context.featureDescription
      });

      // Step 1: Analyze repository structure
      const repoAnalysis = await this.analyzeRepository(context);
      
      // Step 2: Generate requirements analysis
      const requirementsAnalysis = await this.generateRequirements(context, repoAnalysis);
      
      // Step 3: Create GitHub issue if needed
      let issueResult = null;
      if (this.shouldCreateIssue(requirementsAnalysis)) {
        issueResult = await this.createGitHubIssue(context, requirementsAnalysis);
      }

      // Step 4: Log completion and costs
      await this.logCompletion(context);

      const result = {
        analysis: requirementsAnalysis,
        repository_analysis: repoAnalysis,
        issue: issueResult,
        session_id: context.sessionId
      };

      await this.logInteraction('agent_complete', 'BA Agent completed analysis', result);
      
      return AgentResult.success(result, 'Requirements analysis completed successfully');
      
    } catch (error) {
      await this.logError(error, { repository: context.getRepository() });
      console.error(chalk.red(`❌ BA Agent failed: ${error.message}`));
      return AgentResult.error(`BA Agent failed: ${error.message}`);
    }
  }

  /**
   * Analyze repository structure and context
   */
  async analyzeRepository(context) {
    console.log(chalk.blue('📁 Analyzing repository structure...'));
    
    try {
      // Get repository files structure
      const repoFiles = await this.callMCPTool('github', 'github_list_files', {
        owner: context.repoOwner,
        repo: context.repoName,
        path: '',
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
   * Generate requirements analysis using LLM
   */
  async generateRequirements(context, repoAnalysis) {
    console.log(chalk.blue('🤖 Generating requirements analysis...'));

    // Load BA agent system prompt
    const systemPrompt = await this.getBASystemPrompt();

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Please analyze the repository ${context.repoOwner}/${context.repoName} and create detailed requirements for this feature: "${context.featureDescription}"\n\nRepository structure:\n${repoAnalysis.structure}\n\nPlease:\n1. Ask any clarifying questions if needed\n2. Analyze the existing codebase structure\n3. Create a detailed GitHub issue with requirements\n4. Include acceptance criteria and technical considerations`
      }
    ];

    const completion = await this.callMCPTool('litellm', 'llm_chat_completion', {
      messages: messages,
      model: this.config.models.ba,
      api_key: this.config.llm.api_key,
      base_url: this.config.llm.base_url,
      session_id: context.sessionId,
      agent_role: 'ba'
    });

    const response = JSON.parse(completion.content[0].text);
    
    console.log(chalk.green('\\n📋 BA Agent Response:'));
    console.log(response.content);

    return {
      content: response.content,
      usage: response.usage,
      generated_at: new Date().toISOString()
    };
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
    console.log(chalk.blue('\\n🎫 Creating GitHub issue...'));

    const issueTitle = `Feature: ${context.featureDescription}`;
    const issueBody = `# Requirements Analysis\\n\\n${analysis.content}\\n\\n---\\n*Generated by DevShop BA Agent*\\nSession: ${context.sessionId}`;

    try {
      const issueResult = await this.callMCPTool('github', 'github_create_issue', {
        owner: context.repoOwner,
        repo: context.repoName,
        title: issueTitle,
        body: issueBody,
        labels: ['enhancement', 'devshop-generated'],
        token: this.config.github.token
      });

      console.log(chalk.green(`✅ ${issueResult.content[0].text}`));
      
      return {
        title: issueTitle,
        result: issueResult.content[0].text,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not create GitHub issue: ${error.message}`));
      return null;
    }
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
   * Get BA agent system prompt
   */
  async getBASystemPrompt() {
    try {
      const promptResult = await this.callMCPTool('litellm', 'llm_create_agent_prompt', {
        agent_role: 'ba',
        task_description: 'Analyze requirements and create specifications'
      });
      
      const prompt = JSON.parse(promptResult.content[0].text);
      return prompt.system_prompt;
    } catch (error) {
      // Fallback system prompt
      return "You are a Business Analyst AI assistant. Your role is to analyze requirements, create detailed specifications, and ensure business objectives are clearly defined. Focus on understanding user needs, identifying edge cases, and creating comprehensive documentation.";
    }
  }
}