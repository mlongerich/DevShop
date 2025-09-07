import { BaseCommand } from './base-command.js';
import { TestService } from '../services/test-service.js';
import chalk from 'chalk';

/**
 * Test Command
 * Handles system testing and validation
 */
export class TestCommand extends BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    super(configService, sessionService, mcpClientManager);
    this.testService = new TestService(mcpClientManager, configService);
  }

  /**
   * Execute system tests
   * @param {Object} options - Command options
   * @param {boolean} [options.connections] - Test only connections
   * @param {boolean} [options.apis] - Test only APIs
   * @param {boolean} [options.utilities] - Test only utilities
   * @param {boolean} [options.full] - Run full system check
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} Test results
   */
  async execute(options = {}) {
    const command = 'test';
    await this.logCommandStart(command, options);

    try {
      console.log(chalk.blue('🧪 Starting System Tests...'));

      // Create session for test results
      const sessionId = await this.sessionService.createSession('test', 'System testing and validation');
      this.sessionService.setActiveSession(sessionId);

      let result;

      if (options.full) {
        // Run comprehensive system check
        result = await this.testService.runSystemCheck();
      } else if (options.connections) {
        // Test only connections
        result = { connections: await this.testService.testConnections() };
      } else if (options.apis) {
        // Test only APIs
        result = { api_tests: [] };
        await this.testService.testSpecificOperations(result);
      } else if (options.utilities) {
        // Test only utilities
        result = { utility_tests: [] };
        await this.testService.testUtilities(result);
      } else {
        // Default: test connections and basic functionality
        result = await this.testService.testConnections();
      }

      // Log test results
      await this.sessionService.logInteraction('system_test_complete', 'System tests completed', {
        test_type: this.getTestType(options),
        overall_success: result.overall_success || result.connections?.overall_success,
        server_tests: result.server_tests?.length || result.connections?.server_tests?.length || 0,
        api_tests: result.api_tests?.length || result.connections?.api_tests?.length || 0,
        utility_tests: result.utility_tests?.length || result.connections?.utility_tests?.length || 0
      });

      await this.logCommandEnd(command, result);

      // Display results summary
      this.displayTestResults(result, options);

      return {
        session_id: sessionId,
        ...result
      };

    } catch (error) {
      await this.logCommandError(command, error);
      console.error(chalk.red(`❌ System tests failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Determine test type from options
   * @param {Object} options - Test options
   * @returns {string} Test type description
   */
  getTestType(options) {
    if (options.full) return 'full_system_check';
    if (options.connections) return 'connections_only';
    if (options.apis) return 'apis_only';
    if (options.utilities) return 'utilities_only';
    return 'default_connections';
  }

  /**
   * Display test results in a formatted way
   * @param {Object} result - Test results
   * @param {Object} options - Test options
   */
  displayTestResults(result, options) {
    const testData = result.connections || result;
    
    // Overall status
    const success = testData.overall_success || testData.overall_health === 'healthy';
    if (success) {
      console.log(chalk.green('\n✅ All tests passed!'));
    } else {
      console.log(chalk.red('\n❌ Some tests failed'));
    }

    // Server tests
    if (testData.server_tests) {
      console.log(chalk.blue('\n🔌 Server Connections:'));
      for (const test of testData.server_tests) {
        const icon = test.status === 'success' ? '✓' : '✗';
        const color = test.status === 'success' ? chalk.green : chalk.red;
        console.log(color(`  ${icon} ${test.server}: ${test.tool_count || 0} tools`));
      }
    }

    // API tests
    if (testData.api_tests && testData.api_tests.length > 0) {
      console.log(chalk.blue('\n🌐 API Tests:'));
      for (const test of testData.api_tests) {
        const icon = test.status === 'success' ? '✓' : '✗';
        const color = test.status === 'success' ? chalk.green : chalk.red;
        console.log(color(`  ${icon} ${test.provider} API`));
      }
    }

    // Utility tests
    if (testData.utility_tests && testData.utility_tests.length > 0) {
      console.log(chalk.blue('\n🛠️  Utility Tests:'));
      for (const test of testData.utility_tests) {
        const icon = test.status === 'success' ? '✓' : '✗';
        const color = test.status === 'success' ? chalk.green : chalk.red;
        console.log(color(`  ${icon} ${test.utility} utility`));
      }
    }

    // Configuration issues
    if (result.configuration) {
      const config = result.configuration;
      if (config.issues && config.issues.length > 0) {
        console.log(chalk.red('\n⚠️  Configuration Issues:'));
        for (const issue of config.issues) {
          console.log(chalk.red(`  • ${issue}`));
        }
      }
      
      if (config.warnings && config.warnings.length > 0 && options.verbose) {
        console.log(chalk.yellow('\n⚠️  Configuration Warnings:'));
        for (const warning of config.warnings) {
          console.log(chalk.yellow(`  • ${warning}`));
        }
      }
    }

    console.log(chalk.gray(`\nSession ID: ${result.session_id || 'N/A'}`));
  }
}