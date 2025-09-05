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
    const servers = [
      { name: 'github', path: path.join(rootDir, 'servers', 'github-server.js') },
      { name: 'openai', path: path.join(rootDir, 'servers', 'openai-server.js') },
      { name: 'logging', path: path.join(rootDir, 'servers', 'logging-server.js') },
      { name: 'state', path: path.join(rootDir, 'servers', 'state-server.js') }
    ];

    for (const server of servers) {
      try {
        const transport = new StdioClientTransport({
          command: 'node',
          args: [server.path]
        });

        const client = new Client(
          { name: `devshop-${server.name}-client`, version: '1.0.0' },
          { capabilities: {} }
        );

        await client.connect(transport);
        this.mcpClients[server.name] = client;
        
        console.log(chalk.green(`✓ Connected to ${server.name} MCP server`));
      } catch (error) {
        console.error(chalk.red(`✗ Failed to connect to ${server.name} server: ${error.message}`));
        throw error;
      }
    }
  }

  async callMCPTool(serverName, toolName, args) {
    try {
      const client = this.mcpClients[serverName];
      if (!client) {
        throw new Error(`MCP client '${serverName}' not initialized`);
      }

      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args
          }
        }
      );

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

    // Create session in state server
    await this.callMCPTool('state', 'state_create_session', {
      session_id: sessionId,
      state_dir: path.join(rootDir, 'logs'),
      initial_state: {
        agent_role: agentRole,
        project_context: projectContext,
        cost_budget: this.activeSession.costBudget,
        token_budget: this.activeSession.tokenBudget
      }
    });

    // Create session in logging server
    await this.callMCPTool('logging', 'logging_create_session', {
      session_id: sessionId,
      log_dir: path.join(rootDir, 'logs'),
      agent_role: agentRole,
      project_context: projectContext
    });

    console.log(chalk.blue(`🚀 Started session ${sessionId} with ${agentRole} agent`));
    return sessionId;
  }

  async logInteraction(type, content, metadata = {}) {
    if (!this.activeSession) return;

    await this.callMCPTool('logging', 'logging_log_interaction', {
      session_id: this.activeSession.id,
      log_dir: path.join(rootDir, 'logs'),
      interaction_type: type,
      content: content,
      agent_role: this.activeSession.agentRole,
      metadata
    });
  }

  async logError(error, context = {}) {
    if (!this.activeSession) return;

    await this.callMCPTool('logging', 'logging_log_interaction', {
      session_id: this.activeSession.id,
      log_dir: path.join(rootDir, 'logs'),
      interaction_type: 'error',
      content: error.message,
      agent_role: this.activeSession.agentRole,
      metadata: { context, stack: error.stack }
    });
  }

  async checkLimits() {
    if (!this.activeSession) return true;

    const usage = await this.callMCPTool('openai', 'openai_check_limits', {
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
      const promptResult = await this.callMCPTool('openai', 'openai_create_agent_prompt', {
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

      const completion = await this.callMCPTool('openai', 'openai_chat_completion', {
        messages: messages,
        model: this.config.models.ba,
        api_key: this.config.openai.api_key,
        session_id: sessionId,
        agent_role: 'ba'
      });

      const response = JSON.parse(completion.content[0].text);
      await this.logInteraction('agent_response', response.content);
      
      // Log cost
      await this.callMCPTool('logging', 'logging_log_cost', {
        session_id: sessionId,
        log_dir: path.join(rootDir, 'logs'),
        model: response.usage.model,
        tokens_used: response.usage.total_tokens,
        cost: response.usage.cost,
        agent_role: 'ba',
        operation: 'requirements_analysis'
      });

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

      const usage = await this.callMCPTool('openai', 'openai_get_usage', {});
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
      const promptResult = await this.callMCPTool('openai', 'openai_create_agent_prompt', {
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

      const completion = await this.callMCPTool('openai', 'openai_chat_completion', {
        messages: messages,
        model: this.config.models.developer,
        api_key: this.config.openai.api_key,
        session_id: sessionId,
        agent_role: 'developer',
        max_tokens: 2000
      });

      const response = JSON.parse(completion.content[0].text);
      await this.logInteraction('agent_response', response.content);

      // Log cost
      await this.callMCPTool('logging', 'logging_log_cost', {
        session_id: sessionId,
        log_dir: path.join(rootDir, 'logs'),
        model: response.usage.model,
        tokens_used: response.usage.total_tokens,
        cost: response.usage.cost,
        agent_role: 'developer',
        operation: 'code_implementation'
      });

      console.log(chalk.green('\n🔨 Developer Agent Response:'));
      console.log(response.content);

      // If the response suggests creating files, we would implement that here
      // For MVP, we're focusing on the basic workflow

      const usage = await this.callMCPTool('openai', 'openai_get_usage', {});
      const usageData = JSON.parse(usage.content[0].text);
      console.log(chalk.gray(`\n💰 Session cost: $${usageData.total_cost.toFixed(4)} (${usageData.total_tokens} tokens)`));

    } catch (error) {
      console.error(chalk.red(`❌ Developer Agent failed: ${error.message}`));
      throw error;
    }
  }

  async showLogs(sessionId) {
    try {
      if (sessionId) {
        const logs = await this.callMCPTool('logging', 'logging_get_session_logs', {
          session_id: sessionId,
          log_dir: path.join(rootDir, 'logs')
        });

        console.log(chalk.cyan(`\n📋 Logs for session ${sessionId}:`));
        console.log(JSON.parse(logs.content[0].text));
      } else {
        const sessions = await this.callMCPTool('logging', 'logging_list_sessions', {
          log_dir: path.join(rootDir, 'logs')
        });

        console.log(chalk.cyan('\n📋 Available sessions:'));
        console.log(JSON.parse(sessions.content[0].text));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to retrieve logs: ${error.message}`));
    }
  }

  async testConnections() {
    console.log(chalk.blue('\n🔧 Testing connections...\n'));

    // Test GitHub
    try {
      const result = await this.callMCPTool('github', 'github_list_files', {
        owner: 'octocat',
        repo: 'Hello-World',
        token: this.config.github.token
      });
      console.log(chalk.green('✓ GitHub connection working'));
    } catch (error) {
      console.log(chalk.red('✗ GitHub connection failed:', error.message));
    }

    // Test OpenAI
    try {
      const result = await this.callMCPTool('openai', 'openai_chat_completion', {
        messages: [{ role: 'user', content: 'Hello, just testing the connection.' }],
        model: 'gpt-4o-mini',
        api_key: this.config.openai.api_key,
        max_tokens: 10
      });
      console.log(chalk.green('✓ OpenAI connection working'));
    } catch (error) {
      console.log(chalk.red('✗ OpenAI connection failed:', error.message));
    }

    // Test Logging
    try {
      const sessionId = uuidv4();
      await this.callMCPTool('logging', 'logging_create_session', {
        session_id: sessionId,
        log_dir: path.join(rootDir, 'logs'),
        agent_role: 'test'
      });
      console.log(chalk.green('✓ Logging server working'));
    } catch (error) {
      console.log(chalk.red('✗ Logging server failed:', error.message));
    }

    // Test State
    try {
      const sessionId = uuidv4();
      await this.callMCPTool('state', 'state_create_session', {
        session_id: sessionId,
        state_dir: path.join(rootDir, 'logs')
      });
      console.log(chalk.green('✓ State server working'));
    } catch (error) {
      console.log(chalk.red('✗ State server failed:', error.message));
    }
  }

  async cleanup() {
    for (const [name, client] of Object.entries(this.mcpClients)) {
      try {
        await client.close();
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