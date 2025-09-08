import { BaseCommand } from './base-command.js';
import { DeveloperAgent } from '../agents/developer-agent.js';
import chalk from 'chalk';

/**
 * Developer Command
 * Handles developer agent workflow
 */
export class DevCommand extends BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    super(configService, sessionService, mcpClientManager);
    this.agent = new DeveloperAgent(mcpClientManager, sessionService, configService.getConfig());
  }

  /**
   * Execute developer workflow
   * @param {Object} options - Command options
   * @param {string} options.repo - Repository name
   * @param {number} [options.issue] - Issue number
   * @param {string} [options.branch] - Branch name
   * @param {string} [options.session] - Existing session ID
   * @param {boolean} [options.dryRun] - Dry run mode
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} Development result
   */
  async execute(options) {
    const command = 'dev';
    await this.logCommandStart(command, options);

    try {
      // Validate required options
      this.validateOptions(options, ['repo']);

      console.log(chalk.blue('⚡ Starting Development Workflow...'));

      // Create or resume session using base method
      const sessionContext = options.issue ? 
        `Development for ${options.repo} issue #${options.issue}` :
        `Development work on ${options.repo}`;
        
      const sessionId = await this.createOrResumeSession('developer', sessionContext, options);

      // Prepare context using base method
      const context = this.prepareRepositoryContext(options, sessionId, {
        issueNumber: options.issue,
        branch: options.branch,
        dryRun: options.dryRun || false
      });

      // Execute developer agent using base method
      const result = await this.executeAgent(
        command,
        context,
        'development_complete',
        'Development work completed',
        {
          repo: options.repo,
          issue: options.issue,
          dry_run: options.dryRun || false
        }
      );

      // Log additional result metrics after execution
      await this.sessionService.logInteraction('development_metrics', 'Development metrics', {
        repo: options.repo,
        issue: options.issue,
        changes_made: result?.changes?.length || 0,
        tests_run: result?.test_results?.length || 0,
        dry_run: options.dryRun || false
      });

      // Build summary lines
      const summaryLines = [];
      if (result?.changes) {
        summaryLines.push(`Files modified: ${result.changes.length}`);
      }
      if (result?.test_results) {
        const passed = result.test_results.filter(t => t.status === 'passed').length;
        const total = result.test_results.length;
        summaryLines.push(`Tests: ${passed}/${total} passed`);
      }

      // Display summary using base method
      this.displayBasicSummary('Development Work', sessionId, summaryLines);

      if (options.dryRun) {
        console.log(chalk.yellow('🔍 Dry run completed - no actual changes made'));
      }

      if (options.verbose && result.summary) {
        console.log(chalk.yellow('\n📋 Summary:'));
        console.log(result.summary);
      }

      return {
        session_id: sessionId,
        ...result
      };

    } catch (error) {
      await this.logCommandError(command, error);
      console.error(chalk.red(`❌ Development workflow failed: ${error.message}`));
      throw error;
    }
  }
}