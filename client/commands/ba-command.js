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
    this.agent = new BAAgent(mcpClientManager, sessionService, configService.getConfig());
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

      // Create or resume session using base method
      const sessionId = await this.createOrResumeSession(
        'ba', 
        `Feature analysis for ${options.repo}: ${options.description}`, 
        options
      );

      // Prepare context using base method
      const context = this.prepareRepositoryContext(options, sessionId, {
        featureDescription: options.description,
        repo: options.repo,
        description: options.description
      });

      // Execute BA agent using base method
      const result = await this.executeAgent(
        command,
        context,
        'ba_analysis_complete',
        'BA analysis completed',
        {
          repo: options.repo
        }
      );

      // Log additional result metrics after execution
      await this.sessionService.logInteraction('ba_analysis_metrics', 'BA analysis metrics', {
        repo: options.repo,
        requirements_count: result?.requirements?.length || 0,
        acceptance_criteria_count: result?.acceptance_criteria?.length || 0,
        technical_considerations: result?.technical_considerations?.length || 0
      });

      // Display summary using base method with additional lines
      const summaryLines = [
        `Requirements identified: ${result.requirements?.length || 0}`,
        `Acceptance criteria: ${result.acceptance_criteria?.length || 0}`
      ];
      this.displayBasicSummary('Business Analysis', sessionId, summaryLines);

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