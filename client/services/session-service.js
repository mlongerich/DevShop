import { v4 as uuidv4 } from 'uuid';
import Logger from '../../utils/logger.js';
import StateManager from '../../utils/state-manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');

/**
 * Session Service
 * Manages session lifecycle, logging, and state management
 */
export class SessionService {
  constructor() {
    this.activeSession = null;
    this.logDir = path.join(rootDir, 'logs');
  }

  /**
   * Create a new session
   * @param {string} agentRole - Role of the agent (ba, developer, etc.)
   * @param {string} projectContext - Context description for the session
   * @returns {Promise<string>} Session ID
   */
  async createSession(agentRole, projectContext = '') {
    const sessionId = uuidv4();
    
    try {
      // Create session with Logger
      await Logger.createSession(sessionId, this.logDir, agentRole);
      
      // Initialize session state
      await StateManager.createSession(sessionId, this.logDir);
      
      // Set session context
      await StateManager.set(sessionId, this.logDir, 'session_info', {
        agent_role: agentRole,
        project_context: projectContext,
        created_at: new Date().toISOString(),
        status: 'active'
      });

      this.activeSession = sessionId;
      
      await this.logInteraction('session_created', 'New session created', {
        session_id: sessionId,
        agent_role: agentRole,
        project_context: projectContext
      });

      return sessionId;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Get current active session
   * @returns {string|null} Active session ID
   */
  getActiveSession() {
    return this.activeSession;
  }

  /**
   * Set active session
   * @param {string} sessionId - Session ID to set as active
   */
  setActiveSession(sessionId) {
    this.activeSession = sessionId;
  }

  /**
   * Close a session
   * @param {string} sessionId - Session ID to close
   */
  async closeSession(sessionId) {
    try {
      await StateManager.set(sessionId, this.logDir, 'session_info', {
        status: 'completed',
        completed_at: new Date().toISOString()
      });

      await this.logInteraction('session_closed', 'Session closed', {
        session_id: sessionId
      });

      if (this.activeSession === sessionId) {
        this.activeSession = null;
      }
    } catch (error) {
      console.warn(`Warning: Could not properly close session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Log an interaction
   * @param {string} type - Interaction type
   * @param {string} content - Interaction content
   * @param {Object} metadata - Additional metadata
   */
  async logInteraction(type, content, metadata = {}) {
    const sessionId = metadata.session_id || this.activeSession;
    
    if (!sessionId) {
      console.warn('No active session for logging interaction');
      return;
    }

    try {
      // Extract agent role from metadata or use a default
      const agentRole = metadata.agent_role || metadata.agent_type || 'user';
      await Logger.logInteraction(sessionId, this.logDir, type, content, agentRole, metadata);
    } catch (error) {
      console.warn(`Warning: Could not log interaction: ${error.message}`);
    }
  }

  /**
   * Log an error
   * @param {Error} error - Error to log
   * @param {Object} context - Error context
   */
  async logError(error, context = {}) {
    const sessionId = context.session_id || this.activeSession;
    
    if (!sessionId) {
      console.error('Error (no session):', error.message);
      return;
    }

    try {
      await Logger.logError(sessionId, this.logDir, error, context);
    } catch (logError) {
      console.error('Failed to log error:', logError.message);
      console.error('Original error:', error.message);
    }
  }

  /**
   * Get session logs
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Session logs
   */
  async getSessionLogs(sessionId) {
    try {
      return await Logger.getSessionLogs(sessionId, this.logDir);
    } catch (error) {
      throw new Error(`Failed to retrieve session logs: ${error.message}`);
    }
  }

  /**
   * Get all sessions
   * @returns {Promise<Array>} List of all sessions
   */
  async getAllSessions() {
    try {
      return await StateManager.listSessions(this.logDir);
    } catch (error) {
      throw new Error(`Failed to retrieve sessions: ${error.message}`);
    }
  }

  /**
   * Get session state
   * @param {string} sessionId - Session ID
   * @param {string} key - State key
   * @returns {Promise<*>} State value
   */
  async getState(sessionId, key) {
    try {
      return await StateManager.get(sessionId, this.logDir, key);
    } catch (error) {
      throw new Error(`Failed to get session state: ${error.message}`);
    }
  }

  /**
   * Set session state
   * @param {string} sessionId - Session ID
   * @param {string} key - State key
   * @param {*} value - State value
   */
  async setState(sessionId, key, value) {
    try {
      await StateManager.set(sessionId, this.logDir, key, value);
    } catch (error) {
      throw new Error(`Failed to set session state: ${error.message}`);
    }
  }

  /**
   * Get session information
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session information
   */
  async getSessionInfo(sessionId) {
    try {
      const sessionInfo = await this.getState(sessionId, 'session_info');
      const logs = await this.getSessionLogs(sessionId);
      
      return {
        ...sessionInfo,
        session_id: sessionId,
        log_count: logs.length,
        last_activity: logs.length > 0 ? logs[logs.length - 1].timestamp : sessionInfo.created_at
      };
    } catch (error) {
      throw new Error(`Failed to get session info: ${error.message}`);
    }
  }

  /**
   * Check session limits (cost, token usage, etc.)
   * @param {string} sessionId - Session ID
   * @param {Object} limits - Limit configuration
   * @returns {Promise<Object>} Limit check results
   */
  async checkLimits(sessionId, limits = {}) {
    // This would integrate with usage tracking from the LiteLLM server
    // For now, return a basic structure
    return {
      within_limits: true,
      checks: [],
      session_id: sessionId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean up old sessions
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<Array>} Cleaned up session IDs
   */
  async cleanupOldSessions(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    try {
      const sessions = await this.getAllSessions();
      const cutoffTime = new Date(Date.now() - maxAge);
      const toCleanup = [];

      for (const session of sessions) {
        const sessionTime = new Date(session.created_at || session.timestamp);
        if (sessionTime < cutoffTime) {
          toCleanup.push(session.session_id);
        }
      }

      // Note: Actual cleanup would involve removing log files and state files
      // This is a placeholder for the cleanup logic
      
      return toCleanup;
    } catch (error) {
      throw new Error(`Failed to cleanup old sessions: ${error.message}`);
    }
  }
}