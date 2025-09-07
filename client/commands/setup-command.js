import { BaseCommand } from './base-command.js';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Setup Command
 * Handles initial configuration and setup of DevShop
 */
export class SetupCommand extends BaseCommand {
  /**
   * Execute setup command
   * @param {Object} options - Command options
   * @param {boolean} [options.force] - Force overwrite existing config
   * @param {boolean} [options.skipValidation] - Skip API key validation
   * @param {string} [options.configPath] - Custom config path
   * @returns {Promise<Object>} Setup result
   */
  async execute(options = {}) {
    const command = 'setup';
    await this.logCommandStart(command, options);

    try {
      console.log(chalk.blue('🚀 Starting DevShop setup...\n'));

      // Check if already configured
      const configExists = await this.checkExistingConfig(options);
      if (configExists && !options.force) {
        console.log(chalk.yellow('⚠️  Configuration already exists. Use --force to overwrite.'));
        return { status: 'skipped', reason: 'config_exists' };
      }

      // Create directories
      await this.createDirectories();

      // Check environment variables
      const envCheck = await this.checkEnvironmentVariables();

      // Create configuration
      const config = await this.createConfiguration(options, envCheck);

      // Test connections if validation not skipped
      let testResults = null;
      if (!options.skipValidation) {
        testResults = await this.validateSetup();
      }

      // Create initial session
      const sessionId = await this.sessionService.createSession('setup', 'Initial DevShop setup');

      await this.logCommandEnd(command, {
        config_created: true,
        directories_created: true,
        test_results: testResults,
        session_id: sessionId
      });

      // Display setup summary
      this.displaySetupSummary(envCheck, testResults, sessionId);

      return {
        status: 'completed',
        session_id: sessionId,
        config_path: config.path,
        environment_check: envCheck,
        test_results: testResults
      };

    } catch (error) {
      await this.logCommandError(command, error);
      console.error(chalk.red(`❌ Setup failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Check if configuration already exists
   * @param {Object} options - Setup options
   * @returns {Promise<boolean>} True if config exists
   */
  async checkExistingConfig(options) {
    try {
      const configPath = options.configPath || 
        path.join(process.cwd(), 'config', 'default.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create necessary directories
   */
  async createDirectories() {
    const directories = [
      'config',
      'logs',
      'prompts'
    ];

    console.log(chalk.blue('📁 Creating directories...'));

    for (const dir of directories) {
      const dirPath = path.join(process.cwd(), dir);
      try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(chalk.gray(`   ✓ ${dir}/`));
      } catch (error) {
        console.log(chalk.yellow(`   ⚠️  ${dir}/ (already exists)`));
      }
    }
  }

  /**
   * Check environment variables
   * @returns {Promise<Object>} Environment check results
   */
  async checkEnvironmentVariables() {
    console.log(chalk.blue('\n🔐 Checking environment variables...'));

    const requiredKeys = [
      { name: 'GITHUB_TOKEN', required: true, description: 'GitHub API access' },
      { name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API access' }
    ];

    const optionalKeys = [
      { name: 'ANTHROPIC_API_KEY', required: false, description: 'Anthropic Claude API access' },
      { name: 'GOOGLE_API_KEY', required: false, description: 'Google Gemini API access' }
    ];

    const results = {
      required_missing: [],
      optional_missing: [],
      all_present: []
    };

    // Check required keys
    for (const key of requiredKeys) {
      if (process.env[key.name]) {
        console.log(chalk.green(`   ✓ ${key.name} (${key.description})`));
        results.all_present.push(key.name);
      } else {
        console.log(chalk.red(`   ✗ ${key.name} (${key.description}) - REQUIRED`));
        results.required_missing.push(key.name);
      }
    }

    // Check optional keys
    for (const key of optionalKeys) {
      if (process.env[key.name]) {
        console.log(chalk.green(`   ✓ ${key.name} (${key.description})`));
        results.all_present.push(key.name);
      } else {
        console.log(chalk.yellow(`   • ${key.name} (${key.description}) - Optional`));
        results.optional_missing.push(key.name);
      }
    }

    return results;
  }

  /**
   * Create configuration file
   * @param {Object} options - Setup options
   * @param {Object} envCheck - Environment check results
   * @returns {Promise<Object>} Configuration info
   */
  async createConfiguration(options, envCheck) {
    console.log(chalk.blue('\n⚙️  Creating configuration...'));

    const configPath = options.configPath || 
      path.join(process.cwd(), 'config', 'default.json');

    const config = {
      mcp_servers: {
        github: {
          type: "docker",
          enabled: true
        },
        litellm: {
          type: "local",
          enabled: true
        }
      },
      llm: {
        api_key: "env:OPENAI_API_KEY",
        base_url: "https://api.openai.com/v1"
      },
      github: {
        token: "env:GITHUB_TOKEN"
      },
      models: {
        ba: "gpt-5-nano",
        developer: "claude-3-haiku"
      },
      session: {
        max_cost: 10.0,
        max_tokens: 100000,
        timeout: 3600
      }
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`   ✓ Configuration created: ${configPath}`));

    return { path: configPath, config };
  }

  /**
   * Validate setup by testing connections
   * @returns {Promise<Object>} Test results
   */
  async validateSetup() {
    console.log(chalk.blue('\n🧪 Validating setup...'));

    try {
      // Load the new configuration
      await this.configService.loadConfig();

      // Initialize MCP clients
      await this.mcpClientManager.initializeClients();

      // Test basic connections
      const TestService = (await import('../services/test-service.js')).TestService;
      const testService = new TestService(this.mcpClientManager, this.configService);
      
      const results = await testService.testConnections();
      
      if (results.overall_success) {
        console.log(chalk.green('   ✓ All connections working'));
      } else {
        console.log(chalk.yellow('   ⚠️  Some connections failed (check logs)'));
      }

      return results;
    } catch (error) {
      console.log(chalk.red(`   ✗ Validation failed: ${error.message}`));
      return { overall_success: false, error: error.message };
    }
  }

  /**
   * Display setup summary
   * @param {Object} envCheck - Environment check results
   * @param {Object} testResults - Test results
   * @param {string} sessionId - Session ID
   */
  displaySetupSummary(envCheck, testResults, sessionId) {
    console.log(chalk.green('\n🎉 Setup Complete!'));
    console.log(chalk.gray(`Session ID: ${sessionId}`));

    // Environment summary
    if (envCheck.required_missing.length > 0) {
      console.log(chalk.red('\n⚠️  Missing required environment variables:'));
      for (const key of envCheck.required_missing) {
        console.log(chalk.red(`   • ${key}`));
      }
      console.log(chalk.yellow('\nPlease set these variables and run setup again.'));
    }

    if (envCheck.optional_missing.length > 0) {
      console.log(chalk.yellow('\n💡 Optional API keys not configured:'));
      for (const key of envCheck.optional_missing) {
        console.log(chalk.yellow(`   • ${key}`));
      }
    }

    // Test results summary
    if (testResults) {
      const success = testResults.overall_success;
      console.log(success ? 
        chalk.green('\n✅ All systems operational') : 
        chalk.yellow('\n⚠️  Some systems need attention')
      );
    }

    // Next steps
    console.log(chalk.blue('\n📚 Next steps:'));
    console.log(chalk.gray('   • Run "npm test" to verify all connections'));
    console.log(chalk.gray('   • Try "npm run ba -- --repo=user/repo \\"description\\"" for BA workflow'));
    console.log(chalk.gray('   • Try "npm run dev -- --repo=user/repo --issue=1" for development'));
    console.log(chalk.gray('   • Use "npm run logs" to view session logs'));
  }
}