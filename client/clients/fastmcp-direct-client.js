#!/usr/bin/env node

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Direct JSON-RPC client for FastMCP LiteLLM server
 * Enhanced client with session management and better error handling
 */
class FastMCPDirectClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.sessionId = options.sessionId || `client_${Date.now()}`;
    this.userId = options.userId || 'anonymous';
    this.connected = false;
    this.tools = new Map();
  }

  async connect() {
    if (this.process) {
      throw new Error('Already connected');
    }

    const serverPath = path.join(__dirname, '..', '..', 'servers', 'fastmcp-litellm-server.js');
    
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';

    this.process.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim() && line.includes('"jsonrpc"')) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse JSON-RPC message:', line, error);
          }
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.error('FastMCP Server error:', data.toString());
    });

    this.process.on('exit', (code) => {
      this.connected = false;
      this.emit('disconnect', code);
      this.rejectAllPendingRequests(new Error(`Server exited with code ${code}`));
    });

    // Initialize MCP handshake
    await this.initialize();
    
    // Load available tools
    await this.loadTools();
    
    this.connected = true;
    this.emit('connect');
  }

  async initialize() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'fastmcp-direct-client',
        version: '1.1.0'
      }
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${response.error.message}`);
    }

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});
    
    return response.result;
  }

  async loadTools() {
    try {
      const response = await this.sendRequest('tools/list', {});
      if (response.result && response.result.tools) {
        response.result.tools.forEach(tool => {
          this.tools.set(tool.name, tool);
        });
      }
    } catch (error) {
      console.warn('Failed to load tools:', error.message);
    }
  }

  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(message.id);
      
      clearTimeout(timeout);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'Unknown error'));
      } else {
        resolve(message);
      }
    } else if (message.method) {
      // Handle notifications or server-initiated requests
      this.emit('notification', message);
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Not connected'));
        return;
      }

      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  sendNotification(method, params = {}) {
    if (!this.process) {
      throw new Error('Not connected');
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  rejectAllPendingRequests(error) {
    for (const [id, { reject, timeout }] of this.pendingRequests.entries()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pendingRequests.clear();
  }

  // Enhanced tool execution methods

  async chatCompletion(params) {
    const enhancedParams = {
      session_id: this.sessionId,
      user_id: this.userId,
      ...params
    };

    const response = await this.sendRequest('tools/call', {
      name: 'llm_chat_completion',
      arguments: enhancedParams
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    try {
      return JSON.parse(response.result.content[0].text);
    } catch (error) {
      throw new Error(`Failed to parse chat completion response: ${error.message}`);
    }
  }

  async getUsage(filterParams = {}) {
    const params = {
      session_id: this.sessionId,
      ...filterParams
    };

    const response = await this.sendRequest('tools/call', {
      name: 'llm_get_usage',
      arguments: params
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return JSON.parse(response.result.content[0].text);
  }

  async checkLimits(proposedTokens = 0) {
    const response = await this.sendRequest('tools/call', {
      name: 'llm_check_limits',
      arguments: {
        session_id: this.sessionId,
        proposed_tokens: proposedTokens
      }
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return JSON.parse(response.result.content[0].text);
  }

  async listModels(filterParams = {}) {
    const response = await this.sendRequest('tools/call', {
      name: 'llm_list_models',
      arguments: filterParams
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return JSON.parse(response.result.content[0].text);
  }

  async createAgentPrompt(agentRole, taskDescription, context = '') {
    const response = await this.sendRequest('tools/call', {
      name: 'llm_create_agent_prompt',
      arguments: {
        agent_role: agentRole,
        task_description: taskDescription,
        context
      }
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return JSON.parse(response.result.content[0].text);
  }

  // Session management methods
  getSessionId() {
    return this.sessionId;
  }

  getUserId() {
    return this.userId;
  }

  setUserId(userId) {
    this.userId = userId;
  }

  // Tool discovery
  getAvailableTools() {
    return Array.from(this.tools.values());
  }

  hasTool(toolName) {
    return this.tools.has(toolName);
  }

  getTool(toolName) {
    return this.tools.get(toolName);
  }

  isConnected() {
    return this.connected && this.process && !this.process.killed;
  }

  async disconnect() {
    if (this.process && !this.process.killed) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.rejectAllPendingRequests(new Error('Client disconnected'));
  }
}

export { FastMCPDirectClient };