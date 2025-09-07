import chalk from 'chalk';

/**
 * Test Service
 * Handles testing of MCP connections and API integrations
 */
export class TestService {
  constructor(mcpClientManager, configService) {
    this.mcpClientManager = mcpClientManager;
    this.configService = configService;
  }

  /**
   * Test all MCP connections and functionality
   * @returns {Promise<Object>} Test results summary
   */
  async testConnections() {
    console.log(chalk.blue('🔧 Testing connections...\n'));
    
    const results = {
      server_tests: [],
      api_tests: [],
      utility_tests: [],
      overall_success: true
    };

    // Test server connections
    await this.testServerConnections(results);
    
    // Test specific operations  
    console.log(chalk.blue('\nTesting specific operations...'));
    await this.testSpecificOperations(results);
    
    return results;
  }

  /**
   * Test MCP server connections and tool availability
   */
  async testServerConnections(results) {
    const clients = this.mcpClientManager.getClients();
    
    for (const [serverName, client] of Object.entries(clients)) {
      try {
        console.log(chalk.blue(`Testing ${serverName} server...`));
        
        const tools = await this.mcpClientManager.listTools(serverName);
        const toolCount = Array.isArray(tools) ? tools.length : (tools.tools ? tools.tools.length : 0);
        
        console.log(chalk.green(`✓ ${serverName} server: ${toolCount} tools available`));
        
        if (toolCount > 0 && serverName === 'github') {
          const toolNames = Array.isArray(tools) ? tools : tools.tools || [];
          const displayTools = toolNames.slice(0, 3).map(t => typeof t === 'string' ? t : t.name).join(', ');
          console.log(chalk.gray(`  Available tools: ${displayTools}${toolCount > 3 ? '...' : ''}`));
        }
        
        results.server_tests.push({
          server: serverName,
          status: 'success',
          tool_count: toolCount
        });
        
      } catch (error) {
        console.log(chalk.red(`✗ ${serverName} server failed: ${error.message}`));
        results.server_tests.push({
          server: serverName,
          status: 'failed',
          error: error.message
        });
        results.overall_success = false;
      }
    }
  }

  /**
   * Test specific API operations
   */
  async testSpecificOperations(results) {
    // Test OpenAI API
    await this.testOpenAIAPI(results);
    
    // Test Anthropic API if available
    if (process.env.ANTHROPIC_API_KEY) {
      await this.testAnthropicAPI(results);
    } else {
      console.log(chalk.yellow('⚠ Anthropic API: No key provided, skipping test'));
    }

    // Test Google API if available
    if (process.env.GOOGLE_API_KEY) {
      await this.testGoogleAPI(results);
    } else {
      console.log(chalk.yellow('⚠ Google API: No key provided, skipping test'));
    }

    // Test utility functions
    await this.testUtilities(results);
  }

  /**
   * Test OpenAI API integration
   */
  async testOpenAIAPI(results) {
    try {
      const config = this.configService.getConfig();
      const result = await this.mcpClientManager.callTool('litellm', 'llm_chat_completion', {
        messages: [{ role: 'user', content: 'Hello, just testing the connection.' }],
        model: 'gpt-5-nano',
        api_key: config.llm.api_key,
        base_url: config.llm.base_url,
        max_completion_tokens: 10
      });
      
      console.log(chalk.green('✓ OpenAI API test successful'));
      results.api_tests.push({
        provider: 'openai',
        status: 'success'
      });
    } catch (error) {
      console.log(chalk.red(`✗ OpenAI API test failed: ${error.message}`));
      results.api_tests.push({
        provider: 'openai',
        status: 'failed',
        error: error.message
      });
      results.overall_success = false;
    }
  }

  /**
   * Test Anthropic API integration
   */
  async testAnthropicAPI(results) {
    try {
      const result = await this.mcpClientManager.callTool('litellm', 'llm_chat_completion', {
        messages: [{ role: 'user', content: 'Hello, just testing Anthropic integration.' }],
        model: 'claude-3-haiku',
        api_key: process.env.ANTHROPIC_API_KEY,
        max_tokens: 10
      });
      
      console.log(chalk.green('✓ Anthropic API test successful'));
      results.api_tests.push({
        provider: 'anthropic',
        status: 'success'
      });
    } catch (error) {
      console.log(chalk.red(`✗ Anthropic API test failed: ${error.message}`));
      results.api_tests.push({
        provider: 'anthropic',
        status: 'failed',
        error: error.message
      });
      results.overall_success = false;
    }
  }

  /**
   * Test Google API integration
   */
  async testGoogleAPI(results) {
    try {
      const result = await this.mcpClientManager.callTool('litellm', 'llm_chat_completion', {
        messages: [{ role: 'user', content: 'Hello, just testing Google integration.' }],
        model: 'gemini-2.5-flash-lite',
        api_key: process.env.GOOGLE_API_KEY,
        max_tokens: 10
      });
      
      console.log(chalk.green('✓ Google API test successful'));
      results.api_tests.push({
        provider: 'google',
        status: 'success'
      });
    } catch (error) {
      console.log(chalk.red(`✗ Google API test failed: ${error.message}`));
      results.api_tests.push({
        provider: 'google',
        status: 'failed',
        error: error.message
      });
      results.overall_success = false;
    }
  }

  /**
   * Test utility functions
   */
  async testUtilities(results) {
    // Test logging utility
    try {
      const sessionId = 'test-' + Date.now();
      const { default: Logger } = await import('../../utils/logger.js');
      await Logger.createSession(sessionId, 'logs', 'test');
      
      console.log(chalk.green('✓ Logging utility test successful'));
      results.utility_tests.push({
        utility: 'logging',
        status: 'success'
      });
    } catch (error) {
      console.log(chalk.red(`✗ Logging utility test failed: ${error.message}`));
      results.utility_tests.push({
        utility: 'logging',
        status: 'failed',
        error: error.message
      });
      results.overall_success = false;
    }

    // Test state utility
    try {
      const sessionId = 'test-' + Date.now();
      const { default: StateManager } = await import('../../utils/state-manager.js');
      await StateManager.createSession(sessionId, 'logs');
      
      console.log(chalk.green('✓ State utility test successful'));
      results.utility_tests.push({
        utility: 'state',
        status: 'success'
      });
    } catch (error) {
      console.log(chalk.red(`✗ State utility test failed: ${error.message}`));
      results.utility_tests.push({
        utility: 'state',
        status: 'failed',
        error: error.message
      });
      results.overall_success = false;
    }
  }

  /**
   * Validate API keys and configuration
   * @returns {Promise<Object>} Validation results
   */
  async validateConfiguration() {
    console.log(chalk.blue('🔍 Validating configuration and API keys...\n'));
    
    const validation = {
      config_valid: false,
      api_keys: [],
      issues: [],
      warnings: []
    };

    // Use ConfigService validation
    const configCheck = this.configService.checkConfiguration();
    validation.config_valid = configCheck.valid;
    validation.issues.push(...configCheck.issues);
    validation.warnings.push(...configCheck.warnings);

    // Check individual API keys
    const apiKeys = [
      { name: 'GitHub', env: 'GITHUB_TOKEN', required: true },
      { name: 'OpenAI', env: 'OPENAI_API_KEY', required: true },
      { name: 'Anthropic', env: 'ANTHROPIC_API_KEY', required: false },
      { name: 'Google', env: 'GOOGLE_API_KEY', required: false }
    ];

    for (const keyInfo of apiKeys) {
      const hasKey = !!process.env[keyInfo.env];
      validation.api_keys.push({
        name: keyInfo.name,
        present: hasKey,
        required: keyInfo.required
      });

      if (keyInfo.required && !hasKey) {
        validation.issues.push(`${keyInfo.name} API key missing (${keyInfo.env})`);
      } else if (!keyInfo.required && !hasKey) {
        validation.warnings.push(`${keyInfo.name} API key not configured (optional)`);
      }
    }

    return validation;
  }

  /**
   * Run comprehensive system check
   * @returns {Promise<Object>} Complete system status
   */
  async runSystemCheck() {
    console.log(chalk.cyan('🔍 Running comprehensive system check...\n'));
    
    const systemCheck = {
      timestamp: new Date().toISOString(),
      configuration: null,
      connections: null,
      overall_health: 'unknown'
    };

    // Step 1: Validate configuration
    systemCheck.configuration = await this.validateConfiguration();
    
    // Step 2: Test connections (if config is valid)
    if (systemCheck.configuration.config_valid) {
      systemCheck.connections = await this.testConnections();
    }

    // Determine overall health
    const configOk = systemCheck.configuration.config_valid;
    const connectionsOk = systemCheck.connections?.overall_success ?? false;
    
    if (configOk && connectionsOk) {
      systemCheck.overall_health = 'healthy';
      console.log(chalk.green('\n🎉 System check completed - All systems operational!'));
    } else if (configOk) {
      systemCheck.overall_health = 'degraded';
      console.log(chalk.yellow('\n⚠️ System check completed - Some issues found'));
    } else {
      systemCheck.overall_health = 'critical';
      console.log(chalk.red('\n💥 System check completed - Critical issues found'));
    }

    return systemCheck;
  }
}