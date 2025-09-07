import GitHubDirectClient from '../clients/github-direct-client.js';
import LiteLLMDirectClient from '../clients/litellm-direct-client.js';
import { FastMCPDirectClient } from '../clients/fastmcp-direct-client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * MCP Client Manager
 * Handles creation, management, and communication with MCP clients
 * Implements the Factory pattern for client creation
 */
export class MCPClientManager {
  constructor(config) {
    this.config = config;
    this.clients = {};
    this.errorCount = 0;
    this.maxErrors = 3;
  }

  /**
   * Initialize all MCP clients based on configuration
   */
  async initializeClients() {
    const serverConfigs = this.config.mcp_servers;

    for (const [serverName, config] of Object.entries(serverConfigs)) {
      try {
        await this.createClient(serverName, config);
        console.log(chalk.green(`✓ Connected to ${serverName} MCP server (${config.type})`));
      } catch (error) {
        console.error(chalk.red(`✗ Failed to connect to ${serverName} server: ${error.message}`));
        throw error;
      }
    }
  }

  /**
   * Create a specific MCP client
   * @param {string} serverName - Name of the server
   * @param {Object} config - Server configuration
   */
  async createClient(serverName, config) {
    switch (serverName) {
      case 'github':
        await this.createGitHubClient(config);
        break;
      
      case 'litellm':
        await this.createLiteLLMClient(config);
        break;

      case 'fastmcp':
      case 'fastmcp-litellm':
        await this.createFastMCPClient(config);
        break;
      
      default:
        await this.createGenericClient(serverName, config);
        break;
    }
  }

  /**
   * Create GitHub direct client
   */
  async createGitHubClient(config) {
    if (config.type === 'docker') {
      const githubToken = process.env.GITHUB_TOKEN || this.config.github?.token;
      if (!githubToken) {
        throw new Error('No GitHub token found. Set GITHUB_TOKEN environment variable.');
      }

      const githubClient = new GitHubDirectClient(githubToken);
      await githubClient.connect();
      this.clients['github'] = githubClient;
    } else {
      throw new Error(`Unsupported GitHub client type: ${config.type}`);
    }
  }

  /**
   * Create LiteLLM direct client
   */
  async createLiteLLMClient(config) {
    if (config.type === 'local') {
      const litellmClient = new LiteLLMDirectClient();
      await litellmClient.connect();
      this.clients['litellm'] = litellmClient;
    } else {
      throw new Error(`Unsupported LiteLLM client type: ${config.type}`);
    }
  }

  /**
   * Create FastMCP direct client
   */
  async createFastMCPClient(config) {
    if (config.type === 'local' || config.type === 'fastmcp') {
      const fastmcpClient = new FastMCPDirectClient({
        sessionId: config.sessionId || `devshop_${Date.now()}`,
        userId: config.userId || 'devshop'
      });
      
      await fastmcpClient.connect();
      this.clients['fastmcp'] = fastmcpClient;
      this.clients['litellm'] = fastmcpClient; // Alias for backward compatibility
    } else {
      throw new Error(`Unsupported FastMCP client type: ${config.type}`);
    }
  }

  /**
   * Create generic MCP client via stdio transport
   */
  async createGenericClient(serverName, config) {
    if (config.type === 'stdio') {
      const client = new Client(
        {
          name: `devshop-${serverName}-client`,
          version: '1.0.0',
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      const serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      const transport = new StdioClientTransport({
        reader: serverProcess.stdout,
        writer: serverProcess.stdin,
      });

      await client.connect(transport);
      this.clients[serverName] = client;
    } else {
      throw new Error(`Unsupported client type for ${serverName}: ${config.type}`);
    }
  }

  /**
   * Call a tool on an MCP server
   * @param {string} serverName - Server name
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async callTool(serverName, toolName, args) {
    const client = this.clients[serverName];
    if (!client) {
      throw new Error(`MCP server ${serverName} not found or not connected`);
    }

    try {
      let result;
      
      if (client instanceof GitHubDirectClient || client instanceof LiteLLMDirectClient) {
        // Direct clients have their own callTool method
        result = await client.callTool(toolName, args);
      } else {
        // Generic MCP clients use SDK method
        result = await client.request(
          {
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: args,
            },
          },
          null
        );
      }

      // Reset error count on successful call
      this.errorCount = 0;
      return result;
      
    } catch (error) {
      this.errorCount++;
      
      if (this.errorCount >= this.maxErrors) {
        throw new Error(`Too many errors (${this.maxErrors}) calling ${serverName}:${toolName}. Last error: ${error.message}`);
      }
      
      throw new Error(`MCP call failed for ${serverName}:${toolName}: ${error.message}`);
    }
  }

  /**
   * Get list of available tools for a server
   * @param {string} serverName - Server name
   * @returns {Promise<Array>} List of available tools
   */
  async listTools(serverName) {
    const client = this.clients[serverName];
    if (!client) {
      throw new Error(`MCP server ${serverName} not found or not connected`);
    }

    try {
      if (client instanceof GitHubDirectClient || client instanceof LiteLLMDirectClient) {
        return await client.listTools();
      } else {
        const result = await client.request({ method: 'tools/list' }, null);
        return result.tools || [];
      }
    } catch (error) {
      throw new Error(`Failed to list tools for ${serverName}: ${error.message}`);
    }
  }

  /**
   * Get all connected clients
   * @returns {Object} Map of client names to client instances
   */
  getClients() {
    return { ...this.clients };
  }

  /**
   * Check if a specific client is connected
   * @param {string} serverName - Server name
   * @returns {boolean} True if connected
   */
  isConnected(serverName) {
    return !!this.clients[serverName];
  }

  /**
   * Get connection status for all clients
   * @returns {Object} Connection status map
   */
  getConnectionStatus() {
    const status = {};
    for (const [name] of Object.entries(this.config.mcp_servers || {})) {
      status[name] = this.isConnected(name);
    }
    return status;
  }

  /**
   * Cleanup all connections
   */
  async cleanup() {
    for (const [name, client] of Object.entries(this.clients)) {
      try {
        if (client instanceof GitHubDirectClient || client instanceof LiteLLMDirectClient) {
          await client.close();
        } else if (client && typeof client.close === 'function') {
          await client.close();
        }
        console.log(chalk.gray(`Disconnected from ${name} server`));
      } catch (error) {
        console.error(chalk.red(`Error disconnecting from ${name}: ${error.message}`));
      }
    }
    
    this.clients = {};
  }
}