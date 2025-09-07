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
    this.agent = new DeveloperAgent(mcpClientManager);
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

      // Create or resume session
      const sessionContext = options.issue ? 
        `Development for ${options.repo} issue #${options.issue}` :
        `Development work on ${options.repo}`;
        
      const sessionId = options.session || 
        await this.sessionService.createSession('developer', sessionContext);
      
      this.sessionService.setActiveSession(sessionId);

      // Prepare context
      const context = {
        repo: options.repo,
        issue: options.issue,
        branch: options.branch,
        session_id: sessionId,
        dry_run: options.dryRun || false,
        verbose: options.verbose || false
      };

      // Execute developer agent
      const result = await this.agent.execute(context);

      // Log results
      await this.sessionService.logInteraction('development_complete', 'Development work completed', {
        repo: options.repo,
        issue: options.issue,
        changes_made: result.changes?.length || 0,
        tests_run: result.test_results?.length || 0,
        dry_run: options.dryRun || false
      });

      await this.logCommandEnd(command, result);

      // Display summary
      console.log(chalk.green('\n✅ Development Work Complete'));
      console.log(chalk.gray(`Session ID: ${sessionId}`));
      
      if (result.changes) {
        console.log(chalk.gray(`Files modified: ${result.changes.length}`));
      }
      
      if (result.test_results) {
        const passed = result.test_results.filter(t => t.status === 'passed').length;
        const total = result.test_results.length;
        console.log(chalk.gray(`Tests: ${passed}/${total} passed`));
      }

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