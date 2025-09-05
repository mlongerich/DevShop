#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';

class StateMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'state-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.inMemoryState = new Map();
    this.setupToolHandlers();
  }

  async ensureStateDirectory(stateDir) {
    try {
      await fs.access(stateDir);
    } catch (error) {
      await fs.mkdir(stateDir, { recursive: true });
    }
  }

  async loadState(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async saveState(filePath, state) {
    await this.ensureStateDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'state_create_session',
            description: 'Create a new session state',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Unique session identifier' },
                state_dir: { type: 'string', description: 'State directory path' },
                initial_state: { type: 'object', description: 'Initial state data', default: {} },
                persist: { type: 'boolean', description: 'Whether to persist to disk', default: true }
              },
              required: ['session_id']
            }
          },
          {
            name: 'state_get',
            description: 'Get state value by key',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                key: { type: 'string', description: 'State key to retrieve' },
                state_dir: { type: 'string', description: 'State directory path' },
                default_value: { type: 'object', description: 'Default value if key not found' }
              },
              required: ['session_id', 'key']
            }
          },
          {
            name: 'state_set',
            description: 'Set state value by key',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                key: { type: 'string', description: 'State key to set' },
                value: { type: 'object', description: 'Value to store' },
                state_dir: { type: 'string', description: 'State directory path' },
                persist: { type: 'boolean', description: 'Whether to persist to disk', default: true }
              },
              required: ['session_id', 'key', 'value']
            }
          },
          {
            name: 'state_update',
            description: 'Update state by merging with existing values',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                updates: { type: 'object', description: 'Object with key-value pairs to update' },
                state_dir: { type: 'string', description: 'State directory path' },
                persist: { type: 'boolean', description: 'Whether to persist to disk', default: true }
              },
              required: ['session_id', 'updates']
            }
          },
          {
            name: 'state_delete',
            description: 'Delete state key',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                key: { type: 'string', description: 'State key to delete' },
                state_dir: { type: 'string', description: 'State directory path' },
                persist: { type: 'boolean', description: 'Whether to persist to disk', default: true }
              },
              required: ['session_id', 'key']
            }
          },
          {
            name: 'state_get_all',
            description: 'Get entire session state',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                state_dir: { type: 'string', description: 'State directory path' }
              },
              required: ['session_id']
            }
          },
          {
            name: 'state_clear',
            description: 'Clear entire session state',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                state_dir: { type: 'string', description: 'State directory path' },
                persist: { type: 'boolean', description: 'Whether to persist to disk', default: true }
              },
              required: ['session_id']
            }
          },
          {
            name: 'state_list_sessions',
            description: 'List all active sessions',
            inputSchema: {
              type: 'object',
              properties: {
                state_dir: { type: 'string', description: 'State directory path' },
                include_file_sessions: { type: 'boolean', description: 'Include file-based sessions', default: true }
              }
            }
          },
          {
            name: 'state_backup',
            description: 'Create backup of session state',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                state_dir: { type: 'string', description: 'State directory path' },
                backup_name: { type: 'string', description: 'Optional backup name' }
              },
              required: ['session_id', 'state_dir']
            }
          },
          {
            name: 'state_restore',
            description: 'Restore session state from backup',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session identifier' },
                state_dir: { type: 'string', description: 'State directory path' },
                backup_name: { type: 'string', description: 'Backup name to restore' }
              },
              required: ['session_id', 'state_dir', 'backup_name']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'state_create_session':
            return await this.createSession(args);
          case 'state_get':
            return await this.get(args);
          case 'state_set':
            return await this.set(args);
          case 'state_update':
            return await this.update(args);
          case 'state_delete':
            return await this.delete(args);
          case 'state_get_all':
            return await this.getAll(args);
          case 'state_clear':
            return await this.clear(args);
          case 'state_list_sessions':
            return await this.listSessions(args);
          case 'state_backup':
            return await this.backup(args);
          case 'state_restore':
            return await this.restore(args);
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

  getStateKey(session_id) {
    return `session:${session_id}`;
  }

  getStateFilePath(state_dir, session_id) {
    return state_dir ? path.join(state_dir, `${session_id}.state.json`) : null;
  }

  async loadSessionState(session_id, state_dir) {
    const stateKey = this.getStateKey(session_id);
    
    // Try memory first
    if (this.inMemoryState.has(stateKey)) {
      return this.inMemoryState.get(stateKey);
    }
    
    // Try file if state_dir provided
    if (state_dir) {
      const filePath = this.getStateFilePath(state_dir, session_id);
      const fileState = await this.loadState(filePath);
      if (fileState) {
        // Load into memory
        this.inMemoryState.set(stateKey, fileState);
        return fileState;
      }
    }
    
    return {};
  }

  async saveSessionState(session_id, state, state_dir, persist = true) {
    const stateKey = this.getStateKey(session_id);
    
    // Always update memory
    this.inMemoryState.set(stateKey, state);
    
    // Persist to file if requested and state_dir provided
    if (persist && state_dir) {
      const filePath = this.getStateFilePath(state_dir, session_id);
      await this.saveState(filePath, state);
    }
  }

  async createSession(args) {
    const { session_id, state_dir, initial_state = {}, persist = true } = args;
    
    const stateWithMeta = {
      ...initial_state,
      _meta: {
        session_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };

    await this.saveSessionState(session_id, stateWithMeta, state_dir, persist);

    return {
      content: [
        {
          type: 'text',
          text: `Session ${session_id} created with initial state`
        }
      ]
    };
  }

  async get(args) {
    const { session_id, key, state_dir, default_value = null } = args;
    
    const state = await this.loadSessionState(session_id, state_dir);
    const value = key.includes('.') ? this.getNestedValue(state, key) : state[key];
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(value !== undefined ? value : default_value, null, 2)
        }
      ]
    };
  }

  async set(args) {
    const { session_id, key, value, state_dir, persist = true } = args;
    
    const state = await this.loadSessionState(session_id, state_dir);
    
    if (key.includes('.')) {
      this.setNestedValue(state, key, value);
    } else {
      state[key] = value;
    }
    
    // Update metadata
    if (state._meta) {
      state._meta.updated_at = new Date().toISOString();
    }

    await this.saveSessionState(session_id, state, state_dir, persist);

    return {
      content: [
        {
          type: 'text',
          text: `Set ${key} for session ${session_id}`
        }
      ]
    };
  }

  async update(args) {
    const { session_id, updates, state_dir, persist = true } = args;
    
    const state = await this.loadSessionState(session_id, state_dir);
    
    // Merge updates
    Object.assign(state, updates);
    
    // Update metadata
    if (state._meta) {
      state._meta.updated_at = new Date().toISOString();
    }

    await this.saveSessionState(session_id, state, state_dir, persist);

    return {
      content: [
        {
          type: 'text',
          text: `Updated state for session ${session_id}`
        }
      ]
    };
  }

  async delete(args) {
    const { session_id, key, state_dir, persist = true } = args;
    
    const state = await this.loadSessionState(session_id, state_dir);
    
    if (key.includes('.')) {
      this.deleteNestedValue(state, key);
    } else {
      delete state[key];
    }
    
    // Update metadata
    if (state._meta) {
      state._meta.updated_at = new Date().toISOString();
    }

    await this.saveSessionState(session_id, state, state_dir, persist);

    return {
      content: [
        {
          type: 'text',
          text: `Deleted ${key} from session ${session_id}`
        }
      ]
    };
  }

  async getAll(args) {
    const { session_id, state_dir } = args;
    
    const state = await this.loadSessionState(session_id, state_dir);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2)
        }
      ]
    };
  }

  async clear(args) {
    const { session_id, state_dir, persist = true } = args;
    
    const clearedState = {
      _meta: {
        session_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cleared: true
      }
    };

    await this.saveSessionState(session_id, clearedState, state_dir, persist);

    return {
      content: [
        {
          type: 'text',
          text: `Cleared state for session ${session_id}`
        }
      ]
    };
  }

  async listSessions(args) {
    const { state_dir, include_file_sessions = true } = args;
    
    const sessions = [];
    
    // Add in-memory sessions
    for (const [key, state] of this.inMemoryState.entries()) {
      if (key.startsWith('session:')) {
        const session_id = key.replace('session:', '');
        sessions.push({
          session_id,
          source: 'memory',
          created_at: state._meta?.created_at,
          updated_at: state._meta?.updated_at
        });
      }
    }
    
    // Add file-based sessions
    if (include_file_sessions && state_dir) {
      try {
        const files = await fs.readdir(state_dir);
        const stateFiles = files.filter(file => file.endsWith('.state.json'));
        
        for (const file of stateFiles) {
          const session_id = file.replace('.state.json', '');
          if (!sessions.find(s => s.session_id === session_id)) {
            try {
              const filePath = path.join(state_dir, file);
              const state = await this.loadState(filePath);
              sessions.push({
                session_id,
                source: 'file',
                created_at: state._meta?.created_at,
                updated_at: state._meta?.updated_at
              });
            } catch (error) {
              // Skip invalid state files
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
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
  }

  async backup(args) {
    const { session_id, state_dir, backup_name } = args;
    
    if (!state_dir) {
      throw new Error('state_dir is required for backup operations');
    }
    
    const state = await this.loadSessionState(session_id, state_dir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = backup_name ? `${session_id}-${backup_name}.backup.json` : `${session_id}-${timestamp}.backup.json`;
    const backupPath = path.join(state_dir, 'backups', backupFileName);
    
    await this.saveState(backupPath, {
      ...state,
      _backup_meta: {
        original_session_id: session_id,
        backup_created_at: new Date().toISOString(),
        backup_name: backup_name || timestamp
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: `Backup created: ${backupPath}`
        }
      ]
    };
  }

  async restore(args) {
    const { session_id, state_dir, backup_name } = args;
    
    if (!state_dir) {
      throw new Error('state_dir is required for restore operations');
    }
    
    const backupPattern = backup_name.includes('.') ? backup_name : `${session_id}-${backup_name}.backup.json`;
    const backupPath = path.join(state_dir, 'backups', backupPattern);
    
    const backupState = await this.loadState(backupPath);
    if (!backupState) {
      throw new Error(`Backup not found: ${backupPath}`);
    }
    
    // Remove backup metadata and restore
    const { _backup_meta, ...restoredState } = backupState;
    
    // Update metadata
    if (restoredState._meta) {
      restoredState._meta.restored_at = new Date().toISOString();
      restoredState._meta.restored_from = backup_name;
    }

    await this.saveSessionState(session_id, restoredState, state_dir, true);

    return {
      content: [
        {
          type: 'text',
          text: `Session ${session_id} restored from backup: ${backup_name}`
        }
      ]
    };
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!(key in current)) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  deleteNestedValue(obj, path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => current?.[key], obj);
    if (target) delete target[lastKey];
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new StateMCPServer();
server.run().catch(console.error);