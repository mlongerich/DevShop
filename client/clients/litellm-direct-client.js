#!/usr/bin/env node

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Direct JSON-RPC client for LiteLLM MCP server
 * Bypasses the MCP SDK client library which has parsing issues
 */
class LiteLLMDirectClient extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    if (this.process) {
      throw new Error('Already connected');
    }

    const serverPath = path.join(__dirname, '..', '..', 'servers', 'litellm-server.js');
    
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
      // LiteLLM server error logs
      console.error('LiteLLM MCP Server:', data.toString().trim());
    });

    this.process.on('exit', (code) => {
      this.process = null;
      this.emit('exit', code);
    });

    // Wait a moment for the process to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(`LiteLLM MCP Error ${message.error.code}: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    }
  }

  async request(method, params = {}) {
    if (!this.process) {
      throw new Error('Not connected. Call connect() first.');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id: id,
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // Set timeout (60s for LLM requests which can be slow)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60000);

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async listTools() {
    return await this.request('tools/list');
  }

  async callTool(name, args) {
    return await this.request('tools/call', { name, arguments: args });
  }

  // Convenience methods for LiteLLM tools
  async chatCompletion(args) {
    return await this.callTool('llm_chat_completion', args);
  }

  async getUsage(args = {}) {
    return await this.callTool('llm_get_usage', args);
  }

  async checkLimits(args) {
    return await this.callTool('llm_check_limits', args);
  }

  async createAgentPrompt(args) {
    return await this.callTool('llm_create_agent_prompt', args);
  }

  async listModels(args = {}) {
    return await this.callTool('llm_list_models', args);
  }

  async close() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export default LiteLLMDirectClient;