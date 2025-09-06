#!/usr/bin/env node

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Direct JSON-RPC client for Logging MCP server
 * Bypasses the MCP SDK client library which has parsing issues
 */
class LoggingDirectClient extends EventEmitter {
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

    const serverPath = path.join(__dirname, '..', 'servers', 'logging-server.js');
    
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
      // Logging server error logs
      console.error('Logging MCP Server:', data.toString().trim());
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
        reject(new Error(`Logging MCP Error ${message.error.code}: ${message.error.message}`));
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
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async listTools() {
    return await this.request('tools/list');
  }

  async callTool(name, args) {
    return await this.request('tools/call', { name, arguments: args });
  }

  // Convenience methods for logging tools
  async createSession(args) {
    return await this.callTool('logging_create_session', args);
  }

  async logInteraction(args) {
    return await this.callTool('logging_log_interaction', args);
  }

  async logCost(args) {
    return await this.callTool('logging_log_cost', args);
  }

  async getSessionLogs(args) {
    return await this.callTool('logging_get_session_logs', args);
  }

  async listSessions(args) {
    return await this.callTool('logging_list_sessions', args);
  }

  async close() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export default LoggingDirectClient;