#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';

class LoggingMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'logging-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  async ensureLogDirectory(logDir) {
    try {
      await fs.access(logDir);
    } catch (error) {
      await fs.mkdir(logDir, { recursive: true });
    }
  }

  async writeLogFile(filePath, data) {
    await this.ensureLogDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  async appendLogFile(filePath, data) {
    await this.ensureLogDirectory(path.dirname(filePath));
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }) + '\n';
    await fs.appendFile(filePath, logEntry, 'utf8');
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'logging_create_session',
            description: 'Create a new logging session',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Unique session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' },
                agent_role: { type: 'string', description: 'Agent role (ba, developer, etc.)' },
                project_context: { type: 'string', description: 'Project information' },
                metadata: { type: 'object', description: 'Additional session metadata' }
              },
              required: ['session_id', 'log_dir']
            }
          },
          {
            name: 'logging_log_interaction',
            description: 'Log an agent interaction',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' },
                interaction_type: { 
                  type: 'string', 
                  description: 'Type of interaction',
                  enum: ['user_input', 'agent_response', 'tool_call', 'error', 'system']
                },
                content: { type: 'string', description: 'Interaction content' },
                agent_role: { type: 'string', description: 'Agent role' },
                metadata: { type: 'object', description: 'Additional metadata' }
              },
              required: ['session_id', 'log_dir', 'interaction_type', 'content']
            }
          },
          {
            name: 'logging_log_tool_usage',
            description: 'Log MCP tool usage',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' },
                tool_name: { type: 'string', description: 'Name of the tool used' },
                tool_args: { type: 'object', description: 'Tool arguments' },
                tool_result: { type: 'object', description: 'Tool result' },
                duration_ms: { type: 'number', description: 'Execution duration in milliseconds' },
                success: { type: 'boolean', description: 'Whether tool call succeeded' },
                agent_role: { type: 'string', description: 'Agent role' }
              },
              required: ['session_id', 'log_dir', 'tool_name', 'success']
            }
          },
          {
            name: 'logging_log_cost',
            description: 'Log cost information',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' },
                model: { type: 'string', description: 'Model used' },
                tokens_used: { type: 'number', description: 'Tokens consumed' },
                cost: { type: 'number', description: 'Cost in USD' },
                agent_role: { type: 'string', description: 'Agent role' },
                operation: { type: 'string', description: 'Operation description' }
              },
              required: ['session_id', 'log_dir', 'tokens_used', 'cost']
            }
          },
          {
            name: 'logging_get_session_logs',
            description: 'Retrieve logs for a specific session',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' },
                log_type: { 
                  type: 'string', 
                  description: 'Type of logs to retrieve',
                  enum: ['interactions', 'tools', 'costs', 'all'],
                  default: 'all'
                }
              },
              required: ['session_id', 'log_dir']
            }
          },
          {
            name: 'logging_create_session_summary',
            description: 'Create a summary of session activity',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                log_dir: { type: 'string', description: 'Log directory path' }
              },
              required: ['session_id', 'log_dir']
            }
          },
          {
            name: 'logging_list_sessions',
            description: 'List all available session logs',
            inputSchema: {
              type: 'object',
              properties: {
                log_dir: { type: 'string', description: 'Log directory path' }
              },
              required: ['log_dir']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'logging_create_session':
            return await this.createSession(args);
          case 'logging_log_interaction':
            return await this.logInteraction(args);
          case 'logging_log_tool_usage':
            return await this.logToolUsage(args);
          case 'logging_log_cost':
            return await this.logCost(args);
          case 'logging_get_session_logs':
            return await this.getSessionLogs(args);
          case 'logging_create_session_summary':
            return await this.createSessionSummary(args);
          case 'logging_list_sessions':
            return await this.listSessions(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async createSession(args) {
    const { session_id, log_dir, agent_role, project_context, metadata = {} } = args;
    
    const sessionData = {
      session_id,
      agent_role,
      project_context,
      created_at: new Date().toISOString(),
      metadata
    };

    const sessionFile = path.join(log_dir, `session-${session_id}.json`);
    await this.writeLogFile(sessionFile, sessionData);

    return {
      content: [
        {
          type: 'text',
          text: `Session ${session_id} created in ${sessionFile}`
        }
      ]
    };
  }

  async logInteraction(args) {
    const { session_id, log_dir, interaction_type, content, agent_role, metadata = {} } = args;
    
    const interactionLog = {
      type: 'interaction',
      interaction_type,
      content,
      agent_role,
      metadata
    };

    const logFile = path.join(log_dir, `${session_id}-interactions.log`);
    await this.appendLogFile(logFile, interactionLog);

    return {
      content: [
        {
          type: 'text',
          text: `Interaction logged for session ${session_id}`
        }
      ]
    };
  }

  async logToolUsage(args) {
    const { 
      session_id, 
      log_dir, 
      tool_name, 
      tool_args = {}, 
      tool_result = {}, 
      duration_ms,
      success, 
      agent_role 
    } = args;
    
    const toolLog = {
      type: 'tool_usage',
      tool_name,
      tool_args,
      tool_result,
      duration_ms,
      success,
      agent_role
    };

    const logFile = path.join(log_dir, `${session_id}-tools.log`);
    await this.appendLogFile(logFile, toolLog);

    return {
      content: [
        {
          type: 'text',
          text: `Tool usage logged for session ${session_id}`
        }
      ]
    };
  }

  async logCost(args) {
    const { session_id, log_dir, model, tokens_used, cost, agent_role, operation } = args;
    
    const costLog = {
      type: 'cost',
      model,
      tokens_used,
      cost,
      agent_role,
      operation
    };

    const logFile = path.join(log_dir, `${session_id}-costs.log`);
    await this.appendLogFile(logFile, costLog);

    return {
      content: [
        {
          type: 'text',
          text: `Cost logged for session ${session_id}: $${cost.toFixed(4)}`
        }
      ]
    };
  }

  async getSessionLogs(args) {
    const { session_id, log_dir, log_type = 'all' } = args;
    
    try {
      const logs = {};

      if (log_type === 'all' || log_type === 'interactions') {
        const interactionFile = path.join(log_dir, `${session_id}-interactions.log`);
        try {
          const content = await fs.readFile(interactionFile, 'utf8');
          logs.interactions = content.trim().split('\n').map(line => JSON.parse(line));
        } catch (error) {
          logs.interactions = [];
        }
      }

      if (log_type === 'all' || log_type === 'tools') {
        const toolFile = path.join(log_dir, `${session_id}-tools.log`);
        try {
          const content = await fs.readFile(toolFile, 'utf8');
          logs.tools = content.trim().split('\n').map(line => JSON.parse(line));
        } catch (error) {
          logs.tools = [];
        }
      }

      if (log_type === 'all' || log_type === 'costs') {
        const costFile = path.join(log_dir, `${session_id}-costs.log`);
        try {
          const content = await fs.readFile(costFile, 'utf8');
          logs.costs = content.trim().split('\n').map(line => JSON.parse(line));
        } catch (error) {
          logs.costs = [];
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(logs, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to retrieve session logs: ${error.message}`);
    }
  }

  async createSessionSummary(args) {
    const { session_id, log_dir } = args;
    
    try {
      // Get all logs for the session
      const logs = await this.getSessionLogs({ session_id, log_dir, log_type: 'all' });
      const logData = JSON.parse(logs.content[0].text);
      
      // Calculate summary statistics
      const summary = {
        session_id,
        created_at: new Date().toISOString(),
        interaction_count: logData.interactions?.length || 0,
        tool_usage_count: logData.tools?.length || 0,
        total_cost: logData.costs?.reduce((sum, cost) => sum + cost.cost, 0) || 0,
        total_tokens: logData.costs?.reduce((sum, cost) => sum + cost.tokens_used, 0) || 0,
        successful_tools: logData.tools?.filter(tool => tool.success).length || 0,
        failed_tools: logData.tools?.filter(tool => !tool.success).length || 0,
        unique_tools_used: [...new Set(logData.tools?.map(tool => tool.tool_name) || [])],
        agents_involved: [...new Set([
          ...(logData.interactions?.map(i => i.agent_role).filter(Boolean) || []),
          ...(logData.tools?.map(t => t.agent_role).filter(Boolean) || []),
          ...(logData.costs?.map(c => c.agent_role).filter(Boolean) || [])
        ])]
      };

      const summaryFile = path.join(log_dir, `${session_id}-summary.json`);
      await this.writeLogFile(summaryFile, summary);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create session summary: ${error.message}`);
    }
  }

  async listSessions(args) {
    const { log_dir } = args;
    
    try {
      const files = await fs.readdir(log_dir);
      const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
      
      const sessions = [];
      for (const file of sessionFiles) {
        try {
          const content = await fs.readFile(path.join(log_dir, file), 'utf8');
          const sessionData = JSON.parse(content);
          sessions.push({
            session_id: sessionData.session_id,
            agent_role: sessionData.agent_role,
            created_at: sessionData.created_at,
            project_context: sessionData.project_context?.substring(0, 100) + (sessionData.project_context?.length > 100 ? '...' : ''),
            file: file
          });
        } catch (error) {
          // Skip invalid session files
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sessions, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new LoggingMCPServer();
server.run().catch(console.error);