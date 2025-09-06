import { promises as fs } from 'fs';
import path from 'path';

/**
 * Simple JSON file-based state management utility for DevShop
 * Replaces the state MCP server with direct function calls
 */
class StateManager {
  static async ensureStateDirectory(stateDir) {
    try {
      await fs.access(stateDir);
    } catch (error) {
      await fs.mkdir(stateDir, { recursive: true });
    }
  }

  static async writeStateFile(filePath, data) {
    await this.ensureStateDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  static async readStateFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  static async createSession(sessionId, stateDir, initialState = {}) {
    const sessionState = {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data: initialState
    };

    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    await this.writeStateFile(stateFile, sessionState);
    
    return {
      message: `Session ${sessionId} created successfully`,
      state_file: stateFile,
      initial_state: initialState
    };
  }

  static async get(sessionId, stateDir, key = null) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    const sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (key === null) {
      return sessionState.data; // Return all data
    }

    // Support nested key access with dot notation
    const keys = key.split('.');
    let value = sessionState.data;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return null; // Key not found
      }
    }
    
    return value;
  }

  static async set(sessionId, stateDir, key, value) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    let sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      // Create new session if it doesn't exist
      sessionState = {
        session_id: sessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        data: {}
      };
    }

    // Support nested key setting with dot notation
    const keys = key.split('.');
    let target = sessionState.data;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
    sessionState.updated_at = new Date().toISOString();
    
    await this.writeStateFile(stateFile, sessionState);
    
    return {
      message: `Key '${key}' set successfully`,
      value,
      session_id: sessionId
    };
  }

  static async update(sessionId, stateDir, updates) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    let sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Merge updates into existing data
    sessionState.data = { ...sessionState.data, ...updates };
    sessionState.updated_at = new Date().toISOString();
    
    await this.writeStateFile(stateFile, sessionState);
    
    return {
      message: 'Session state updated successfully',
      updated_keys: Object.keys(updates),
      session_id: sessionId
    };
  }

  static async delete(sessionId, stateDir, key) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    const sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Support nested key deletion with dot notation
    const keys = key.split('.');
    let target = sessionState.data;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        return {
          message: `Key '${key}' not found`,
          session_id: sessionId
        };
      }
      target = target[k];
    }
    
    const finalKey = keys[keys.length - 1];
    if (finalKey in target) {
      delete target[finalKey];
      sessionState.updated_at = new Date().toISOString();
      
      await this.writeStateFile(stateFile, sessionState);
      
      return {
        message: `Key '${key}' deleted successfully`,
        session_id: sessionId
      };
    } else {
      return {
        message: `Key '${key}' not found`,
        session_id: sessionId
      };
    }
  }

  static async getAll(sessionId, stateDir) {
    return await this.get(sessionId, stateDir, null);
  }

  static async clear(sessionId, stateDir) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    const sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    sessionState.data = {};
    sessionState.updated_at = new Date().toISOString();
    
    await this.writeStateFile(stateFile, sessionState);
    
    return {
      message: 'Session state cleared successfully',
      session_id: sessionId
    };
  }

  static async listSessions(stateDir) {
    try {
      await this.ensureStateDirectory(stateDir);
      const files = await fs.readdir(stateDir);
      
      const stateFiles = files.filter(file => 
        file.endsWith('.state.json')
      );
      
      const sessions = [];
      for (const file of stateFiles) {
        try {
          const sessionState = await this.readStateFile(
            path.join(stateDir, file)
          );
          if (sessionState) {
            sessions.push({
              session_id: sessionState.session_id,
              created_at: sessionState.created_at,
              updated_at: sessionState.updated_at,
              data_keys: Object.keys(sessionState.data || {})
            });
          }
        } catch (error) {
          // Skip corrupted state files
          continue;
        }
      }
      
      // Sort by creation date (newest first)
      sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      return sessions;
    } catch (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }
  }

  static async backup(sessionId, stateDir, backupPath) {
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    const sessionState = await this.readStateFile(stateFile);
    
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const backupData = {
      ...sessionState,
      backup_created_at: new Date().toISOString()
    };
    
    await this.writeStateFile(backupPath, backupData);
    
    return {
      message: 'Session backed up successfully',
      backup_path: backupPath,
      session_id: sessionId
    };
  }

  static async restore(sessionId, stateDir, backupPath) {
    const backupData = await this.readStateFile(backupPath);
    
    if (!backupData) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Remove backup metadata
    delete backupData.backup_created_at;
    backupData.restored_at = new Date().toISOString();
    
    const stateFile = path.join(stateDir, `${sessionId}.state.json`);
    await this.writeStateFile(stateFile, backupData);
    
    return {
      message: 'Session restored successfully',
      session_id: sessionId,
      restored_from: backupPath
    };
  }
}

export default StateManager;