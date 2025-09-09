import { BaseCommand } from './base-command.js';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Logs Command
 * Handles viewing and managing session logs
 */
export class LogsCommand extends BaseCommand {
  /**
   * Execute logs command
   * @param {Object} options - Command options
   * @param {string} [options.session] - Specific session ID
   * @param {boolean} [options.list] - List all sessions
   * @param {number} [options.limit] - Limit number of entries
   * @param {string} [options.filter] - Filter by interaction type
   * @param {boolean} [options.errors] - Show only errors
   * @param {boolean} [options.export] - Export logs to file
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} Logs result
   */
  async execute(options = {}) {
    const command = 'logs';
    await this.logCommandStart(command, options);

    try {
      let result;

      if (options.list) {
        // List all sessions
        result = await this.listSessions(options);
      } else if (options.session) {
        // Show specific session logs
        result = await this.showSessionLogs(options.session, options);
      } else {
        // Show recent logs from active session or all sessions
        result = await this.showRecentLogs(options);
      }

      await this.logCommandEnd(command, result);
      return result;

    } catch (error) {
      await this.logCommandError(command, error);
      console.error(chalk.red(`❌ Failed to retrieve logs: ${error.message}`));
      throw error;
    }
  }

  /**
   * List all sessions
   * @param {Object} options - Options
   * @returns {Promise<Object>} Sessions list
   */
  async listSessions(options) {
    console.log(chalk.blue('📋 Listing all sessions...'));

    const sessions = await this.sessionService.getAllSessions();
    
    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found.'));
      return { sessions: [] };
    }

    console.log(chalk.green(`\nFound ${sessions.length} sessions:\n`));

    for (const session of sessions) {
      try {
        const sessionInfo = await this.sessionService.getSessionInfo(session.session_id);
        
        console.log(chalk.white(`📁 ${session.session_id}`));
        console.log(chalk.gray(`   Role: ${sessionInfo.agent_role || 'unknown'}`));
        console.log(chalk.gray(`   Created: ${new Date(sessionInfo.created_at).toLocaleString()}`));
        console.log(chalk.gray(`   Status: ${sessionInfo.status || 'unknown'}`));
        console.log(chalk.gray(`   Logs: ${sessionInfo.log_count || 0} entries`));
        
        if (sessionInfo.project_context && options.verbose) {
          console.log(chalk.gray(`   Context: ${sessionInfo.project_context}`));
        }
        
        console.log('');
      } catch (error) {
        console.log(chalk.white(`📁 ${session.session_id}`));
        console.log(chalk.red(`   Error: ${error.message}`));
        console.log('');
      }
    }

    return { sessions };
  }

  /**
   * Show logs for a specific session
   * @param {string} sessionId - Session ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Session logs
   */
  async showSessionLogs(sessionId, options) {
    console.log(chalk.blue(`📖 Loading logs for session ${sessionId}...`));

    const sessionData = await this.sessionService.getSessionLogs(sessionId);
    const sessionInfo = await this.sessionService.getSessionInfo(sessionId);

    // Extract interactions array from session data
    const logs = sessionData.interactions || [];

    if (logs.length === 0) {
      console.log(chalk.gray('No logs found for this session.'));
      return { logs: [], session_info: sessionInfo };
    }

    // Apply filters
    let filteredLogs = logs;
    
    if (options.errors) {
      filteredLogs = logs.filter(log => log.type === 'error');
    }
    
    if (options.filter) {
      filteredLogs = logs.filter(log => 
        log.type.includes(options.filter) || 
        log.content.toLowerCase().includes(options.filter.toLowerCase())
      );
    }

    // Apply limit
    if (options.limit) {
      filteredLogs = filteredLogs.slice(-options.limit);
    }

    // Display session info
    console.log(chalk.green(`\nSession: ${sessionId}`));
    console.log(chalk.gray(`Role: ${sessionInfo.agent_role || 'unknown'}`));
    console.log(chalk.gray(`Created: ${new Date(sessionInfo.created_at).toLocaleString()}`));
    console.log(chalk.gray(`Status: ${sessionInfo.status || 'unknown'}`));
    console.log(chalk.gray(`Total logs: ${logs.length}, Showing: ${filteredLogs.length}\n`));

    // Display logs
    for (const log of filteredLogs) {
      this.displayLogEntry(log, options.verbose);
    }

    // Export if requested
    if (options.export) {
      await this.exportLogs(sessionId, filteredLogs);
    }

    return { 
      logs: filteredLogs, 
      session_info: sessionInfo, 
      total_count: logs.length,
      filtered_count: filteredLogs.length
    };
  }

  /**
   * Show recent logs from active session or all sessions
   * @param {Object} options - Options
   * @returns {Promise<Object>} Recent logs
   */
  async showRecentLogs(options) {
    const activeSessionId = this.sessionService.getActiveSession();
    
    if (activeSessionId) {
      console.log(chalk.blue(`📖 Showing recent logs from active session...`));
      return await this.showSessionLogs(activeSessionId, { ...options, limit: options.limit || 20 });
    } else {
      console.log(chalk.blue(`📖 No active session. Showing recent logs from all sessions...`));
      
      const sessions = await this.sessionService.getAllSessions();
      const allLogs = [];
      
      for (const session of sessions.slice(0, 5)) { // Last 5 sessions
        try {
          const sessionData = await this.sessionService.getSessionLogs(session.session_id);
          const sessionInfo = await this.sessionService.getSessionInfo(session.session_id);
          
          // Extract interactions array from session data
          const logs = sessionData.interactions || [];
          
          for (const log of logs) {
            allLogs.push({
              ...log,
              session_id: session.session_id,
              agent_role: sessionInfo.agent_role
            });
          }
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not load logs for session ${session.session_id}`));
        }
      }

      // Sort by timestamp and take recent entries
      allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const recentLogs = allLogs.slice(0, options.limit || 20);

      console.log(chalk.green(`\nShowing ${recentLogs.length} recent log entries:\n`));

      for (const log of recentLogs) {
        console.log(chalk.dim(`[${log.session_id.slice(0, 8)}...] [${log.agent_role}]`));
        this.displayLogEntry(log, options.verbose);
      }

      return { logs: recentLogs, total_count: allLogs.length };
    }
  }

  /**
   * Display a single log entry
   * @param {Object} log - Log entry
   * @param {boolean} verbose - Show detailed information
   */
  displayLogEntry(log, verbose = false) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const typeColor = this.getTypeColor(log.type);
    
    // Enhanced display for conversation flow
    if (log.type === 'user_input') {
      console.log(chalk.cyan(`[${timestamp}] 👤 USER: ${log.content}`));
      if (verbose && log.agent_mode) {
        console.log(chalk.dim(`   Mode: ${log.agent_mode} | Active Agent: ${log.active_agent} | Turn: ${log.turn_count}`));
      }
    } else if (log.type === 'agent_response') {
      const agentIcon = log.agent_type === 'tl' ? '🏗️' : '🤖';
      const agentName = log.agent_name || (log.agent_type === 'tl' ? 'Tech Lead' : 'BA');
      console.log(chalk.green(`[${timestamp}] ${agentIcon} ${agentName.toUpperCase()}: ${log.content}`));
      if (verbose && log.turn_cost !== undefined) {
        console.log(chalk.dim(`   Turn Cost: $${log.turn_cost.toFixed(4)} | Total: $${log.total_cost.toFixed(4)} | State: ${log.conversation_state}`));
      }
    } else if (log.type === 'tl_response') {
      console.log(chalk.green(`[${timestamp}] 🏗️ TECH LEAD: ${log.content}`));
      if (verbose && log.focus_area) {
        console.log(chalk.dim(`   Focus: ${log.focus_area} | Turn: ${log.turn_count} | Cost: $${log.turn_cost.toFixed(4)}`));
      }
    } else if (log.type === 'tl_timeout') {
      console.log(chalk.yellow(`[${timestamp}] ⏱️ TECH LEAD TIMEOUT: ${log.content}`));
      if (verbose && log.timeout_duration) {
        console.log(chalk.dim(`   Duration: ${log.timeout_duration} | Fallback: ${log.fallback_action}`));
      }
    } else if (log.type === 'tl_error') {
      console.log(chalk.red(`[${timestamp}] ❌ TECH LEAD ERROR: ${log.content}`));
      if (verbose && log.error_type) {
        console.log(chalk.dim(`   Type: ${log.error_type} | Fallback: ${log.fallback_action}`));
      }
    } else {
      // Default display for other log types
      console.log(typeColor(`[${timestamp}] ${log.type.toUpperCase()}: ${log.content}`));
    }
    
    if (verbose && log.metadata && Object.keys(log.metadata).length > 0) {
      console.log(chalk.dim(`   Metadata: ${JSON.stringify(log.metadata, null, 2)}`));
    }
    
    if (log.type === 'error' && log.error) {
      console.log(chalk.red(`   Error: ${log.error}`));
      if (verbose && log.stack) {
        console.log(chalk.dim(`   Stack: ${log.stack}`));
      }
    }
    
    console.log('');
  }

  /**
   * Get color for log type
   * @param {string} type - Log type
   * @returns {Function} Chalk color function
   */
  getTypeColor(type) {
    const colors = {
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue,
      success: chalk.green,
      command_start: chalk.cyan,
      command_end: chalk.green,
      session_created: chalk.magenta,
      session_closed: chalk.gray,
      user_input: chalk.cyan,
      agent_response: chalk.green,
      tl_response: chalk.green,
      conversation_started: chalk.blue,
      conversation_continued: chalk.blue,
      tl_analysis_start: chalk.yellow,
      tl_analysis_complete: chalk.green,
      tl_timeout: chalk.yellow,
      tl_error: chalk.red,
      cost_summary: chalk.yellow
    };
    
    return colors[type] || chalk.white;
  }

  /**
   * Export logs to a file
   * @param {string} sessionId - Session ID
   * @param {Array} logs - Logs to export
   */
  async exportLogs(sessionId, logs) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${sessionId.slice(0, 8)}-${timestamp}.json`;
    const filepath = path.join(process.cwd(), filename);

    const exportData = {
      session_id: sessionId,
      exported_at: new Date().toISOString(),
      log_count: logs.length,
      logs
    };

    await fs.writeFile(filepath, JSON.stringify(exportData, null, 2));
    console.log(chalk.green(`📄 Logs exported to: ${filepath}`));
  }
}