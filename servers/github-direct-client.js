#!/usr/bin/env node

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Direct JSON-RPC client for GitHub MCP server
 * Bypasses the MCP SDK client library which has parsing issues
 */
class GitHubDirectClient extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    if (this.process) {
      throw new Error('Already connected');
    }

    this.process = spawn('docker', [
      'run', '--rm', '-i',
      '-e', `GITHUB_PERSONAL_ACCESS_TOKEN=${this.token}`,
      'ghcr.io/github/github-mcp-server:latest',
      'stdio'
    ]);

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

    this.process.stderr.on('data', () => {
      // GitHub server logs go to stderr, ignore them for now
      // console.error('GitHub MCP Server:', data.toString().trim());
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
        reject(new Error(`GitHub MCP Error ${message.error.code}: ${message.error.message}`));
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

  async close() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export default GitHubDirectClient;