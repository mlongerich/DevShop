import { promises as fs } from 'fs';
import path from 'path';

/**
 * Simple file-based logging utility for DevShop
 * Replaces the logging MCP server with direct function calls
 */
class Logger {
  static async ensureLogDirectory(logDir) {
    try {
      await fs.access(logDir);
    } catch (error) {
      await fs.mkdir(logDir, { recursive: true });
    }
  }

  static async writeLogFile(filePath, data) {
    await this.ensureLogDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  static async appendLogFile(filePath, data) {
    await this.ensureLogDirectory(path.dirname(filePath));
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }) + '\n';
    await fs.appendFile(filePath, logEntry, 'utf8');
  }

  static async createSession(sessionId, logDir, agentRole, projectContext = '') {
    const sessionData = {
      session_id: sessionId,
      agent_role: agentRole,
      project_context: projectContext,
      created_at: new Date().toISOString(),
      interactions: [],
      total_cost: 0,
      total_tokens: 0
    };

    const sessionFile = path.join(logDir, `session-${sessionId}.json`);
    await this.writeLogFile(sessionFile, sessionData);
    
    return {
      message: `Session ${sessionId} created successfully`,
      session_file: sessionFile
    };
  }

  static async logInteraction(sessionId, logDir, interactionType, content, agentRole, metadata = {}) {
    const sessionFile = path.join(logDir, `session-${sessionId}.json`);
    
    try {
      // Read current session
      const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
      
      // Add interaction
      const interaction = {
        timestamp: new Date().toISOString(),
        type: interactionType,
        content,
        agent_role: agentRole,
        ...metadata
      };
      
      sessionData.interactions.push(interaction);
      sessionData.updated_at = new Date().toISOString();
      
      // Write back to file
      await this.writeLogFile(sessionFile, sessionData);
      
      return {
        message: 'Interaction logged successfully',
        interaction_count: sessionData.interactions.length
      };
    } catch (error) {
      throw new Error(`Failed to log interaction: ${error.message}`);
    }
  }

  static async logToolUsage(sessionId, logDir, toolName, serverName, args, result, executionTime = 0) {
    return await this.logInteraction(sessionId, logDir, 'tool_usage', {
      tool_name: toolName,
      server_name: serverName,
      arguments: args,
      result,
      execution_time: executionTime
    }, 'system');
  }

  static async logCost(sessionId, logDir, model, tokensUsed, cost, provider = 'unknown') {
    const sessionFile = path.join(logDir, `session-${sessionId}.json`);
    
    try {
      // Read current session
      const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
      
      // Update cost totals
      sessionData.total_cost = (sessionData.total_cost || 0) + cost;
      sessionData.total_tokens = (sessionData.total_tokens || 0) + tokensUsed;
      sessionData.updated_at = new Date().toISOString();
      
      // Add cost entry
      const costEntry = {
        timestamp: new Date().toISOString(),
        type: 'cost',
        model,
        tokens_used: tokensUsed,
        cost,
        provider,
        running_total_cost: sessionData.total_cost,
        running_total_tokens: sessionData.total_tokens
      };
      
      sessionData.interactions.push(costEntry);
      
      // Write back to file
      await this.writeLogFile(sessionFile, sessionData);
      
      return {
        message: 'Cost logged successfully',
        total_cost: sessionData.total_cost,
        total_tokens: sessionData.total_tokens
      };
    } catch (error) {
      throw new Error(`Failed to log cost: ${error.message}`);
    }
  }

  static async getSessionLogs(sessionId, logDir) {
    const sessionFile = path.join(logDir, `session-${sessionId}.json`);
    
    try {
      const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
      return sessionData;
    } catch (error) {
      throw new Error(`Failed to read session logs: ${error.message}`);
    }
  }

  static async createSessionSummary(sessionId, logDir) {
    try {
      const sessionData = await this.getSessionLogs(sessionId, logDir);
      
      const summary = {
        session_id: sessionId,
        agent_role: sessionData.agent_role,
        project_context: sessionData.project_context,
        created_at: sessionData.created_at,
        updated_at: sessionData.updated_at,
        duration: new Date(sessionData.updated_at) - new Date(sessionData.created_at),
        interaction_count: sessionData.interactions.length,
        total_cost: sessionData.total_cost || 0,
        total_tokens: sessionData.total_tokens || 0,
        interaction_types: this.countInteractionTypes(sessionData.interactions)
      };
      
      return summary;
    } catch (error) {
      throw new Error(`Failed to create session summary: ${error.message}`);
    }
  }

  static async listSessions(logDir) {
    try {
      await this.ensureLogDirectory(logDir);
      const files = await fs.readdir(logDir);
      
      const sessionFiles = files.filter(file => 
        file.startsWith('session-') && file.endsWith('.json')
      );
      
      const sessions = [];
      for (const file of sessionFiles) {
        try {
          const sessionData = JSON.parse(
            await fs.readFile(path.join(logDir, file), 'utf8')
          );
          sessions.push({
            session_id: sessionData.session_id,
            agent_role: sessionData.agent_role,
            created_at: sessionData.created_at,
            updated_at: sessionData.updated_at,
            interaction_count: sessionData.interactions?.length || 0,
            total_cost: sessionData.total_cost || 0,
            total_tokens: sessionData.total_tokens || 0
          });
        } catch (error) {
          // Skip corrupted session files
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

  static countInteractionTypes(interactions) {
    const counts = {};
    for (const interaction of interactions) {
      counts[interaction.type] = (counts[interaction.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Log error information to session
   * @param {string} sessionId - Session ID
   * @param {string} logDir - Log directory path
   * @param {Error} error - Error object
   * @param {Object} context - Additional error context
   */
  static async logError(sessionId, logDir, error, context = {}) {
    const errorData = {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name,
      ...context
    };

    return await this.logInteraction(
      sessionId, 
      logDir, 
      'error', 
      errorData, 
      context.agent || 'system'
    );
  }
}

export default Logger;