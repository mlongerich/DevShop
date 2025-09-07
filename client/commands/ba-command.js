import { BaseCommand } from './base-command.js';
import { BAAgent } from '../agents/ba-agent.js';
import chalk from 'chalk';

/**
 * BA Command
 * Handles business analyst agent workflow
 */
export class BACommand extends BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    super(configService, sessionService, mcpClientManager);
    this.agent = new BAAgent(mcpClientManager);
  }

  /**
   * Execute BA workflow
   * @param {Object} options - Command options
   * @param {string} options.repo - Repository name
   * @param {string} options.description - Feature description
   * @param {string} [options.session] - Existing session ID
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} BA analysis result
   */
  async execute(options) {
    const command = 'ba';
    await this.logCommandStart(command, options);

    try {
      // Validate required options
      this.validateOptions(options, ['repo', 'description']);

      console.log(chalk.blue('🔍 Starting Business Analysis...'));

      // Create or resume session
      const sessionId = options.session || 
        await this.sessionService.createSession('ba', `Feature analysis for ${options.repo}: ${options.description}`);
      
      this.sessionService.setActiveSession(sessionId);

      // Prepare context
      const context = {
        repo: options.repo,
        description: options.description,
        session_id: sessionId,
        verbose: options.verbose || false
      };

      // Execute BA agent
      const result = await this.agent.execute(context);

      // Log results
      await this.sessionService.logInteraction('ba_analysis_complete', 'BA analysis completed', {
        repo: options.repo,
        requirements_count: result.requirements?.length || 0,
        acceptance_criteria_count: result.acceptance_criteria?.length || 0,
        technical_considerations: result.technical_considerations?.length || 0
      });

      await this.logCommandEnd(command, result);

      // Display summary
      console.log(chalk.green('\n✅ Business Analysis Complete'));
      console.log(chalk.gray(`Session ID: ${sessionId}`));
      console.log(chalk.gray(`Requirements identified: ${result.requirements?.length || 0}`));
      console.log(chalk.gray(`Acceptance criteria: ${result.acceptance_criteria?.length || 0}`));

      if (options.verbose) {
        console.log(chalk.yellow('\n📋 Summary:'));
        console.log(result.summary || 'No summary available');
      }

      return {
        session_id: sessionId,
        ...result
      };

    } catch (error) {
      await this.logCommandError(command, error);
      console.error(chalk.red(`❌ BA analysis failed: ${error.message}`));
      throw error;
    }
  }
}