import chalk from 'chalk';

/**
 * SessionManager - Extracted from InteractiveCLI
 * Handles session lifecycle, state management, and context operations
 */
export class SessionManager {
  constructor(sessionService, conversationManager, options = {}) {
    this.sessionService = sessionService;
    this.conversationManager = conversationManager;
    this.verbose = options.verbose || false;
    this.currentSession = null;
    this.totalCost = 0;
    this.turnCount = 0;
  }

  /**
   * Start a new interactive session
   * @param {string} repoOwner - Repository owner
   * @param {string} repoName - Repository name
   * @param {boolean} multiAgentMode - Whether multi-agent mode is enabled
   * @returns {Object} Session initialization result
   */
  async startNewSession(repoOwner, repoName, multiAgentMode = false) {
    // Create context for new session
    const sessionType = multiAgentMode ? 'interactive-multi-agent' : 'interactive-ba';
    const sessionId = this.sessionService ? 
      await this.sessionService.createSession(
        sessionType,
        `Interactive ${multiAgentMode ? 'multi-agent' : 'BA'} conversation for ${repoOwner}/${repoName}`
      ) : 
      `mock-session-${Date.now()}`;

    const context = {
      sessionId,
      repoOwner,
      repoName,
      getRepository() {
        return `${repoOwner}/${repoName}`;
      }
    };

    // Initialize multi-agent conversation if needed
    if (multiAgentMode && this.conversationManager) {
      await this.conversationManager.initializeConversation(sessionId, context, 'multi');
    }

    // Set current session state
    this.currentSession = {
      sessionId,
      repoOwner,
      repoName
    };

    // Reset session counters
    this.totalCost = 0;
    this.turnCount = 0;

    return {
      sessionId,
      context,
      currentSession: this.currentSession
    };
  }

  /**
   * Resume an existing session
   * @param {string} sessionId - Session ID to resume
   * @param {string} repoOwner - Repository owner
   * @param {string} repoName - Repository name
   * @returns {Object} Session resume result
   */
  async resumeSession(sessionId, repoOwner, repoName) {
    // Check if session exists
    const exists = await this.conversationManager.conversationExists(sessionId);
    if (!exists) {
      throw new Error(`Session ${sessionId} not found. Start a new session without --session flag.`);
    }

    // Get conversation context
    const conversationContext = await this.conversationManager.getConversationContext(sessionId);
    
    this.currentSession = {
      sessionId,
      repoOwner,
      repoName
    };

    // Restore session state from conversation context
    this.totalCost = conversationContext.totalCost || 0;
    this.turnCount = conversationContext.turnCount || 0;

    return {
      sessionId,
      conversationContext,
      currentSession: this.currentSession
    };
  }

  /**
   * Update session state with new costs and turn counts
   * @param {number} cost - Cost to add
   * @param {number} turns - Turn count to set
   */
  updateSessionState(cost, turns) {
    this.totalCost = cost;
    this.turnCount = turns;
  }

  /**
   * Create session context object
   * @param {string} repoOwner - Repository owner  
   * @param {string} repoName - Repository name
   * @param {string} sessionId - Session ID
   * @returns {Object} Session context
   */
  createSessionContext(repoOwner, repoName, sessionId) {
    return {
      repoOwner,
      repoName,
      sessionId,
      getRepository() {
        return `${repoOwner}/${repoName}`;
      }
    };
  }

  /**
   * Get current session information
   * @returns {Object|null} Current session or null if no session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Get session ID, truncated for display
   * @param {number} length - Length to truncate to (default 8)
   * @returns {string} Truncated session ID
   */
  getSessionIdDisplay(length = 8) {
    if (!this.currentSession?.sessionId) {
      return 'No session';
    }
    return `${this.currentSession.sessionId.substring(0, length)}...`;
  }

  /**
   * Get session costs and usage information
   * @returns {Object} Session usage data
   */
  getSessionUsage() {
    return {
      totalCost: this.totalCost,
      turnCount: this.turnCount,
      sessionId: this.currentSession?.sessionId
    };
  }

  /**
   * Display session information
   * @param {boolean} multiAgentMode - Whether multi-agent mode is enabled
   * @param {string} activeAgent - Currently active agent ('ba' or 'tl')
   */
  displaySessionInfo(multiAgentMode = false, activeAgent = 'ba') {
    if (!this.currentSession) {
      console.log(chalk.gray('No active session'));
      return;
    }

    const agentInfo = multiAgentMode ? 
      ` | Active: ${activeAgent === 'ba' ? '🤖 BA' : '🏗️ TL'}` : '';
    console.log(chalk.gray(`Session: ${this.getSessionIdDisplay()} | Cost: $${this.totalCost.toFixed(4)} | Turns: ${this.turnCount}${agentInfo}`));
  }

  /**
   * Display conversation history
   * @param {string} sessionId - Optional session ID (uses current if not provided)
   * @param {boolean} multiAgentMode - Whether to format for multi-agent mode
   */
  async displayConversationHistory(sessionId = null, multiAgentMode = false) {
    const targetSessionId = sessionId || this.currentSession?.sessionId;
    if (!targetSessionId) {
      console.log(chalk.red('No session available for history display'));
      return;
    }

    try {
      if (multiAgentMode && this.conversationManager.formatMultiAgentConversationHistory) {
        const formatted = await this.conversationManager.formatMultiAgentConversationHistory(targetSessionId, false, true);
        console.log(formatted);
      } else {
        const formatted = await this.conversationManager.formatConversationHistory(targetSessionId, false);
        console.log(formatted);
      }
    } catch (error) {
      console.log(chalk.red(`Failed to load conversation history: ${error.message}`));
    }
  }

  /**
   * Log user interaction to session logs
   * @param {string} input - User input
   * @param {string} activeAgent - Currently active agent
   * @param {boolean} multiAgentMode - Whether multi-agent mode is enabled
   */
  async logUserInteraction(input, activeAgent, multiAgentMode = false) {
    if (this.sessionService && this.currentSession) {
      await this.sessionService.logInteraction(
        'user_input',
        input,
        {
          session_id: this.currentSession.sessionId,
          agent_mode: multiAgentMode ? 'multi-agent' : 'single-agent',
          active_agent: activeAgent,
          turn_count: this.turnCount + 1
        }
      );
    }
  }

  /**
   * Log agent response to session logs
   * @param {string} response - Agent response
   * @param {string} agentType - Agent type ('ba' or 'tl')
   * @param {string} agentName - Agent display name
   * @param {Object} usage - Usage information
   */
  async logAgentResponse(response, agentType, agentName, usage = {}) {
    if (this.sessionService && this.currentSession && response) {
      await this.sessionService.logInteraction(
        'agent_response',
        response,
        {
          session_id: this.currentSession.sessionId,
          agent_type: agentType,
          agent_name: agentName,
          cost: usage.cost || 0,
          tokens: usage.tokens || 0,
          turn_count: this.turnCount
        }
      );
    }
  }

  /**
   * Log agent error to session logs
   * @param {string} agentType - Agent type ('ba' or 'tl')
   * @param {string} errorMessage - Error message
   * @param {string} userInput - User input that caused error
   * @param {Object} additionalContext - Additional context
   */
  async logAgentError(agentType, errorMessage, userInput, additionalContext = {}) {
    if (this.sessionService && this.currentSession) {
      await this.sessionService.logInteraction(
        `${agentType}_error`,
        errorMessage,
        {
          session_id: this.currentSession.sessionId,
          agent_type: agentType,
          user_input: userInput,
          timestamp: new Date().toISOString(),
          ...additionalContext
        }
      );
    }
  }

  /**
   * Display session farewell message
   */
  displaySessionFarewell() {
    if (!this.currentSession) {
      return;
    }

    console.log(chalk.gray(`Session ${this.getSessionIdDisplay()} has been saved.`));
    console.log(chalk.gray(`Review it with: npm run logs --session=${this.currentSession.sessionId}`));
  }

  /**
   * Display session summary for ending conversations
   */
  displaySessionSummary() {
    if (!this.currentSession) {
      console.log(chalk.blue('No active session to summarize.'));
      return;
    }

    console.log(chalk.blue('\n✅ Conversation ended. All context has been preserved.'));
    console.log(chalk.blue(`📋 Session ID: ${this.currentSession.sessionId}`));
    console.log(chalk.blue(`💰 Total cost: $${this.totalCost.toFixed(4)} (${this.turnCount} turns)`));
  }

  /**
   * Check if session exists
   * @returns {boolean} Whether a session is currently active
   */
  hasActiveSession() {
    return this.currentSession !== null;
  }

  /**
   * Get repository string from current session
   * @returns {string|null} Repository string or null if no session
   */
  getRepositoryString() {
    if (!this.currentSession) {
      return null;
    }
    return `${this.currentSession.repoOwner}/${this.currentSession.repoName}`;
  }

  /**
   * Clear current session (for cleanup)
   */
  clearSession() {
    this.currentSession = null;
    this.totalCost = 0;
    this.turnCount = 0;
  }
}