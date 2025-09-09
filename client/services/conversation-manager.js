import StateManager from '../../utils/state-manager.js';
import chalk from 'chalk';

/**
 * Conversation Manager
 * Manages conversational state, history, and flow for BA agent conversations
 */
export class ConversationManager {
  constructor(logDir) {
    this.logDir = logDir;
  }

  /**
   * Initialize a new conversation session
   * @param {string} sessionId - Session ID
   * @param {Object} context - Initial context (repo info, initial input)
   * @returns {Promise<void>}
   */
  async initializeConversation(sessionId, context) {
    const conversationData = {
      sessionId,
      repo: `${context.repoOwner}/${context.repoName}`,
      state: 'gathering',
      history: [],
      proposedIssues: [],
      totalCost: 0,
      turnCount: 0,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    await StateManager.set(sessionId, this.logDir, 'conversation', conversationData);
  }

  /**
   * Store a conversation turn (user-visible only, no raw JSON)
   * @param {string} sessionId - Session ID
   * @param {string} speaker - 'user' or 'ba' 
   * @param {string} message - Clean message content
   * @param {number} cost - Cost for this turn
   * @returns {Promise<void>}
   */
  async storeConversationTurn(sessionId, speaker, message, cost = 0) {
    const conversation = await this.getConversation(sessionId);
    
    const turn = {
      turn: conversation.turnCount + 1,
      speaker,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      cost
    };

    conversation.history.push(turn);
    conversation.turnCount += 1;
    conversation.totalCost += cost;
    conversation.lastActivity = new Date().toISOString();

    await StateManager.set(sessionId, this.logDir, 'conversation', conversation);
    
    return turn;
  }

  /**
   * Get conversation history for display
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Array of conversation turns
   */
  async getConversationHistory(sessionId) {
    const conversation = await this.getConversation(sessionId);
    return conversation.history || [];
  }

  /**
   * Get full conversation data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Complete conversation object
   */
  async getConversation(sessionId) {
    try {
      return await StateManager.get(sessionId, this.logDir, 'conversation');
    } catch (error) {
      throw new Error(`Conversation session ${sessionId} not found. Start a new conversation with --conversation flag.`);
    }
  }

  /**
   * Update conversation state
   * @param {string} sessionId - Session ID
   * @param {string} newState - New conversation state
   * @returns {Promise<void>}
   */
  async updateConversationState(sessionId, newState) {
    const conversation = await this.getConversation(sessionId);
    conversation.state = newState;
    conversation.lastActivity = new Date().toISOString();
    
    await StateManager.set(sessionId, this.logDir, 'conversation', conversation);
  }

  /**
   * Store proposed issues for later creation
   * @param {string} sessionId - Session ID
   * @param {Array} proposedIssues - Array of issue objects
   * @returns {Promise<void>}
   */
  async storeProposedIssues(sessionId, proposedIssues) {
    const conversation = await this.getConversation(sessionId);
    conversation.proposedIssues = proposedIssues;
    conversation.state = 'ready_to_finalize';
    conversation.lastActivity = new Date().toISOString();
    
    await StateManager.set(sessionId, this.logDir, 'conversation', conversation);
  }

  /**
   * Get proposed issues for finalization
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Array of proposed issues
   */
  async getProposedIssues(sessionId) {
    const conversation = await this.getConversation(sessionId);
    return conversation.proposedIssues || [];
  }

  /**
   * Check if conversation exists
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if conversation exists
   */
  async conversationExists(sessionId) {
    try {
      await StateManager.get(sessionId, this.logDir, 'conversation');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find similar conversations in the same repository
   * @param {string} repo - Repository in format "owner/repo"
   * @param {Array<string>} keywords - Keywords to search for
   * @returns {Promise<Array>} Array of similar conversation sessions
   */
  async findSimilarConversations(repo, keywords) {
    // This would require scanning all session files for conversations
    // For now, return empty array - can be enhanced later
    return [];
  }

  /**
   * Generate conversation context for LLM prompting
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Context object with history and state
   */
  async getConversationContext(sessionId) {
    const conversation = await this.getConversation(sessionId);
    
    return {
      sessionId,
      repo: conversation.repo,
      state: conversation.state,
      history: conversation.history,
      turnCount: conversation.turnCount,
      totalCost: conversation.totalCost,
      proposedIssues: conversation.proposedIssues
    };
  }

  /**
   * Format conversation history for display
   * @param {string} sessionId - Session ID
   * @param {boolean} includeCost - Whether to include cost information
   * @returns {Promise<string>} Formatted conversation history
   */
  async formatConversationHistory(sessionId, includeCost = false) {
    const history = await this.getConversationHistory(sessionId);
    const conversation = await this.getConversation(sessionId);
    
    let formatted = chalk.blue(`\n📋 Conversation History (Session: ${sessionId})\n`);
    formatted += chalk.gray(`Repository: ${conversation.repo} • State: ${conversation.state}\n\n`);
    
    for (const turn of history) {
      const speaker = turn.speaker === 'user' ? '👤 You' : '🤖 BA';
      const timestamp = new Date(turn.timestamp).toLocaleString();
      
      formatted += chalk.cyan(`${speaker} (Turn ${turn.turn}):`);
      if (includeCost && turn.cost > 0) {
        formatted += chalk.gray(` [$${turn.cost.toFixed(4)}]`);
      }
      formatted += '\n';
      formatted += `${turn.message}\n\n`;
    }
    
    if (includeCost) {
      formatted += chalk.yellow(`💰 Total conversation cost: $${conversation.totalCost.toFixed(4)}\n`);
    }
    
    return formatted;
  }

  /**
   * Clean up old conversations (utility method for future use)
   * @param {number} daysOld - Remove conversations older than this many days
   * @returns {Promise<number>} Number of conversations cleaned up
   */
  async cleanupOldConversations(daysOld = 30) {
    // Implementation for future cleanup functionality
    // For now, conversations persist indefinitely as requested
    return 0;
  }
}