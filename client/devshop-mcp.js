#!/usr/bin/env node

import { Command } from 'commander';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import GitHubDirectClient from './github-direct-client.js';
import LiteLLMDirectClient from './litellm-direct-client.js';
import Logger from '../utils/logger.js';
import StateManager from '../utils/state-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

class DevShopOrchestrator {
  constructor() {
    this.mcpClients = {};
    this.activeSession = null;
    this.errorCount = 0;
    this.maxErrors = 3;
    this.config = null;
  }

  async loadConfig() {
    try {
      const configPath = path.join(rootDir, 'config', 'default.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configContent);

      // Resolve environment variables
      this.config = this.resolveEnvVars(this.config);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  resolveEnvVars(obj) {
    if (typeof obj === 'string' && obj.startsWith('env:')) {
      const envVar = obj.substring(4);
      return process.env[envVar] || obj;
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVars(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveEnvVars(value);
      }
      return resolved;
    }
    return obj;
  }

  async initializeMCPClients() {
    const serverConfigs = this.config.mcp_servers;

    for (const [serverName, config] of Object.entries(serverConfigs)) {
      try {
        if (serverName === 'github' && config.type === 'docker') {
          // Use direct GitHub client
          const githubToken = process.env.GITHUB_TOKEN || this.config.github?.token;
          if (!githubToken) {
            throw new Error('No GitHub token found. Set GITHUB_TOKEN environment variable.');
          }

          const githubClient = new GitHubDirectClient(githubToken);
          await githubClient.connect();
          this.mcpClients[serverName] = githubClient;
          console.log(chalk.green(`✓ Connected to ${serverName} MCP server (direct)`));
        } else if (serverName === 'litellm' && config.type === 'local') {
          // Use direct LiteLLM client
          const litellmClient = new LiteLLMDirectClient();
          await litellmClient.connect();
          this.mcpClients[serverName] = litellmClient;
          console.log(chalk.green(`✓ Connected to ${serverName} MCP server (direct)`));
        } else if (serverName === 'logging' || serverName === 'state') {
          // Skip - using direct utility modules instead of MCP servers
          console.log(chalk.green(`✓ Using ${serverName} utility module (direct)`));
        } else {
          await this.connectToMCPServer(serverName, config);
          console.log(chalk.green(`✓ Connected to ${serverName} MCP server (${config.type})`));
        }
      } catch (error) {
        console.error(chalk.red(`✗ Failed to connect to ${serverName} server: ${error.message}`));

        throw error;
      }
    }
  }

  async connectToMCPServer(serverName, config) {
    let transport;

    if (config.type === 'docker') {
      // Start GitHub MCP server directly via Docker run
      const githubToken = process.env.GITHUB_TOKEN || this.config.github?.token;
      if (!githubToken) {
        console.log(chalk.yellow(`  No GitHub token found, trying fallback...`));
        if (config.fallback) {
          return this.connectToMCPServer(serverName, config.fallback);
        }
        throw new Error('No GitHub token found. Set GITHUB_TOKEN environment variable.');
      }

      transport = new StdioClientTransport({
        command: 'docker',
        args: [
          'run', '--rm', '-i',
          '-e', `GITHUB_PERSONAL_ACCESS_TOKEN=${githubToken}`,
          config.image || 'ghcr.io/github/github-mcp-server:latest',
          'stdio'
        ]
      });
    } else if (config.type === 'local') {
      const serverPath = config.path.startsWith('/')
        ? config.path
        : path.join(rootDir, config.path);

      transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath]
      });
    } else {
      throw new Error(`Unknown server type: ${config.type}`);
    }

    const client = new Client(
      { name: `devshop-${serverName}-client`, version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.mcpClients[serverName] = client;
  }

  async callMCPTool(serverName, toolName, args) {
    try {
      const client = this.mcpClients[serverName];
      if (!client) {
        throw new Error(`MCP client '${serverName}' not initialized`);
      }

      let result;
      if (serverName === 'github' && client instanceof GitHubDirectClient) {
        // Use direct GitHub client
        result = await client.callTool(toolName, args);
      } else if (serverName === 'litellm' && client instanceof LiteLLMDirectClient) {
        // Use direct LiteLLM client
        result = await client.callTool(toolName, args);
      } else {
        // Use standard MCP client
        result = await client.request(
          {
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: args
            }
          }
        );
      }

      return result;
    } catch (error) {
      this.errorCount++;
      await this.logError(error, { serverName, toolName, args });

      if (this.errorCount >= this.maxErrors) {
        throw new Error(`Maximum error count (${this.maxErrors}) reached. Stopping execution.`);
      }

      throw error;
    }
  }

  async createSession(agentRole, projectContext = '') {
    const sessionId = uuidv4();
    const timestamp = new Date().toISOString();

    this.activeSession = {
      id: sessionId,
      agentRole,
      projectContext,
      startTime: timestamp,
      costBudget: this.config.cost_controls?.max_cost_per_session || 5.00,
      tokenBudget: this.config.cost_controls?.max_tokens_per_session || 10000
    };

    // Create session in state and logging
    const stateDir = path.join(rootDir, 'logs');
    const logDir = path.join(rootDir, 'logs');

    await StateManager.createSession(sessionId, stateDir, {
      agent_role: agentRole,
      project_context: projectContext,
      cost_budget: this.activeSession.costBudget,
      token_budget: this.activeSession.tokenBudget
    });

    await Logger.createSession(sessionId, logDir, agentRole, projectContext);

    console.log(chalk.blue(`🚀 Started session ${sessionId} with ${agentRole} agent`));
    return sessionId;
  }

  async logInteraction(type, content, metadata = {}) {
    if (!this.activeSession) return;

    const logDir = path.join(rootDir, 'logs');
    await Logger.logInteraction(
      this.activeSession.id,
      logDir,
      type,
      content,
      this.activeSession.agentRole,
      metadata
    );
  }

  async logError(error, context = {}) {
    if (!this.activeSession) return;

    const logDir = path.join(rootDir, 'logs');
    await Logger.logInteraction(
      this.activeSession.id,
      logDir,
      'error',
      error.message,
      this.activeSession.agentRole,
      { context, stack: error.stack }
    );
  }

  getProviderFromModel(model) {
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gemini')) return 'google';
    return 'unknown';
  }

  async checkLimits() {
    if (!this.activeSession) return true;

    const usage = await this.callMCPTool('litellm', 'llm_check_limits', {
      max_tokens: this.activeSession.tokenBudget,
      max_cost: this.activeSession.costBudget
    });

    const result = JSON.parse(usage.content[0].text);

    if (!result.within_limits) {
      console.log(chalk.yellow('⚠️  Budget limits exceeded:'));
      result.violations.forEach(violation => {
        console.log(chalk.yellow(`  ${violation.type}: ${violation.current} > ${violation.limit}`));
      });
      return false;
    }

    return true;
  }

  async executeBAAgent(repoOwner, repoName, featureDescription) {
    console.log(chalk.cyan(`\n🔍 BA Agent analyzing request for ${repoOwner}/${repoName}`));

    const sessionId = await this.createSession('ba', `Repository: ${repoOwner}/${repoName}`);

    try {
      // Get available tools
      const availableTools = [
        'github_list_files', 'github_read_file', 'github_list_issues',
        'github_create_issue', 'state_set', 'state_get'
      ];

      // Create agent prompt
      const promptResult = await this.callMCPTool('litellm', 'llm_create_agent_prompt', {
        agent_role: 'ba',
        project_context: `Analyzing repository ${repoOwner}/${repoName} for feature: ${featureDescription}`,
        session_id: sessionId,
        mcp_tools: availableTools,
        cost_budget: this.activeSession.costBudget
      });

      const systemPrompt = promptResult.content[0].text;

      // Analyze the repository structure
      await this.logInteraction('user_input', `Analyze ${repoOwner}/${repoName} and create requirements for: ${featureDescription}`);

      const repoFiles = await this.callMCPTool('github', 'github_list_files', {
        owner: repoOwner,
        repo: repoName,
        token: this.config.github.token
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Please analyze the repository ${repoOwner}/${repoName} and create detailed requirements for this feature: "${featureDescription}"\n\nRepository structure:\n${repoFiles.content[0].text}\n\nPlease:\n1. Ask any clarifying questions if needed\n2. Analyze the existing codebase structure\n3. Create a detailed GitHub issue with requirements\n4. Include acceptance criteria and technical considerations`
        }
      ];

      const completion = await this.callMCPTool('litellm', 'llm_chat_completion', {
        messages: messages,
        model: this.config.models.ba,
        api_key: this.config.llm.api_key,
        base_url: this.config.llm.base_url,
        session_id: sessionId,
        agent_role: 'ba'
      });

      const response = JSON.parse(completion.content[0].text);
      await this.logInteraction('agent_response', response.content);

      // Log cost
      const logDir = path.join(rootDir, 'logs');
      await Logger.logCost(
        sessionId,
        logDir,
        response.usage.model,
        response.usage.total_tokens,
        response.usage.cost,
        this.getProviderFromModel(response.usage.model)
      );

      console.log(chalk.green('\n📋 BA Agent Response:'));
      console.log(response.content);

      // Check if we should create an issue based on the response
      if (response.content.includes('GitHub issue') || response.content.includes('requirements')) {
        console.log(chalk.blue('\n🎫 Creating GitHub issue...'));

        // Extract title and body (simplified - in reality would use better parsing)
        const issueTitle = `Feature: ${featureDescription}`;
        const issueBody = `# Requirements Analysis\n\n${response.content}\n\n---\n*Generated by DevShop BA Agent*\nSession: ${sessionId}`;

        const issueResult = await this.callMCPTool('github', 'github_create_issue', {
          owner: repoOwner,
          repo: repoName,
          title: issueTitle,
          body: issueBody,
          labels: ['enhancement', 'devshop-generated'],
          token: this.config.github.token
        });

        console.log(chalk.green(`✅ ${issueResult.content[0].text}`));
      }

      const usage = await this.callMCPTool('litellm', 'llm_get_usage', {});
      const usageData = JSON.parse(usage.content[0].text);
      console.log(chalk.gray(`\n💰 Session cost: $${usageData.total_cost.toFixed(4)} (${usageData.total_tokens} tokens)`));

    } catch (error) {
      console.error(chalk.red(`❌ BA Agent failed: ${error.message}`));
      throw error;
    }
  }

  async executeDevAgent(repoOwner, repoName, issueNumber) {
    console.log(chalk.cyan(`\n👨‍💻 Developer Agent working on ${repoOwner}/${repoName} issue #${issueNumber}`));

    const sessionId = await this.createSession('developer', `Repository: ${repoOwner}/${repoName}, Issue: #${issueNumber}`);

    try {
      // Get the issue details
      const issue = await this.callMCPTool('github', 'github_get_issue', {
        owner: repoOwner,
        repo: repoName,
        issue_number: issueNumber,
        token: this.config.github.token
      });

      const issueData = JSON.parse(issue.content[0].text);

      // Get available tools
      const availableTools = [
        'github_list_files', 'github_read_file', 'github_create_file',
        'state_set', 'state_get'
      ];

      // Create agent prompt
      const promptResult = await this.callMCPTool('litellm', 'llm_create_agent_prompt', {
        agent_role: 'developer',
        project_context: `Implementing issue #${issueNumber} in ${repoOwner}/${repoName}: ${issueData.title}`,
        session_id: sessionId,
        mcp_tools: availableTools,
        cost_budget: this.activeSession.costBudget
      });

      const systemPrompt = promptResult.content[0].text;

      await this.logInteraction('user_input', `Implement issue #${issueNumber}: ${issueData.title}`);

      // Get repository structure for context
      const repoFiles = await this.callMCPTool('github', 'github_list_files', {
        owner: repoOwner,
        repo: repoName,
        token: this.config.github.token
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Please implement the following issue:\n\n**Title:** ${issueData.title}\n\n**Description:**\n${issueData.body}\n\nRepository structure:\n${repoFiles.content[0].text}\n\nPlease:\n1. Analyze the existing codebase\n2. Plan the implementation\n3. Create/update necessary files\n4. Follow the project's existing patterns and conventions`
        }
      ];

      const completion = await this.callMCPTool('litellm', 'llm_chat_completion', {
        messages: messages,
        model: this.config.models.developer,
        api_key: this.config.llm.api_key,
        base_url: this.config.llm.base_url,
        session_id: sessionId,
        agent_role: 'developer',
        max_tokens: 2000
      });

      const response = JSON.parse(completion.content[0].text);
      await this.logInteraction('agent_response', response.content);

      // Log cost
      const logDir = path.join(rootDir, 'logs');
      await Logger.logCost(
        sessionId,
        logDir,
        response.usage.model,
        response.usage.total_tokens,
        response.usage.cost,
        this.getProviderFromModel(response.usage.model)
      );

      console.log(chalk.green('\n🔨 Developer Agent Response:'));
      console.log(response.content);

      // If the response suggests creating files, we would implement that here
      // For MVP, we're focusing on the basic workflow

      const usage = await this.callMCPTool('litellm', 'llm_get_usage', {});
      const usageData = JSON.parse(usage.content[0].text);
      console.log(chalk.gray(`\n💰 Session cost: $${usageData.total_cost.toFixed(4)} (${usageData.total_tokens} tokens)`));

    } catch (error) {
      console.error(chalk.red(`❌ Developer Agent failed: ${error.message}`));
      throw error;
    }
  }

  async showLogs(sessionId) {
    try {
      const logDir = path.join(rootDir, 'logs');

      if (sessionId) {
        const logs = await Logger.getSessionLogs(sessionId, logDir);

        console.log(chalk.cyan(`\n📋 Logs for session ${sessionId}:`));
        console.log(logs);
      } else {
        const sessions = await Logger.listSessions(logDir);

        console.log(chalk.cyan('\n📋 Available sessions:'));
        console.log(sessions);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to retrieve logs: ${error.message}`));
    }
  }

  async testConnections() {
    console.log(chalk.blue('\n🔧 Testing connections...\n'));

    // Test servers by listing available tools first
    for (const [serverName, client] of Object.entries(this.mcpClients)) {
      try {
        console.log(chalk.blue(`Testing ${serverName} server...`));

        let toolsResponse;
        if (serverName === 'github' && client instanceof GitHubDirectClient) {
          // Use direct GitHub client
          toolsResponse = await client.listTools();
        } else if (serverName === 'litellm' && client instanceof LiteLLMDirectClient) {
          // Use direct LiteLLM client
          toolsResponse = await client.listTools();
        } else if (serverName === 'logging' || serverName === 'state') {
          // Skip tool listing - using utility modules
          console.log(chalk.green(`✓ ${serverName} utility module: Available`));
          continue;
        } else {
          // Use standard MCP client
          toolsResponse = await client.request({
            method: 'tools/list'
          });
        }

        if (!toolsResponse) {
          console.log(chalk.yellow(`⚠ ${serverName} server: no response received`));
          continue;
        }

        const toolCount = toolsResponse.tools ? toolsResponse.tools.length : 0;
        console.log(chalk.green(`✓ ${serverName} server: ${toolCount} tools available`));

        if (toolCount > 0 && serverName === 'github') {
          console.log(chalk.gray(`  Available tools: ${toolsResponse.tools.slice(0, 3).map(t => t.name).join(', ')}${toolsResponse.tools.length > 3 ? '...' : ''}`));
        }
      } catch (error) {
        console.log(chalk.red(`✗ ${serverName} server failed:`, error.message));
      }
    }

    // Test specific functionality if we can identify the right tools
    console.log(chalk.blue('\nTesting specific operations...'));

    // Test LiteLLM if available
    try {
      const litellmClient = this.mcpClients.litellm;
      if (litellmClient) {
        const result = await this.callMCPTool('litellm', 'llm_chat_completion', {
          messages: [{ role: 'user', content: 'Hello, just testing the connection.' }],
          model: 'gpt-5-nano',
          api_key: this.config.llm.api_key,
          base_url: this.config.llm.base_url,
          max_completion_tokens: 10
        });
        console.log(chalk.green('✓ OpenAI API test successful'));
      }
    } catch (error) {
      console.log(chalk.red('✗ OpenAI API test failed:', error.message));
    }

    // Test Anthropic if available
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const litellmClient = this.mcpClients.litellm;
        if (litellmClient) {
          const result = await this.callMCPTool('litellm', 'llm_chat_completion', {
            messages: [{ role: 'user', content: 'Hello, just testing Anthropic integration.' }],
            model: 'claude-3-haiku',
            api_key: process.env.ANTHROPIC_API_KEY,
            max_tokens: 10
          });
          console.log(chalk.green('✓ Anthropic API test successful'));
        }
      } catch (error) {
        console.log(chalk.red('✗ Anthropic API test failed:', error.message));
      }
    } else {
      console.log(chalk.yellow('⚠ Anthropic API: No key provided, skipping test'));
    }

    // Test Google if available
    if (process.env.GOOGLE_API_KEY) {
      try {
        const litellmClient = this.mcpClients.litellm;
        if (litellmClient) {
          const result = await this.callMCPTool('litellm', 'llm_chat_completion', {
            messages: [{ role: 'user', content: 'Hello, just testing Google integration.' }],
            model: 'gemini-2.5-flash-lite',
            api_key: process.env.GOOGLE_API_KEY,
            max_tokens: 10
          });
          console.log(chalk.green('✓ Google API test successful'));
        }
      } catch (error) {
        console.log(chalk.red('✗ Google API test failed:', error.message));
      }
    } else {
      console.log(chalk.yellow('⚠ Google API: No key provided, skipping test'));
    }

    // Test Logging
    try {
      const sessionId = uuidv4();
      const logDir = path.join(rootDir, 'logs');
      await Logger.createSession(sessionId, logDir, 'test');
      console.log(chalk.green('✓ Logging utility test successful'));
    } catch (error) {
      console.log(chalk.red('✗ Logging utility test failed:', error.message));
    }

    // Test State
    try {
      const sessionId = uuidv4();
      const stateDir = path.join(rootDir, 'logs');
      await StateManager.createSession(sessionId, stateDir);
      console.log(chalk.green('✓ State utility test successful'));
    } catch (error) {
      console.log(chalk.red('✗ State server test failed:', error.message));
    }
  }

  async cleanup() {
    for (const [name, client] of Object.entries(this.mcpClients)) {
      try {
        if (name === 'github' && client instanceof GitHubDirectClient) {
          await client.close();
        } else {
          await client.close();
        }
        console.log(chalk.gray(`Disconnected from ${name} server`));
      } catch (error) {
        console.error(chalk.red(`Error disconnecting from ${name}: ${error.message}`));
      }
    }
  }
}

async function main() {
  const program = new Command();
  const orchestrator = new DevShopOrchestrator();

  program
    .name('devshop')
    .description('DevShop - Self-improving development shop using MCP and AI agents')
    .version('1.0.0');

  program
    .command('ba')
    .description('Run Business Analyst agent to analyze requirements')
    .requiredOption('--repo <repo>', 'Repository in format owner/repo-name')
    .argument('<description>', 'Feature description')
    .action(async (description, options) => {
      try {
        await orchestrator.loadConfig();
        await orchestrator.initializeMCPClients();

        const [owner, repo] = options.repo.split('/');
        if (!owner || !repo) {
          throw new Error('Repository must be in format owner/repo-name');
        }

        await orchestrator.executeBAAgent(owner, repo, description);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      } finally {
        await orchestrator.cleanup();
      }
    });

  program
    .command('dev')
    .description('Run Developer agent to implement features')
    .requiredOption('--repo <repo>', 'Repository in format owner/repo-name')
    .requiredOption('--issue <number>', 'GitHub issue number')
    .action(async (options) => {
      try {
        await orchestrator.loadConfig();
        await orchestrator.initializeMCPClients();

        const [owner, repo] = options.repo.split('/');
        if (!owner || !repo) {
          throw new Error('Repository must be in format owner/repo-name');
        }

        const issueNumber = parseInt(options.issue);
        if (isNaN(issueNumber)) {
          throw new Error('Issue number must be a valid number');
        }

        await orchestrator.executeDevAgent(owner, repo, issueNumber);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      } finally {
        await orchestrator.cleanup();
      }
    });

  program
    .command('logs')
    .description('View session logs')
    .option('--session <id>', 'Specific session ID')
    .action(async (options) => {
      try {
        await orchestrator.loadConfig();
        await orchestrator.initializeMCPClients();
        await orchestrator.showLogs(options.session);
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      } finally {
        await orchestrator.cleanup();
      }
    });

  program
    .command('test')
    .description('Test MCP server connections')
    .action(async () => {
      try {
        await orchestrator.loadConfig();
        await orchestrator.initializeMCPClients();
        await orchestrator.testConnections();
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      } finally {
        await orchestrator.cleanup();
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

main().catch(console.error);