#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

// Services
import { ConfigService } from './services/config-service.js';
import { SessionService } from './services/session-service.js';
import { MCPClientManager } from './services/mcp-client-manager.js';

// Commands
import { BACommand } from './commands/ba-command.js';
import { DevCommand } from './commands/dev-command.js';
import { TestCommand } from './commands/test-command.js';
import { LogsCommand } from './commands/logs-command.js';
import { SetupCommand } from './commands/setup-command.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

/**
 * DevShop Main Orchestrator
 * Refactored using Command pattern and service layer architecture
 */
class DevShopOrchestrator {
  constructor() {
    this.configService = new ConfigService();
    this.sessionService = new SessionService();
    this.mcpClientManager = null;
    this.commands = {};
    this.initialized = false;
  }

  /**
   * Initialize all services and commands
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load configuration
      await this.configService.loadConfig();
      const config = this.configService.getConfig();

      // Initialize MCP client manager
      this.mcpClientManager = new MCPClientManager(config);

      // Initialize command instances
      this.commands = {
        ba: new BACommand(this.configService, this.sessionService, this.mcpClientManager),
        dev: new DevCommand(this.configService, this.sessionService, this.mcpClientManager),
        test: new TestCommand(this.configService, this.sessionService, this.mcpClientManager),
        logs: new LogsCommand(this.configService, this.sessionService, this.mcpClientManager),
        setup: new SetupCommand(this.configService, this.sessionService, this.mcpClientManager)
      };

      this.initialized = true;

    } catch (error) {
      console.error(chalk.red(`Failed to initialize DevShop: ${error.message}`));
      throw error;
    }
  }

  /**
   * Initialize MCP clients
   */
  async initializeClients() {
    if (!this.mcpClientManager) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    await this.mcpClientManager.initializeClients();
  }

  /**
   * Execute a command with proper error handling and cleanup
   * @param {string} commandName - Name of command to execute
   * @param {Object} options - Command options
   * @returns {Promise<*>} Command result
   */
  async executeCommand(commandName, options) {
    const command = this.commands[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    try {
      // Initialize if needed (setup command doesn't need clients)
      if (commandName !== 'setup') {
        await this.initializeClients();
      }

      // Execute command
      const result = await command.execute(options);
      return result;

    } catch (error) {
      console.error(chalk.red(`Command '${commandName}' failed: ${error.message}`));
      throw error;
    } finally {
      // Cleanup connections
      if (this.mcpClientManager) {
        await this.mcpClientManager.cleanup();
      }
    }
  }

  /**
   * Get connection status for diagnostics
   * @returns {Object} Connection status
   */
  getConnectionStatus() {
    if (!this.mcpClientManager) {
      return { status: 'not_initialized' };
    }

    return {
      status: 'initialized',
      connections: this.mcpClientManager.getConnectionStatus()
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    if (this.mcpClientManager) {
      await this.mcpClientManager.cleanup();
    }

    // Close any active sessions
    const activeSessionId = this.sessionService.getActiveSession();
    if (activeSessionId) {
      await this.sessionService.closeSession(activeSessionId);
    }
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const program = new Command();
  const orchestrator = new DevShopOrchestrator();

  program
    .name('devshop')
    .description('DevShop - AI-powered development shop with BA and Developer agents')
    .version('1.1.0');

  // Setup command - doesn't need full initialization
  program
    .command('setup')
    .description('Initial setup and configuration')
    .option('--force', 'Force overwrite existing configuration')
    .option('--skip-validation', 'Skip API key validation during setup')
    .option('--config-path <path>', 'Custom configuration file path')
    .action(async (options) => {
      try {
        await orchestrator.initialize();
        await orchestrator.executeCommand('setup', options);
      } catch (error) {
        console.error(chalk.red(`Setup failed: ${error.message}`));
        process.exit(1);
      }
    });

  // BA command
  program
    .command('ba')
    .description('Run Business Analyst agent for requirements analysis')
    .requiredOption('--repo <repo>', 'Repository in format owner/repo-name')
    .argument('<description>', 'Feature description for analysis')
    .option('--session <id>', 'Existing session ID to resume')
    .option('--verbose', 'Verbose output with detailed information')
    .action(async (description, options) => {
      try {
        await orchestrator.initialize();

        const [owner, repo] = options.repo.split('/');
        if (!owner || !repo) {
          throw new Error('Repository must be in format owner/repo-name');
        }

        const commandOptions = {
          repo: options.repo,
          description,
          session: options.session,
          verbose: options.verbose
        };

        await orchestrator.executeCommand('ba', commandOptions);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Developer command
  program
    .command('dev')
    .description('Run Developer agent to implement features')
    .requiredOption('--repo <repo>', 'Repository in format owner/repo-name')
    .option('--issue <number>', 'GitHub issue number to work on')
    .option('--branch <name>', 'Branch name for development work')
    .option('--session <id>', 'Existing session ID to resume')
    .option('--dry-run', 'Dry run mode - analyze without making changes')
    .option('--verbose', 'Verbose output with detailed information')
    .action(async (options) => {
      try {
        await orchestrator.initialize();

        const [owner, repo] = options.repo.split('/');
        if (!owner || !repo) {
          throw new Error('Repository must be in format owner/repo-name');
        }

        if (options.issue) {
          const issueNumber = parseInt(options.issue);
          if (isNaN(issueNumber)) {
            throw new Error('Issue number must be a valid number');
          }
          options.issue = issueNumber;
        }

        await orchestrator.executeCommand('dev', options);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Test command
  program
    .command('test')
    .description('Test system connections and functionality')
    .option('--connections', 'Test only MCP server connections')
    .option('--apis', 'Test only API integrations')
    .option('--utilities', 'Test only utility functions')
    .option('--full', 'Run comprehensive system check')
    .option('--verbose', 'Verbose test output')
    .action(async (options) => {
      try {
        await orchestrator.initialize();
        await orchestrator.executeCommand('test', options);
      } catch (error) {
        console.error(chalk.red(`Test failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Logs command
  program
    .command('logs')
    .description('View and manage session logs')
    .option('--session <id>', 'Show logs for specific session')
    .option('--list', 'List all available sessions')
    .option('--limit <number>', 'Limit number of log entries', parseInt)
    .option('--filter <type>', 'Filter logs by interaction type')
    .option('--errors', 'Show only error logs')
    .option('--export', 'Export logs to file')
    .option('--verbose', 'Verbose log output with metadata')
    .action(async (options) => {
      try {
        await orchestrator.initialize();
        await orchestrator.executeCommand('logs', options);
      } catch (error) {
        console.error(chalk.red(`Logs command failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Status command - lightweight diagnostics
  program
    .command('status')
    .description('Show DevShop system status')
    .action(async () => {
      try {
        await orchestrator.initialize();

        console.log(chalk.blue('🔍 DevShop System Status\n'));

        // Configuration status
        const configCheck = orchestrator.configService.checkConfiguration();
        console.log(chalk.blue('📋 Configuration:'));
        if (configCheck.valid) {
          console.log(chalk.green('   ✓ Configuration loaded successfully'));
        } else {
          console.log(chalk.red('   ✗ Configuration issues detected'));
          configCheck.issues.forEach(issue => {
            console.log(chalk.red(`     • ${issue}`));
          });
        }

        // Connection status
        const connectionStatus = orchestrator.getConnectionStatus();
        console.log(chalk.blue('\n🔌 Connections:'));
        if (connectionStatus.status === 'not_initialized') {
          console.log(chalk.gray('   • MCP clients not initialized (run test to check)'));
        } else {
          for (const [name, connected] of Object.entries(connectionStatus.connections)) {
            const icon = connected ? '✓' : '✗';
            const color = connected ? chalk.green : chalk.red;
            console.log(color(`   ${icon} ${name} server`));
          }
        }

        // Active session
        const activeSession = orchestrator.sessionService.getActiveSession();
        console.log(chalk.blue('\n📋 Session:'));
        if (activeSession) {
          console.log(chalk.green(`   ✓ Active session: ${activeSession}`));
        } else {
          console.log(chalk.gray('   • No active session'));
        }

        console.log(chalk.blue('\n💡 Run "devshop test" for detailed system diagnostics'));

      } catch (error) {
        console.error(chalk.red(`Status check failed: ${error.message}`));
        process.exit(1);
      }
    });

  program.parse();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Shutting down DevShop...'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}