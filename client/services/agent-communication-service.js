import StateManager from '../../utils/state-manager.js';
import chalk from 'chalk';

/**
 * Agent Communication Service
 * Manages communication between BA and TL agents with exchange limits and audit trails
 * Provides verbose logging for transparency and debugging
 */
export class AgentCommunicationService {
  constructor(logDir, sessionService, options = {}) {
    this.logDir = logDir;
    this.sessionService = sessionService;
    this.maxExchanges = 5; // Maximum number of back-and-forth exchanges
    this.exchangeWarningThreshold = 3; // Warn when approaching limit
    this.interactiveMode = options.interactive || false; // Show full content in interactive mode
    this.verboseCollaboration = options.verboseCollaboration || false; // Extra detail
  }

  /**
   * Initialize a new agent communication session
   * @param {string} sessionId - Session ID
   * @param {string} initiatingAgent - Agent starting the conversation ('ba' or 'tl')
   * @param {string} targetAgent - Agent being contacted ('ba' or 'tl')
   * @param {Object} initialContext - Initial conversation context
   * @returns {Promise<void>}
   */
  async initializeCommunication(sessionId, initiatingAgent, targetAgent, initialContext) {
    const communicationData = {
      sessionId,
      initiatingAgent,
      targetAgent,
      currentSpeaker: initiatingAgent,
      exchanges: [],
      exchangeCount: 0,
      maxExchanges: this.maxExchanges,
      status: 'active', // active, completed, escalated
      context: initialContext,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    await StateManager.set(sessionId, this.logDir, 'agent_communication', communicationData);
    
    console.log(chalk.blue(`🤝 Agent communication initialized: ${initiatingAgent} → ${targetAgent}`));
    
    await this.sessionService?.logInteraction('agent_communication_init', 
      `Agent communication started: ${initiatingAgent} → ${targetAgent}`, {
        initiatingAgent,
        targetAgent,
        sessionId
      });
  }

  /**
   * Send a message from one agent to another
   * @param {string} sessionId - Session ID
   * @param {string} fromAgent - Sending agent ('ba' or 'tl')
   * @param {string} toAgent - Receiving agent ('ba' or 'tl')
   * @param {string} messageType - Type of message ('question', 'clarification', 'response', 'handoff')
   * @param {string} content - Message content
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Communication result with status and any warnings
   */
  async sendMessage(sessionId, fromAgent, toAgent, messageType, content, metadata = {}) {
    try {
      const communication = await this.getCommunication(sessionId);
      
      // Check if communication is still active
      if (communication.status !== 'active') {
        throw new Error(`Communication session is ${communication.status}, cannot send new messages`);
      }

      // Check exchange limits
      if (communication.exchangeCount >= this.maxExchanges) {
        console.log(chalk.yellow(`⚠️ Exchange limit reached (${this.maxExchanges}), escalating to user`));
        await this.escalateToUser(sessionId, 'Exchange limit reached');
        return {
          success: false,
          status: 'escalated',
          reason: 'exchange_limit_exceeded',
          message: 'Communication escalated to user due to exchange limit'
        };
      }

      // Create exchange record
      const exchange = {
        exchangeNumber: communication.exchangeCount + 1,
        fromAgent,
        toAgent,
        messageType,
        content: content.trim(),
        metadata,
        timestamp: new Date().toISOString(),
        responseTime: null, // Will be set when response is received
        cost: metadata.cost || 0
      };

      // Add exchange to communication history
      communication.exchanges.push(exchange);
      communication.exchangeCount += 1;
      communication.currentSpeaker = toAgent; // Next speaker
      communication.lastActivity = new Date().toISOString();

      // Check if approaching limit
      let warningMessage = null;
      if (communication.exchangeCount >= this.exchangeWarningThreshold && 
          communication.exchangeCount < this.maxExchanges) {
        const remaining = this.maxExchanges - communication.exchangeCount;
        warningMessage = `Approaching exchange limit: ${remaining} exchanges remaining`;
        console.log(chalk.yellow(`⚠️ ${warningMessage}`));
      }

      // Save updated communication
      await StateManager.set(sessionId, this.logDir, 'agent_communication', communication);

      // Log the exchange with detailed information
      await this.logExchange(sessionId, exchange, warningMessage);

      // Display exchange for audit trail
      this.displayExchange(exchange, warningMessage);

      return {
        success: true,
        status: 'sent',
        exchangeNumber: exchange.exchangeNumber,
        exchangeCount: communication.exchangeCount,
        maxExchanges: this.maxExchanges,
        warning: warningMessage,
        nextSpeaker: toAgent
      };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to send agent message: ${error.message}`));
      throw error;
    }
  }

  /**
   * Process a message and generate response (simulates agent processing)
   * @param {string} sessionId - Session ID
   * @param {string} receivingAgent - Agent receiving the message
   * @param {string} responseContent - Response content
   * @param {Object} metadata - Response metadata
   * @returns {Promise<Object>} Processing result
   */
  async processMessage(sessionId, receivingAgent, responseContent, metadata = {}) {
    try {
      const communication = await this.getCommunication(sessionId);
      
      if (communication.exchanges.length === 0) {
        throw new Error('No messages to process');
      }

      // Get the latest exchange (the one being responded to)
      const latestExchange = communication.exchanges[communication.exchanges.length - 1];
      
      if (latestExchange.toAgent !== receivingAgent) {
        throw new Error(`Message was not directed to ${receivingAgent}`);
      }

      // Update response time
      const responseTime = Date.now() - new Date(latestExchange.timestamp).getTime();
      latestExchange.responseTime = responseTime;

      // Create response exchange
      const responseExchange = {
        exchangeNumber: communication.exchangeCount + 1,
        fromAgent: receivingAgent,
        toAgent: latestExchange.fromAgent, // Respond back to original sender
        messageType: 'response',
        content: responseContent.trim(),
        metadata: {
          ...metadata,
          respondingTo: latestExchange.exchangeNumber,
          responseTime
        },
        timestamp: new Date().toISOString(),
        responseTime: null,
        cost: metadata.cost || 0
      };

      // Add response to exchanges
      communication.exchanges.push(responseExchange);
      communication.exchangeCount += 1;
      communication.currentSpeaker = responseExchange.toAgent;
      communication.lastActivity = new Date().toISOString();

      // Save updated communication
      await StateManager.set(sessionId, this.logDir, 'agent_communication', communication);

      // Log the response exchange
      await this.logExchange(sessionId, responseExchange);
      this.displayExchange(responseExchange);

      return {
        success: true,
        status: 'processed',
        responseTime,
        exchangeCount: communication.exchangeCount,
        maxExchanges: this.maxExchanges
      };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to process agent message: ${error.message}`));
      throw error;
    }
  }

  /**
   * Complete agent communication (successful resolution)
   * @param {string} sessionId - Session ID
   * @param {string} completionReason - Reason for completion
   * @param {Object} finalOutcome - Final outcome data
   * @returns {Promise<void>}
   */
  async completeCommunication(sessionId, completionReason, finalOutcome = {}) {
    try {
      const communication = await this.getCommunication(sessionId);
      
      communication.status = 'completed';
      communication.completionReason = completionReason;
      communication.finalOutcome = finalOutcome;
      communication.completedAt = new Date().toISOString();

      await StateManager.set(sessionId, this.logDir, 'agent_communication', communication);

      console.log(chalk.green(`✅ Agent communication completed: ${completionReason}`));
      
      await this.sessionService?.logInteraction('agent_communication_complete',
        `Agent communication completed: ${completionReason}`, {
          sessionId,
          exchangeCount: communication.exchangeCount,
          completionReason,
          finalOutcome
        });

    } catch (error) {
      console.error(chalk.red(`❌ Failed to complete communication: ${error.message}`));
      throw error;
    }
  }

  /**
   * Escalate communication to user (when agents can't resolve)
   * @param {string} sessionId - Session ID
   * @param {string} escalationReason - Reason for escalation
   * @returns {Promise<void>}
   */
  async escalateToUser(sessionId, escalationReason) {
    try {
      const communication = await this.getCommunication(sessionId);
      
      communication.status = 'escalated';
      communication.escalationReason = escalationReason;
      communication.escalatedAt = new Date().toISOString();

      await StateManager.set(sessionId, this.logDir, 'agent_communication', communication);

      console.log(chalk.red(`🔺 Communication escalated to user: ${escalationReason}`));
      
      await this.sessionService?.logInteraction('agent_communication_escalate',
        `Communication escalated: ${escalationReason}`, {
          sessionId,
          exchangeCount: communication.exchangeCount,
          escalationReason
        });

    } catch (error) {
      console.error(chalk.red(`❌ Failed to escalate communication: ${error.message}`));
      throw error;
    }
  }

  /**
   * Get communication data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Communication data
   */
  async getCommunication(sessionId) {
    try {
      const communication = await StateManager.get(sessionId, this.logDir, 'agent_communication');
      if (!communication) {
        throw new Error(`Agent communication session ${sessionId} not found`);
      }
      return communication;
    } catch (error) {
      throw new Error(`Agent communication session ${sessionId} not found`);
    }
  }

  /**
   * Check if communication exists
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if exists
   */
  async communicationExists(sessionId) {
    try {
      const communication = await StateManager.get(sessionId, this.logDir, 'agent_communication');
      return communication !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get communication summary for display
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Communication summary
   */
  async getCommunicationSummary(sessionId) {
    const communication = await this.getCommunication(sessionId);
    
    const summary = {
      sessionId,
      initiatingAgent: communication.initiatingAgent,
      targetAgent: communication.targetAgent,
      status: communication.status,
      exchangeCount: communication.exchangeCount,
      maxExchanges: communication.maxExchanges,
      totalCost: communication.exchanges.reduce((sum, ex) => sum + (ex.cost || 0), 0),
      averageResponseTime: this.calculateAverageResponseTime(communication.exchanges),
      createdAt: communication.createdAt,
      lastActivity: communication.lastActivity,
      completedAt: communication.completedAt,
      escalatedAt: communication.escalatedAt
    };

    return summary;
  }

  /**
   * Format communication history for display
   * @param {string} sessionId - Session ID
   * @param {boolean} includeContent - Whether to include full message content
   * @returns {Promise<string>} Formatted history
   */
  async formatCommunicationHistory(sessionId, includeContent = true) {
    const communication = await this.getCommunication(sessionId);
    
    let formatted = chalk.blue(`\n🤝 Agent Communication History (Session: ${sessionId})\n`);
    formatted += chalk.gray(`${communication.initiatingAgent} → ${communication.targetAgent} • Status: ${communication.status} • Exchanges: ${communication.exchangeCount}/${communication.maxExchanges}\n\n`);

    for (const exchange of communication.exchanges) {
      const speaker = exchange.fromAgent === 'ba' ? '👤 BA' : '🏗️  TL';
      const timestamp = new Date(exchange.timestamp).toLocaleString();
      
      formatted += chalk.cyan(`${speaker} → ${exchange.toAgent.toUpperCase()} (Exchange ${exchange.exchangeNumber}):`);
      formatted += chalk.gray(` [${exchange.messageType}] ${timestamp}`);
      
      if (exchange.cost > 0) {
        formatted += chalk.gray(` [$${exchange.cost.toFixed(4)}]`);
      }
      
      if (exchange.responseTime) {
        formatted += chalk.gray(` (${exchange.responseTime}ms)`);
      }
      
      formatted += '\n';
      
      if (includeContent) {
        // Truncate very long messages for display
        const content = exchange.content.length > 500 ? 
          exchange.content.substring(0, 500) + '...' : 
          exchange.content;
        formatted += `${content}\n\n`;
      } else {
        formatted += `${exchange.messageType}: ${exchange.content.substring(0, 100)}...\n\n`;
      }
    }

    // Add status information
    if (communication.status === 'completed') {
      formatted += chalk.green(`✅ Communication completed: ${communication.completionReason}\n`);
    } else if (communication.status === 'escalated') {
      formatted += chalk.red(`🔺 Communication escalated: ${communication.escalationReason}\n`);
    }

    return formatted;
  }

  /**
   * Log individual exchange with detailed information
   * @param {string} sessionId - Session ID
   * @param {Object} exchange - Exchange data
   * @param {string} warning - Optional warning message
   * @returns {Promise<void>}
   */
  async logExchange(sessionId, exchange, warning = null) {
    const logData = {
      sessionId,
      exchange: exchange.exchangeNumber,
      fromAgent: exchange.fromAgent,
      toAgent: exchange.toAgent,
      messageType: exchange.messageType,
      contentLength: exchange.content.length,
      cost: exchange.cost,
      responseTime: exchange.responseTime,
      warning,
      timestamp: exchange.timestamp
    };

    await this.sessionService?.logInteraction('agent_exchange', 
      `Agent exchange ${exchange.exchangeNumber}: ${exchange.fromAgent} → ${exchange.toAgent}`, 
      logData);
  }

  /**
   * Display exchange for real-time audit trail
   * @param {Object} exchange - Exchange data
   * @param {string} warning - Optional warning message
   */
  displayExchange(exchange, warning = null) {
    const fromIcon = exchange.fromAgent === 'ba' ? '🤖' : '🏗️';
    const toIcon = exchange.toAgent === 'ba' ? '🤖' : '🏗️';
    const fromName = exchange.fromAgent === 'ba' ? 'BA' : 'Tech Lead';
    const toName = exchange.toAgent === 'ba' ? 'BA' : 'Tech Lead';
    
    if (this.interactiveMode) {
      // Enhanced display for interactive mode - show full conversation
      if (exchange.messageType === 'question') {
        console.log(chalk.blue(`\n📤 ${fromName} Question to ${toName}:`));
        console.log(chalk.white(`${exchange.content}`));
      } else if (exchange.messageType === 'response') {
        console.log(chalk.green(`\n📥 ${fromName} Response:`));
        console.log(chalk.white(`${exchange.content}`));
        
        if (exchange.responseTime) {
          console.log(chalk.gray(`⏱️  Response time: ${(exchange.responseTime / 1000).toFixed(1)}s`));
        }
        if (exchange.cost > 0) {
          console.log(chalk.gray(`💰 Cost: $${exchange.cost.toFixed(4)}`));
        }
      }
      
      if (warning) {
        console.log(chalk.yellow(`⚠️ ${warning}`));
      }
      
    } else {
      // Compact display for non-interactive mode
      console.log(chalk.blue(`\n🔄 Agent Exchange ${exchange.exchangeNumber}:`));
      console.log(chalk.cyan(`${fromIcon} ${exchange.fromAgent.toUpperCase()} → ${toIcon} ${exchange.toAgent.toUpperCase()}`));
      console.log(chalk.gray(`Type: ${exchange.messageType} | ${new Date(exchange.timestamp).toLocaleString()}`));
      
      if (exchange.cost > 0) {
        console.log(chalk.gray(`Cost: $${exchange.cost.toFixed(4)}`));
      }
      
      if (exchange.responseTime) {
        console.log(chalk.gray(`Response time: ${exchange.responseTime}ms`));
      }
      
      if (warning) {
        console.log(chalk.yellow(`⚠️ ${warning}`));
      }
      
      // Show truncated content for audit
      const preview = exchange.content.length > 200 ? 
        exchange.content.substring(0, 200) + '...' : 
        exchange.content;
      console.log(chalk.white(`Content: ${preview}`));
      console.log(chalk.gray('────────────────────────────────────────'));
    }
  }

  /**
   * Calculate average response time for exchanges
   * @param {Array} exchanges - Array of exchange objects
   * @returns {number} Average response time in ms
   */
  calculateAverageResponseTime(exchanges) {
    const responseTimes = exchanges
      .filter(ex => ex.responseTime !== null)
      .map(ex => ex.responseTime);
    
    if (responseTimes.length === 0) return 0;
    
    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }

  /**
   * Get communication statistics for monitoring
   * @param {string} sessionId - Session ID  
   * @returns {Promise<Object>} Communication statistics
   */
  async getCommunicationStats(sessionId) {
    const communication = await this.getCommunication(sessionId);
    
    const stats = {
      totalExchanges: communication.exchangeCount,
      exchangeLimit: communication.maxExchanges,
      utilizationPercent: Math.round((communication.exchangeCount / communication.maxExchanges) * 100),
      totalCost: communication.exchanges.reduce((sum, ex) => sum + (ex.cost || 0), 0),
      averageResponseTime: this.calculateAverageResponseTime(communication.exchanges),
      messageTypes: {},
      agentParticipation: { ba: 0, tl: 0 }
    };

    // Count message types and agent participation
    communication.exchanges.forEach(exchange => {
      stats.messageTypes[exchange.messageType] = (stats.messageTypes[exchange.messageType] || 0) + 1;
      stats.agentParticipation[exchange.fromAgent] = (stats.agentParticipation[exchange.fromAgent] || 0) + 1;
    });

    return stats;
  }

  /**
   * Preserve original user context when passing requests between agents
   * @param {string} sessionId - Session ID
   * @param {string} originalUserRequest - Original user request
   * @param {Object} baResponse - BA agent response
   * @returns {Object} Preserved context for TL
   */
  preserveOriginalUserContext(sessionId, originalUserRequest, baResponse) {
    // Detect if this is a simple technical request that should be simplified
    const isSimpleRequest = this.isSimpleTechnicalRequest(originalUserRequest);
    
    if (isSimpleRequest) {
      return {
        originalUserRequest: originalUserRequest,
        simplifiedForTL: this.simplifyForTL(originalUserRequest),
        skipElaboration: true,
        isSimplifiedFromBA: true,
        sessionId: sessionId,
        preservedAt: new Date().toISOString()
      };
    }
    
    // For complex requests, preserve full context
    return {
      originalUserRequest: originalUserRequest,
      baElaboratedQuestions: baResponse.technical_questions,
      requirementsAnalysis: baResponse.requirements_analysis,
      skipElaboration: false,
      isSimplifiedFromBA: false,
      sessionId: sessionId,
      preservedAt: new Date().toISOString()
    };
  }

  /**
   * Check if user request is simple and technical
   * @param {string} userRequest - User request text
   * @returns {boolean} Whether request is simple technical
   */
  isSimpleTechnicalRequest(userRequest) {
    const text = userRequest.toLowerCase().trim();
    
    const simplePatterns = [
      /^(i want to|need to|can we|let'?s|please) add (unit )?tests?/,
      /^add (unit )?tests?/,
      /^set up testing/,
      /^implement (unit )?testing/,
      /^(what|which) (testing framework|test runner|tool)/,
      /^should (we|i) use (jest|vitest|mocha|cypress)/
    ];
    
    return simplePatterns.some(pattern => pattern.test(text)) && text.length < 100;
  }

  /**
   * Simplify user request for TL consumption
   * @param {string} userRequest - Original user request
   * @returns {string} Simplified request
   */
  simplifyForTL(userRequest) {
    const text = userRequest.toLowerCase().trim();
    
    if (text.includes('unit test') || text.includes('testing')) {
      return 'Add unit tests to the static site';
    }
    
    if (text.includes('framework') && text.includes('test')) {
      return 'Choose testing framework';
    }
    
    // Default: clean up the request
    return userRequest
      .replace(/^(i want to|need to|can we|let's|please)\s+/i, '')
      .replace(/\?$/, '')
      .trim()
      .replace(/^([a-z])/, (match) => match.toUpperCase());
  }
}