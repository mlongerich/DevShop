import chalk from 'chalk';

/**
 * UIManager - Extracted from InteractiveCLI
 * Handles all user interface concerns: prompts, displays, formatting, and user interaction
 */
export class UIManager {
  constructor(options = {}) {
    this.multiAgentMode = options.multiAgent || false;
    this.verbose = options.verbose || false;
  }

  /**
   * Display session header (existing InteractiveCLI.displayHeader logic)
   * @param {string} repo - Repository string (owner/repo)
   * @param {string} existingSessionId - Optional existing session ID
   */
  displayHeader(repo, existingSessionId) {
    console.log(chalk.cyan.bold(`\n🤖 DevShop Interactive Session`));
    
    if (this.multiAgentMode) {
      console.log(chalk.white(`📋 Repository: ${repo} | Mode: Multi-Agent (BA + TL)`));
      console.log(chalk.gray('💡 Use @ba or @tl to direct messages to specific agents'));
      console.log(chalk.gray('💡 Use "switch" to toggle between agents'));
    } else {
      console.log(chalk.white(`📋 Repository: ${repo} | Mode: Business Analyst`));
    }
    
    if (existingSessionId) {
      console.log(chalk.yellow(`🔄 Resuming session: ${existingSessionId.substring(0, 8)}...`));
    }
    
    if (this.multiAgentMode) {
      console.log(chalk.gray('💡 Multi-agent mode: BA analyzes requirements, TL provides technical guidance'));
    }
    
    console.log(chalk.gray('💡 Type "help" for available commands, "exit" to end session\n'));
  }

  /**
   * Display help information (existing InteractiveCLI.displayHelp logic)
   */
  displayHelp() {
    console.log(chalk.cyan('\n🔧 Available Commands:'));
    console.log(chalk.white('  help    - Show this help message'));
    console.log(chalk.white('  status  - Show current session status'));
    console.log(chalk.white('  exit    - End the session'));
    
    if (this.multiAgentMode) {
      console.log(chalk.cyan('\n🤝 Multi-Agent Commands:'));
      console.log(chalk.white('  @ba [message]  - Switch to Business Analyst agent'));
      console.log(chalk.white('  @tl [message]  - Switch to Tech Lead agent'));
      console.log(chalk.white('  switch         - Toggle between BA and TL agents'));
    }
    console.log('');
  }

  /**
   * Display current status (existing InteractiveCLI.displayStatus logic)
   * @param {Object} statusData - Status information to display
   */
  displayStatus(statusData) {
    console.log(chalk.cyan('\n📊 Session Status:'));
    console.log(chalk.white(`  Session ID: ${statusData.sessionId || 'Not started'}`));
    console.log(chalk.white(`  Total Cost: $${statusData.totalCost.toFixed(4)}`));
    console.log(chalk.white(`  Turn Count: ${statusData.turnCount}`));
    console.log(chalk.white(`  Tokens Used: ${statusData.tokensUsed}`));
    
    if (this.multiAgentMode) {
      console.log(chalk.white(`  Active Agent: ${statusData.activeAgent === 'ba' ? 'Business Analyst' : 'Tech Lead'}`));
    }
    
    // Budget warnings
    if (statusData.budgetWarnings) {
      statusData.budgetWarnings.forEach(warning => {
        console.log(chalk.yellow(`  ⚠️ ${warning}`));
      });
    }
    console.log('');
  }

  /**
   * Display session info during conversation (existing InteractiveCLI.displaySessionInfo logic)
   * @param {Object} sessionData - Session information
   */
  displaySessionInfo(sessionData) {
    const agentInfo = this.multiAgentMode ? 
      ` | Active: ${sessionData.activeAgent === 'ba' ? '🤖 BA' : '🏗️ TL'}` : '';
    console.log(chalk.gray(`Session: ${sessionData.sessionId.substring(0, 8)}... | Cost: $${sessionData.totalCost.toFixed(4)} | Turns: ${sessionData.turnCount}${agentInfo}`));
  }

  /**
   * Display agent switch notification
   * @param {string} fromAgent - Previous agent
   * @param {string} toAgent - New active agent
   */
  displayAgentSwitch(fromAgent, toAgent) {
    const fromName = fromAgent === 'ba' ? 'Business Analyst' : 'Tech Lead';
    const toName = toAgent === 'ba' ? 'Business Analyst' : 'Tech Lead';
    console.log(chalk.blue(`🔄 Switched from ${fromName} to ${toName}`));
  }

  /**
   * Display budget warning
   * @param {string} warningType - Type of warning (token/cost)
   * @param {number} utilization - Current utilization percentage
   */
  displayBudgetWarning(warningType, utilization) {
    const percent = Math.round(utilization * 100);
    const emoji = utilization > 0.9 ? '🚨' : '⚠️';
    console.log(chalk.yellow(`${emoji} Approaching ${warningType} limit (${percent}% used)`));
  }

  /**
   * Display conversation state change
   * @param {string} state - New conversation state
   * @param {string} message - Optional message
   */
  displayConversationState(state, message = '') {
    const stateEmojis = {
      gathering: '📝',
      clarifying: '❓',
      proposing: '💡',
      ready_to_finalize: '✅',
      finalized: '🎯'
    };

    const emoji = stateEmojis[state] || '📋';
    console.log(chalk.blue(`${emoji} ${message || `Conversation state: ${state}`}`));
  }

  /**
   * Display error message with formatting
   * @param {Error} error - Error object
   * @param {string} context - Additional context
   */
  displayError(error, context = '') {
    console.log(chalk.red(`❌ Error${context ? ` ${context}` : ''}: ${error.message}`));
    if (this.verbose && error.stack) {
      console.log(chalk.gray(error.stack));
    }
  }

  /**
   * Display success message
   * @param {string} message - Success message
   */
  displaySuccess(message) {
    console.log(chalk.green(`✅ ${message}`));
  }

  /**
   * Display info message
   * @param {string} message - Info message
   */
  displayInfo(message) {
    console.log(chalk.cyan(`ℹ️  ${message}`));
  }

  /**
   * Display warning message
   * @param {string} message - Warning message
   */
  displayWarning(message) {
    console.log(chalk.yellow(`⚠️ ${message}`));
  }

  /**
   * Display formatted LLM response
   * @param {string} content - Response content
   * @param {string} agentType - Agent type ('ba' or 'tl')
   * @param {Object} usage - Token usage information
   */
  displayLLMResponse(content, agentType, usage) {
    const agentEmoji = agentType === 'ba' ? '🤖' : '🏗️';
    const agentName = agentType === 'ba' ? 'Business Analyst' : 'Tech Lead';
    
    console.log(chalk.cyan(`\n${agentEmoji} ${agentName}:`));
    console.log(chalk.white(content));
    
    if (usage && this.verbose) {
      console.log(chalk.gray(`\n💰 Tokens: ${usage.tokens || 0} | Cost: $${(usage.cost || 0).toFixed(4)}`));
    }
  }

  /**
   * Display finalization prompt (existing InteractiveCLI logic)
   * @param {string} state - Current conversation state
   */
  displayFinalizationPrompt(state) {
    if (state === 'ready_to_finalize' || state === 'proposing') {
      console.log(chalk.yellow('\n📋 Ready to create GitHub issues!'));
      console.log(chalk.white('Type "yes" to create the issues, or continue the conversation to make changes.'));
    }
  }

  /**
   * Display conversation hints based on context
   * @param {Object} context - Conversation context
   */
  displayConversationHints(context) {
    if (context.turnCount === 0) {
      console.log(chalk.gray('💡 Start by describing what you want to build or improve'));
    }
    
    if (this.multiAgentMode && context.turnCount > 2) {
      console.log(chalk.gray('💡 Try @tl for technical questions or @ba for business requirements'));
    }
  }

  /**
   * Display final session summary
   * @param {Object} summary - Session summary data
   */
  displaySessionSummary(summary) {
    console.log(chalk.cyan('\n📊 Session Summary:'));
    console.log(chalk.white(`  Duration: ${summary.duration || 'N/A'}`));
    console.log(chalk.white(`  Total Turns: ${summary.totalTurns || 0}`));
    console.log(chalk.white(`  Total Cost: $${(summary.totalCost || 0).toFixed(4)}`));
    console.log(chalk.white(`  Issues Created: ${summary.issuesCreated || 0}`));
    
    if (summary.issueUrls && summary.issueUrls.length > 0) {
      console.log(chalk.green('\n🎯 Created Issues:'));
      summary.issueUrls.forEach(url => {
        console.log(chalk.blue(`  📝 ${url}`));
      });
    }
  }

  /**
   * Clear screen (if supported)
   */
  clearScreen() {
    if (process.stdout.isTTY) {
      console.clear();
    }
  }

  /**
   * Display loading indicator
   * @param {string} message - Loading message
   */
  displayLoading(message = 'Processing...') {
    console.log(chalk.yellow(`⏳ ${message}`));
  }

  /**
   * Display conversation mode options
   */
  displayConversationModeInfo() {
    console.log(chalk.cyan('\n📋 Conversation Mode Commands:'));
    console.log(chalk.white('  finalize - Create GitHub issues from our conversation'));
    console.log(chalk.white('  modify   - Request changes to proposed issues'));
    console.log('');
  }
}