import chalk from 'chalk';

/**
 * AgentSwitcher - Extracted from InteractiveCLI
 * Handles multi-agent mode operations, agent switching, and agent status management
 */
export class AgentSwitcher {
  constructor(conversationalAgent, techLeadAgent, conversationManager, options = {}) {
    this.conversationalAgent = conversationalAgent;
    this.techLeadAgent = techLeadAgent;
    this.conversationManager = conversationManager;
    this.agentCommunicationService = options.agentCommunicationService || null;
    this.verbose = options.verbose || false;
    
    // Multi-agent state
    this.multiAgentMode = options.multiAgent || false;
    this.activeAgent = 'ba'; // 'ba' or 'tl'
  }

  /**
   * Check if multi-agent mode is enabled
   * @returns {boolean} Whether multi-agent mode is enabled
   */
  isMultiAgentMode() {
    return this.multiAgentMode;
  }

  /**
   * Get currently active agent
   * @returns {string} 'ba' or 'tl'
   */
  getActiveAgent() {
    return this.activeAgent;
  }

  /**
   * Get the current agent instance
   * @returns {Object} The active agent instance
   */
  getCurrentAgent() {
    if (this.multiAgentMode && this.activeAgent === 'tl') {
      return this.techLeadAgent;
    }
    return this.conversationalAgent;
  }

  /**
   * Switch to specific agent
   * @param {string} agentType - 'ba' or 'tl'
   * @returns {boolean} Whether switch was successful
   */
  async switchAgent(agentType) {
    if (!this.multiAgentMode) {
      if (this.verbose) {
        console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      }
      return false;
    }
    
    if (agentType === 'ba' || agentType === 'tl') {
      const previousAgent = this.activeAgent;
      this.activeAgent = agentType;
      
      if (this.verbose) {
        console.log(chalk.blue(`🔄 Switched from ${previousAgent} to ${agentType}`));
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Switch to Tech Lead agent
   * @param {string} sessionId - Current session ID
   * @returns {boolean} Whether switch was successful
   */
  async switchToTechLead(sessionId) {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return false;
    }

    if (!this.techLeadAgent) {
      console.log(chalk.red('❌ Tech Lead agent not available'));
      return false;
    }

    const previousAgent = this.activeAgent;
    this.activeAgent = 'tl';

    // Record the handoff in conversation
    if (this.conversationManager && sessionId) {
      await this.conversationManager.recordAgentHandoff(
        sessionId,
        previousAgent,
        'tl',
        'Switched to Tech Lead agent'
      );
    }

    return true;
  }

  /**
   * Switch to Business Analyst agent
   * @param {string} sessionId - Current session ID
   * @returns {boolean} Whether switch was successful
   */
  async switchToBusinessAnalyst(sessionId) {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return false;
    }

    const previousAgent = this.activeAgent;
    this.activeAgent = 'ba';

    // Record the handoff in conversation
    if (this.conversationManager && sessionId) {
      await this.conversationManager.recordAgentHandoff(
        sessionId,
        previousAgent,
        'ba',
        'Switched to Business Analyst agent'
      );
    }

    return true;
  }

  /**
   * Toggle between available agents
   * @param {string} sessionId - Current session ID
   * @returns {string|null} The new active agent or null if failed
   */
  async switchActiveAgent(sessionId) {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return null;
    }

    const newAgent = this.activeAgent === 'ba' ? 'tl' : 'ba';
    const previousAgent = this.activeAgent;
    
    if (newAgent === 'tl' && !this.techLeadAgent) {
      console.log(chalk.red('❌ Tech Lead agent not available'));
      return null;
    }

    this.activeAgent = newAgent;

    // Record the handoff
    if (this.conversationManager && sessionId) {
      await this.conversationManager.recordAgentHandoff(
        sessionId,
        previousAgent,
        newAgent,
        `Switched from ${previousAgent} to ${newAgent}`
      );
    }

    return newAgent;
  }

  /**
   * Detect which agent should handle the input based on intent
   * @param {string} input - User input
   * @returns {string|null} Suggested agent ('ba' or 'tl') or null
   */
  detectIntentForAgent(input) {
    if (!this.multiAgentMode) {
      return null;
    }

    const lowerInput = input.toLowerCase();
    
    // Technical keywords suggest Tech Lead
    const techKeywords = [
      'architecture', 'technical', 'code', 'implementation', 'database',
      'api', 'performance', 'scalability', 'security', 'framework',
      'library', 'deployment', 'infrastructure', 'system design',
      'algorithm', 'data structure', 'design pattern', 'refactor',
      'optimize', 'debug', 'test', 'unit test', 'integration',
      'docker', 'kubernetes', 'ci/cd', 'devops', 'monitoring'
    ];

    // Business keywords suggest Business Analyst
    const businessKeywords = [
      'requirement', 'requirements', 'user story', 'user stories', 'acceptance criteria', 'workflow',
      'business logic', 'business', 'process', 'stakeholder', 'user experience',
      'feature', 'functionality', 'behavior', 'use case', 'scenario',
      'validation', 'specification', 'analysis', 'documentation',
      'priority', 'scope', 'milestone', 'timeline', 'deliverable'
    ];

    // Check for technical intent
    const hasTechKeywords = techKeywords.some(keyword => lowerInput.includes(keyword));
    if (hasTechKeywords) {
      return 'tl';
    }

    // Check for business intent
    const hasBusinessKeywords = businessKeywords.some(keyword => lowerInput.includes(keyword));
    if (hasBusinessKeywords) {
      return 'ba';
    }

    return null; // No clear intent detected
  }

  /**
   * Parse agent commands from user input
   * @param {string} input - User input
   * @returns {Object|null} Parsed command with agent and message
   */
  parseAgentCommand(input) {
    const trimmed = input.trim();
    
    if (trimmed.startsWith('@tl') || trimmed.startsWith('@techLead')) {
      const message = trimmed.startsWith('@tl') ? 
        trimmed.substring(3).trim() : 
        trimmed.substring(9).trim();
      return { agent: 'tl', message };
    }
    
    if (trimmed.startsWith('@ba') || trimmed.startsWith('@business')) {
      const message = trimmed.startsWith('@ba') ? 
        trimmed.substring(3).trim() : 
        trimmed.substring(9).trim();
      return { agent: 'ba', message };
    }
    
    return null;
  }

  /**
   * Check if input is a switch command
   * @param {string} input - User input
   * @returns {boolean} Whether input is a switch command
   */
  isSwitchCommand(input) {
    const command = input.toLowerCase().trim();
    return command === 'switch';
  }

  /**
   * Display current agent status
   */
  displayAgentStatus() {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return;
    }

    console.log(chalk.blue('\n🤖 Multi-Agent Status:'));
    console.log(chalk.white('  Active Agent: '), this.activeAgent === 'ba' ? 
      chalk.cyan('🤖 Business Analyst') : 
      chalk.cyan('🏗️ Tech Lead'));
    
    console.log(chalk.white('  Available Agents:'));
    console.log(chalk.white('    🤖 Business Analyst: '), chalk.green('Available'));
    console.log(chalk.white('    🏗️ Tech Lead: '), 
      this.techLeadAgent ? chalk.green('Available') : chalk.red('Not Available'));
  }

  /**
   * Get agent display name
   * @param {string} agentType - 'ba' or 'tl'
   * @returns {string} Display name
   */
  getAgentDisplayName(agentType) {
    return agentType === 'ba' ? 'Business Analyst' : 'Tech Lead';
  }

  /**
   * Get agent icon emoji
   * @param {string} agentType - 'ba' or 'tl'
   * @returns {string} Agent icon
   */
  getAgentIcon(agentType) {
    return agentType === 'ba' ? '🤖' : '🏗️';
  }

  /**
   * Get formatted agent info for display
   * @param {string} agentType - Optional agent type, uses active agent if not provided
   * @returns {Object} Agent info with name, icon, and type
   */
  getAgentInfo(agentType = null) {
    const agent = agentType || this.activeAgent;
    return {
      type: agent,
      name: this.getAgentDisplayName(agent),
      icon: this.getAgentIcon(agent),
      isActive: agent === this.activeAgent
    };
  }

  /**
   * Check if tech lead agent is available
   * @returns {boolean} Whether tech lead agent is available
   */
  isTechLeadAvailable() {
    return this.techLeadAgent !== null;
  }

  /**
   * Reset to default agent (BA)
   */
  resetToDefault() {
    this.activeAgent = 'ba';
  }

  /**
   * Enable multi-agent mode
   * @param {Object} techLeadAgent - Tech lead agent instance
   */
  enableMultiAgentMode(techLeadAgent) {
    this.multiAgentMode = true;
    this.techLeadAgent = techLeadAgent;
  }

  /**
   * Disable multi-agent mode
   */
  disableMultiAgentMode() {
    this.multiAgentMode = false;
    this.activeAgent = 'ba';
    this.techLeadAgent = null;
  }

  /**
   * Get multi-agent commands for help display
   * @returns {Array} Array of command descriptions
   */
  getMultiAgentCommands() {
    if (!this.multiAgentMode) {
      return [];
    }

    return [
      { command: '@tl [message]', description: 'Switch to or invoke Tech Lead agent' },
      { command: '@ba [message]', description: 'Switch to or invoke Business Analyst agent' },
      { command: 'switch', description: 'Toggle between BA and TL agents' },
      { command: 'agents', description: 'Show multi-agent status' }
    ];
  }

  /**
   * Check if automatic agent switching should occur
   * @param {string} input - User input
   * @returns {string|null} Suggested agent if different from current, null otherwise
   */
  shouldAutoSwitch(input) {
    if (!this.multiAgentMode) {
      return null;
    }

    const suggestedAgent = this.detectIntentForAgent(input);
    if (suggestedAgent && suggestedAgent !== this.activeAgent) {
      return suggestedAgent;
    }

    return null;
  }
}