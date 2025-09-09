import StateManager from '../../utils/state-manager.js';
import chalk from 'chalk';

/**
 * Conversation Manager
 * Manages conversational state, history, and flow for single and multi-agent conversations
 * Supports BA agent conversations and BA-TL multi-agent collaboration
 */
export class ConversationManager {
  constructor(logDir) {
    this.logDir = logDir;
  }

  /**
   * Initialize a new conversation session (single or multi-agent)
   * @param {string} sessionId - Session ID
   * @param {Object} context - Initial context (repo info, initial input)
   * @param {string} conversationType - Type: 'single' (BA only) or 'multi' (BA-TL)
   * @returns {Promise<void>}
   */
  async initializeConversation(sessionId, context, conversationType = 'single') {
    const conversationData = {
      sessionId,
      repo: `${context.repoOwner}/${context.repoName}`,
      type: conversationType,
      state: 'gathering',
      history: [],
      proposedIssues: [],
      totalCost: 0,
      turnCount: 0,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      
      // Token budget management
      tokenBudget: {
        initialTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
        initialCost: parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00,
        extensions: [], // Track all token extensions
        totalAllocatedTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
        totalAllocatedCost: parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00
      }
    };

    // Multi-agent specific properties
    if (conversationType === 'multi') {
      conversationData.multiAgent = {
        activeAgent: context.activeAgent || 'ba', // Current active agent
        agentHistory: [], // Track which agent spoke when
        collaborationState: 'active', // active, completed, escalated
        handoffCount: 0,
        lastHandoff: null
      };
    }

    await StateManager.set(sessionId, this.logDir, 'conversation', conversationData);
  }

  /**
   * Update token budget for a conversation (when user extends limits)
   * @param {string} sessionId - Session ID
   * @param {number} additionalTokens - Additional tokens to add
   * @param {number} additionalCost - Additional cost budget to add
   * @returns {Promise<void>}
   */
  async updateTokenBudget(sessionId, additionalTokens, additionalCost) {
    try {
      const conversation = await StateManager.get(sessionId, this.logDir, 'conversation');
      
      // Ensure tokenBudget exists (for older conversations)
      if (!conversation.tokenBudget) {
        conversation.tokenBudget = {
          initialTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
          initialCost: parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00,
          extensions: [],
          totalAllocatedTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
          totalAllocatedCost: parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00
        };
      }
      
      // Add extension record
      const extension = {
        tokens: additionalTokens,
        cost: additionalCost,
        timestamp: new Date().toISOString()
      };
      
      conversation.tokenBudget.extensions.push(extension);
      conversation.tokenBudget.totalAllocatedTokens += additionalTokens;
      conversation.tokenBudget.totalAllocatedCost += additionalCost;
      conversation.lastActivity = new Date().toISOString();
      
      await StateManager.set(sessionId, this.logDir, 'conversation', conversation);
      
      console.log(chalk.blue(`💾 Token budget updated for session ${sessionId}`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not update token budget: ${error.message}`));
    }
  }

  /**
   * Get token budget status for a conversation
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Token budget information
   */
  async getTokenBudgetStatus(sessionId) {
    try {
      const conversation = await StateManager.get(sessionId, this.logDir, 'conversation');
      return conversation.tokenBudget || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Store a conversation turn (supports multi-agent conversations)
   * @param {string} sessionId - Session ID
   * @param {string} speaker - 'user', 'ba', 'tl', or 'system'
   * @param {string} message - Clean message content
   * @param {number} cost - Cost for this turn
   * @param {Object} metadata - Additional turn metadata
   * @returns {Promise<Object>} The created turn object
   */
  async storeConversationTurn(sessionId, speaker, message, cost = 0, metadata = {}) {
    const conversation = await this.getConversation(sessionId);
    
    const turn = {
      turn: conversation.turnCount + 1,
      speaker,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      cost,
      metadata
    };

    conversation.history.push(turn);
    conversation.turnCount += 1;
    conversation.totalCost += cost;
    conversation.lastActivity = new Date().toISOString();

    // Update multi-agent tracking if applicable
    if (conversation.type === 'multi' && conversation.multiAgent) {
      conversation.multiAgent.agentHistory.push({
        turn: turn.turn,
        agent: speaker,
        timestamp: turn.timestamp,
        handoff: metadata.handoff || false
      });

      // Update active agent if this is an agent turn
      if (speaker === 'ba' || speaker === 'tl') {
        conversation.multiAgent.activeAgent = speaker;
      }

      // Track handoffs
      if (metadata.handoff) {
        conversation.multiAgent.handoffCount += 1;
        conversation.multiAgent.lastHandoff = {
          from: metadata.handoffFrom,
          to: metadata.handoffTo,
          reason: metadata.handoffReason,
          timestamp: turn.timestamp
        };
      }
    }

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

  // Multi-Agent Conversation Methods

  /**
   * Record agent handoff in multi-agent conversation
   * @param {string} sessionId - Session ID
   * @param {string} fromAgent - Agent handing off ('ba' or 'tl')
   * @param {string} toAgent - Agent receiving handoff ('ba' or 'tl')
   * @param {string} reason - Reason for handoff
   * @param {string} context - Handoff context/message
   * @returns {Promise<Object>} Handoff record
   */
  async recordAgentHandoff(sessionId, fromAgent, toAgent, reason, context) {
    const handoffMessage = `🔄 Agent handoff: ${fromAgent.toUpperCase()} → ${toAgent.toUpperCase()}\nReason: ${reason}\nContext: ${context}`;
    
    const turn = await this.storeConversationTurn(sessionId, 'system', handoffMessage, 0, {
      handoff: true,
      handoffFrom: fromAgent,
      handoffTo: toAgent,
      handoffReason: reason,
      handoffContext: context
    });

    console.log(chalk.blue(`🔄 Agent handoff recorded: ${fromAgent} → ${toAgent}`));
    
    return turn;
  }

  /**
   * Get multi-agent conversation statistics
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Multi-agent statistics
   */
  async getMultiAgentStats(sessionId) {
    const conversation = await this.getConversation(sessionId);
    
    if (conversation.type !== 'multi' || !conversation.multiAgent) {
      return { type: 'single', multiAgent: false };
    }

    const stats = {
      type: 'multi',
      multiAgent: true,
      activeAgent: conversation.multiAgent.activeAgent,
      collaborationState: conversation.multiAgent.collaborationState,
      handoffCount: conversation.multiAgent.handoffCount,
      lastHandoff: conversation.multiAgent.lastHandoff,
      agentParticipation: { ba: 0, tl: 0, user: 0, system: 0 }
    };

    // Count agent participation
    conversation.history.forEach(turn => {
      if (stats.agentParticipation[turn.speaker] !== undefined) {
        stats.agentParticipation[turn.speaker]++;
      }
    });

    return stats;
  }

  /**
   * Update multi-agent collaboration state
   * @param {string} sessionId - Session ID
   * @param {string} newState - New state: 'active', 'completed', 'escalated'
   * @returns {Promise<void>}
   */
  async updateMultiAgentState(sessionId, newState) {
    const conversation = await this.getConversation(sessionId);
    
    if (conversation.type !== 'multi' || !conversation.multiAgent) {
      throw new Error('Session is not a multi-agent conversation');
    }

    conversation.multiAgent.collaborationState = newState;
    conversation.lastActivity = new Date().toISOString();

    if (newState === 'completed' || newState === 'escalated') {
      conversation.multiAgent.completedAt = new Date().toISOString();
    }

    await StateManager.set(sessionId, this.logDir, 'conversation', conversation);
    
    console.log(chalk.blue(`Multi-agent state updated: ${newState}`));
  }

  /**
   * Get agent conversation context (for agent-to-agent communication)
   * @param {string} sessionId - Session ID
   * @param {string} targetAgent - Agent requesting context ('ba' or 'tl')
   * @returns {Promise<Object>} Context tailored for the target agent
   */
  async getAgentContext(sessionId, targetAgent) {
    const conversation = await this.getConversation(sessionId);
    const baseContext = await this.getConversationContext(sessionId);

    // Add multi-agent specific context
    if (conversation.type === 'multi' && conversation.multiAgent) {
      baseContext.multiAgent = {
        activeAgent: conversation.multiAgent.activeAgent,
        collaborationState: conversation.multiAgent.collaborationState,
        handoffCount: conversation.multiAgent.handoffCount,
        agentHistory: conversation.multiAgent.agentHistory,
        isMultiAgent: true
      };

      // Filter history to relevant turns for the target agent
      baseContext.relevantHistory = conversation.history.filter(turn => {
        // Include user turns, system turns, and turns from the other agent
        return turn.speaker === 'user' || 
               turn.speaker === 'system' || 
               (targetAgent === 'ba' && turn.speaker === 'tl') ||
               (targetAgent === 'tl' && turn.speaker === 'ba');
      });
    } else {
      baseContext.multiAgent = { isMultiAgent: false };
      baseContext.relevantHistory = conversation.history;
    }

    return baseContext;
  }

  /**
   * Format multi-agent conversation history for display
   * @param {string} sessionId - Session ID
   * @param {boolean} includeCost - Whether to include cost information
   * @param {boolean} showHandoffs - Whether to highlight handoffs
   * @returns {Promise<string>} Formatted conversation history
   */
  async formatMultiAgentConversationHistory(sessionId, includeCost = false, showHandoffs = true) {
    const conversation = await this.getConversation(sessionId);
    const history = conversation.history || [];
    
    const typeLabel = conversation.type === 'multi' ? 'Multi-Agent' : 'Single-Agent';
    let formatted = chalk.blue(`\n📋 ${typeLabel} Conversation History (Session: ${sessionId})\n`);
    formatted += chalk.gray(`Repository: ${conversation.repo} • State: ${conversation.state}\n`);
    
    if (conversation.type === 'multi' && conversation.multiAgent) {
      formatted += chalk.gray(`Active Agent: ${conversation.multiAgent.activeAgent.toUpperCase()} • Handoffs: ${conversation.multiAgent.handoffCount}\n`);
    }
    
    formatted += '\n';
    
    for (const turn of history) {
      let speaker;
      switch (turn.speaker) {
        case 'user':
          speaker = '👤 You';
          break;
        case 'ba':
          speaker = '🤖 BA';
          break;
        case 'tl':
          speaker = '🏗️ TL';
          break;
        case 'system':
          speaker = '🔧 System';
          break;
        default:
          speaker = `🤷 ${turn.speaker}`;
      }
      
      const timestamp = new Date(turn.timestamp).toLocaleString();
      
      formatted += chalk.cyan(`${speaker} (Turn ${turn.turn}):`);
      if (includeCost && turn.cost > 0) {
        formatted += chalk.gray(` [$${turn.cost.toFixed(4)}]`);
      }
      
      // Highlight handoffs
      if (showHandoffs && turn.metadata?.handoff) {
        formatted += chalk.yellow(' [HANDOFF]');
      }
      
      formatted += chalk.gray(` ${timestamp}`);
      formatted += '\n';
      formatted += `${turn.message}\n\n`;
    }
    
    if (includeCost) {
      formatted += chalk.yellow(`💰 Total conversation cost: $${conversation.totalCost.toFixed(4)}\n`);
    }
    
    // Add multi-agent summary
    if (conversation.type === 'multi' && conversation.multiAgent) {
      formatted += chalk.blue('\n🤝 Multi-Agent Summary:\n');
      formatted += chalk.gray(`Collaboration State: ${conversation.multiAgent.collaborationState}\n`);
      formatted += chalk.gray(`Active Agent: ${conversation.multiAgent.activeAgent.toUpperCase()}\n`);
      formatted += chalk.gray(`Total Handoffs: ${conversation.multiAgent.handoffCount}\n`);
    }
    
    return formatted;
  }

  /**
   * Check if conversation is multi-agent
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if multi-agent conversation
   */
  async isMultiAgentConversation(sessionId) {
    try {
      const conversation = await this.getConversation(sessionId);
      return conversation.type === 'multi';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get active agent for multi-agent conversation
   * @param {string} sessionId - Session ID
   * @returns {Promise<string|null>} Active agent ('ba' or 'tl') or null if not multi-agent
   */
  async getActiveAgent(sessionId) {
    try {
      const conversation = await this.getConversation(sessionId);
      if (conversation.type === 'multi' && conversation.multiAgent) {
        return conversation.multiAgent.activeAgent;
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}