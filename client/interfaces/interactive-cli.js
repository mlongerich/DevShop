import readline from 'readline';
import chalk from 'chalk';
import { BudgetTracker } from '../components/budget-tracker.js';
import { UIManager } from '../components/ui-manager.js';
import { SessionManager } from '../components/session-manager.js';
import { AgentSwitcher } from '../components/agent-switcher.js';

/**
 * Interactive CLI for real-time conversation with AI agents
 * Supports both single-agent (BA only) and multi-agent (BA + TL) conversations
 */
export class InteractiveCLI {
  constructor(conversationalAgent, conversationManager, sessionService, options = {}) {
    this.conversationalAgent = conversationalAgent;
    this.conversationManager = conversationManager;
    this.sessionService = sessionService;
    this.rl = null;
    this.currentSession = null;
    this.totalCost = 0;
    this.turnCount = 0;
    
    // Multi-agent support
    this.multiAgentMode = options.multiAgent || false;
    this.techLeadAgent = options.techLeadAgent || null;
    this.activeAgent = 'ba'; // 'ba' or 'tl'
    this.agentCommunicationService = options.agentCommunicationService || null;
    
    // Token budget management - now using BudgetTracker
    this.budgetTracker = new BudgetTracker({
      maxTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
      maxCost: parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00,
      warningThreshold: 0.8
    });
    
    // UI management - now using UIManager
    this.uiManager = new UIManager({
      multiAgent: this.multiAgentMode,
      verbose: options.verbose || false
    });
    
    // Session management - now using SessionManager
    this.sessionManager = new SessionManager(sessionService, conversationManager, {
      verbose: options.verbose || false
    });
    
    // Agent switching - now using AgentSwitcher
    this.agentSwitcher = new AgentSwitcher(
      conversationalAgent,
      options.techLeadAgent || null,
      conversationManager,
      {
        multiAgent: options.multiAgent || false,
        verbose: options.verbose || false,
        agentCommunicationService: options.agentCommunicationService
      }
    );
    
    // Keep backward compatibility properties
    this.tokenBudget = {
      get sessionTokensUsed() { return this._budgetTracker.sessionTokensUsed; },
      get sessionCostUsed() { return this._budgetTracker.sessionCostUsed; },
      get maxTokensPerSession() { return this._budgetTracker.maxTokensPerSession; },
      get maxCostPerSession() { return this._budgetTracker.maxCostPerSession; },
      get warningThreshold() { return this._budgetTracker.warningThreshold; },
      get extensions() { return this._budgetTracker.extensions; },
      _budgetTracker: this.budgetTracker
    };
    
    // Keep currentSession, totalCost, turnCount for backward compatibility
    Object.defineProperty(this, 'currentSession', {
      get: () => this.sessionManager.getCurrentSession(),
      enumerable: true
    });
    
    Object.defineProperty(this, 'totalCost', {
      get: () => this.sessionManager.getSessionUsage().totalCost,
      set: (value) => this.sessionManager.updateSessionState(value, this.sessionManager.getSessionUsage().turnCount),
      enumerable: true
    });
    
    Object.defineProperty(this, 'turnCount', {
      get: () => this.sessionManager.getSessionUsage().turnCount,
      set: (value) => this.sessionManager.updateSessionState(this.sessionManager.getSessionUsage().totalCost, value),
      enumerable: true
    });
    
    // Keep agent-related properties for backward compatibility
    Object.defineProperty(this, 'multiAgentMode', {
      get: () => this.agentSwitcher.isMultiAgentMode(),
      set: (value) => value ? this.agentSwitcher.enableMultiAgentMode(this.techLeadAgent) : this.agentSwitcher.disableMultiAgentMode(),
      enumerable: true
    });
    
    Object.defineProperty(this, 'activeAgent', {
      get: () => this.agentSwitcher.getActiveAgent(),
      set: (value) => this.agentSwitcher.switchAgent(value),
      enumerable: true
    });
    
    Object.defineProperty(this, 'techLeadAgent', {
      get: () => this.agentSwitcher.techLeadAgent,
      set: (value) => this.agentSwitcher.techLeadAgent = value,
      enumerable: true
    });
  }

  /**
   * Start interactive conversation session
   * @param {string} repo - Repository in format owner/repo
   * @param {string} existingSessionId - Optional session ID to resume
   * @param {string} initialInput - Optional initial input to start conversation with custom text
   * @returns {Promise<void>}
   */
  async start(repo, existingSessionId = null, initialInput = null) {
    const [repoOwner, repoName] = repo.split('/');
    
    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Display header
    this.displayHeader(repo, existingSessionId);

    try {
      if (existingSessionId) {
        // Resume existing session
        await this.resumeSession(existingSessionId, repoOwner, repoName);
      } else {
        // Start new session with optional initial input
        await this.startNewSession(repoOwner, repoName, initialInput);
      }

      // Enter conversation loop
      await this.conversationLoop();

    } catch (error) {
      console.error(chalk.red(`\n❌ Interactive session failed: ${error.message}`));
      throw error;
    } finally {
      if (this.rl) {
        this.rl.close();
      }
    }
  }

  /**
   * Display session header
   */
  displayHeader(repo, existingSessionId) {
    // Delegate to UIManager while preserving exact same interface
    this.uiManager.displayHeader(repo, existingSessionId);
  }

  /**
   * Start a new interactive session
   */
  async startNewSession(repoOwner, repoName, customInitialInput = null) {
    // Delegate to SessionManager while preserving exact same interface
    const result = await this.sessionManager.startNewSession(repoOwner, repoName, this.multiAgentMode);
    
    // Create enhanced context for agent initialization
    const context = {
      ...result.context,
      initialInput: customInitialInput || (this.multiAgentMode ? 
        `Hi! I'm starting a multi-agent conversation with both Business Analyst and Tech Lead to discuss work on this repository.` :
        `Hi! I'm starting an interactive conversation to discuss potential work on this repository.`),
      verbose: false
    };

    // Start conversation with BA agent
    const agentResult = await this.conversationalAgent.startConversation(context);
    
    // Update session state through SessionManager
    this.sessionManager.updateSessionState(agentResult.cost || 0, agentResult.turnCount || 1);

    // Display initial BA response
    this.displayBAResponse(agentResult.response);
    this.displaySessionInfo();
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId, repoOwner, repoName) {
    // Delegate to SessionManager while preserving exact same interface
    const result = await this.sessionManager.resumeSession(sessionId, repoOwner, repoName);

    // Load token budget from conversation state
    await this.loadTokenBudgetFromConversation(result.conversationContext);

    // Display conversation history
    console.log(chalk.green('📋 Resuming conversation...\n'));
    await this.sessionManager.displayConversationHistory(sessionId, this.multiAgentMode);
    console.log(chalk.green('────────────────────────────────────────'));
    console.log(chalk.green('💬 Continue the conversation below:\n'));
    
    // Show token budget status if extensions exist
    if (this.tokenBudget.extensions.length > 0) {
      console.log(chalk.yellow(`🎯 Token limit has been extended ${this.tokenBudget.extensions.length} times`));
      console.log(chalk.gray(`   Current limits: ${this.tokenBudget.maxTokensPerSession} tokens, $${this.tokenBudget.maxCostPerSession.toFixed(2)}`));
    }

    this.displaySessionInfo();
  }

  /**
   * Load token budget from conversation state (for resumed sessions)
   * @param {Object} conversationContext - Conversation context data
   */
  async loadTokenBudgetFromConversation(conversationContext) {
    // Delegate to BudgetTracker while preserving exact same interface
    if (conversationContext.tokenBudget) {
      // Convert old format to new format if needed
      const budgetData = {
        sessionTokensUsed: conversationContext.tokenBudget.sessionTokensUsed || 0,
        sessionCostUsed: conversationContext.tokenBudget.sessionCostUsed || 0,
        extensions: conversationContext.tokenBudget.extensions || []
      };
      
      // If old format with totalAllocated, convert to extensions
      if (conversationContext.tokenBudget.totalAllocatedTokens) {
        const originalTokens = parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000;
        const originalCost = parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00;
        const extraTokens = conversationContext.tokenBudget.totalAllocatedTokens - originalTokens;
        const extraCost = conversationContext.tokenBudget.totalAllocatedCost - originalCost;
        
        if (extraTokens > 0 || extraCost > 0) {
          budgetData.extensions = [{
            tokens: extraTokens,
            cost: extraCost,
            reason: 'Legacy budget extension',
            timestamp: new Date().toISOString()
          }];
        }
      }
      
      this.budgetTracker.loadFromConversationContext({ tokenBudget: budgetData });
    } else {
      // Initialize with defaults for older conversations
      console.log(chalk.gray('ℹ️  Initializing token budget for legacy session'));
    }
  }

  /**
   * Main conversation loop
   */
  async conversationLoop() {
    return new Promise((resolve) => {
      const promptUser = () => {
        this.rl.question(chalk.white('You: '), async (input) => {
          try {
            const trimmedInput = input.trim();
            
            // Handle empty input
            if (!trimmedInput) {
              promptUser();
              return;
            }

            // Check for special commands
            const commandResult = await this.handleSpecialCommands(trimmedInput);
            if (commandResult === 'exit') {
              console.log(chalk.yellow('\nGoodbye! 👋'));
              console.log(chalk.gray(`Session ${this.currentSession.sessionId.substring(0, 8)}... has been saved.`));
              console.log(chalk.gray(`Review it with: npm run logs --session=${this.currentSession.sessionId}`));
              resolve();
              return;
            } else if (commandResult === 'handled') {
              promptUser();
              return;
            } else if (commandResult === 'switch_to_tl') {
              await this.switchToTechLead(trimmedInput);
              promptUser();
              return;
            } else if (commandResult === 'switch_to_ba') {
              await this.switchToBusinessAnalyst();
              promptUser();
              return;
            } else if (commandResult === 'switch_agent') {
              await this.switchActiveAgent();
              promptUser();
              return;
            }

            // Process user input with appropriate agent
            await this.processUserInput(trimmedInput);
            
            // Continue conversation loop
            promptUser();
            
          } catch (error) {
            // Display user-friendly error but log normally
            console.error(chalk.red(`\n❌ Error: ${error.message}`));
            console.log(chalk.gray('Please try again or type "exit" to quit.\n'));
            
            // Log error normally for debugging
            console.error('Interactive CLI Error:', error);
            
            promptUser();
          }
        });
      };

      promptUser();
    });
  }

  /**
   * Handle special commands (help, exit, status, cost, agent switching)
   * @param {string} input - User input
   * @returns {string} 'exit', 'handled', 'switch_agent', or 'continue'
   */
  async handleSpecialCommands(input) {
    const command = input.toLowerCase().trim();

    // Multi-agent commands
    if (this.multiAgentMode) {
      if (command.startsWith('@tl') || command.startsWith('@techLead')) {
        return 'switch_to_tl';
      }
      if (command.startsWith('@ba') || command.startsWith('@business')) {
        return 'switch_to_ba';
      }
      if (command === 'switch') {
        return 'switch_agent';
      }
    }

    switch (command) {
      case 'exit':
      case 'quit':
        return 'exit';

      case 'help':
        this.displayHelp();
        return 'handled';

      case 'status':
        this.displayStatus();
        return 'handled';

      case 'cost':
        this.displayCostInfo();
        return 'handled';

      case 'history':
        await this.sessionManager.displayConversationHistory(this.currentSession.sessionId, this.multiAgentMode);
        return 'handled';

      case 'agents':
        if (this.multiAgentMode) {
          this.displayAgentStatus();
          return 'handled';
        }
        return 'continue';

      default:
        return 'continue';
    }
  }

  /**
   * Detect which agent should handle the input based on content analysis
   * @param {string} input - User input to analyze
   * @returns {string|null} 'ba', 'tl', or null if no clear preference
   */
  detectIntentForAgent(input) {
    // Delegate to AgentSwitcher while preserving exact same interface
    return this.agentSwitcher.detectIntentForAgent(input);
  }

  /**
   * Process user input with appropriate agent (BA or TL)
   */
  async processUserInput(input) {
    // Log user input to session logs
    await this.sessionManager.logUserInteraction(input, this.activeAgent, this.multiAgentMode);

    // Check for automatic agent switching in multi-agent mode
    if (this.multiAgentMode) {
      const suggestedAgent = this.detectIntentForAgent(input);
      if (suggestedAgent && suggestedAgent !== this.activeAgent) {
        console.log(chalk.blue(`\n💡 This seems like a question for the ${suggestedAgent === 'tl' ? 'Tech Lead' : 'BA'}. Switching...`));
        this.activeAgent = suggestedAgent;
        this.displayAgentStatus();
      }
    }

    // Check token limits before processing
    const canProceed = await this.checkTokenLimits();
    if (!canProceed) {
      return; // Token limit handling will manage the flow
    }

    const agentName = this.activeAgent === 'tl' ? 'Tech Lead' : 'BA';
    const agentIcon = this.activeAgent === 'tl' ? '🏗️' : '🤖';
    
    console.log(chalk.gray(`\n${agentIcon} ${agentName} is thinking...`));

    const context = {
      sessionId: this.currentSession.sessionId,
      repoOwner: this.currentSession.repoOwner,
      repoName: this.currentSession.repoName,
      userInput: input,
      verbose: false
    };

    let result;
    
    try {
      if (this.activeAgent === 'tl' && this.techLeadAgent && this.multiAgentMode) {
        // Process with Tech Lead agent
        result = await this.processTechLeadInput(context, input);
      } else {
        // Process with BA agent (default)
        result = await this.conversationalAgent.continueConversation(context);
      }
    } catch (error) {
      // Check if this is a token limit error
      if (this.isTokenLimitError(error)) {
        // Clear thinking message
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
        
        console.log(chalk.yellow(`\n⚠️  Response generation completed but token limit reached.`));
        
        // Handle token limit gracefully
        await this.handleTokenLimit(error);
        return;
      } else {
        // Re-throw non-token-limit errors
        throw error;
      }
    }
    
    // Update session state
    this.totalCost = result.totalCost;
    this.turnCount = result.turnCount;

    // Clear thinking message
    process.stdout.write('\r' + ' '.repeat(30) + '\r');

    // Log agent response to session logs
    if (this.sessionService && result.response) {
      await this.sessionService.logInteraction(
        'agent_response',
        result.response,
        {
          session_id: this.currentSession.sessionId,
          agent_type: this.activeAgent,
          agent_name: agentName,
          turn_count: this.turnCount,
          turn_cost: result.turnCost || 0,
          total_cost: result.totalCost || 0,
          conversation_state: result.state
        }
      );
    }

    // Display response with agent identification
    this.displayAgentResponse(result.response, this.activeAgent);

    // Show cost for this turn
    console.log(chalk.yellow(`💰 Turn cost: $${result.turnCost.toFixed(4)} • Total: $${result.totalCost.toFixed(4)}`));

    // Handle conversation state
    if (result.state === 'ready_to_finalize' || result.state === 'proposing') {
      console.log(chalk.green('\n✅ Ready to create issues!'));
      console.log(chalk.blue('Type "yes" to create issues, "no" to continue discussion, or "modify" to adjust requirements.'));
    }

    // Check if user said yes to creating issues
    if (input.toLowerCase() === 'yes' && (result.state === 'ready_to_finalize' || result.state === 'proposing')) {
      await this.finalizeConversation();
    }

    console.log('');
  }

  /**
   * Finalize conversation and create GitHub issues
   */
  async finalizeConversation() {
    console.log(chalk.blue('\n🔄 Creating GitHub issues...'));

    const context = {
      sessionId: this.currentSession.sessionId,
      repoOwner: this.currentSession.repoOwner,
      repoName: this.currentSession.repoName
    };

    try {
      const result = await this.conversationalAgent.finalizeConversation(context);
      
      // Display results
      console.log(chalk.green(`\n🎉 Conversation finalized!`));
      
      if (result.createdIssues.length > 0) {
        console.log(chalk.green(`\n📋 Created ${result.totalIssues} GitHub issues:`));
        for (const issue of result.createdIssues) {
          console.log(chalk.gray(`   ✅ Issue #${issue.number}: ${issue.title}`));
        }
      }

      if (result.duplicatesFound > 0) {
        console.log(chalk.yellow(`\n⚠️  Found ${result.duplicatesFound} similar existing issues`));
      }

      this.totalCost = result.totalCost;
      console.log(chalk.yellow(`\n💰 Total conversation cost: $${result.totalCost.toFixed(4)} (${result.conversationTurns} turns)`));
      
      console.log(chalk.green('\n✅ Issues created successfully!'));
      console.log(chalk.blue("Type 'exit' to quit or start discussing another feature."));

    } catch (error) {
      console.error(chalk.red(`\n❌ Failed to create issues: ${error.message}`));
      console.log(chalk.gray('You can try again or continue the conversation.'));
    }
  }

  /**
   * Display BA response with formatting
   */
  displayBAResponse(response) {
    console.log(chalk.green('\nBA:'), this.formatResponse(response));
  }

  /**
   * Format response for better readability
   */
  formatResponse(text) {
    // Simple formatting - could be enhanced further
    return text
      .replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'))  // Bold text
      .replace(/\*(.*?)\*/g, chalk.italic('$1'));   // Italic text
  }

  /**
   * Display session information
   */
  displaySessionInfo() {
    // Delegate to SessionManager while preserving exact same interface
    this.sessionManager.displaySessionInfo(this.multiAgentMode, this.activeAgent);
  }

  /**
   * Display help information
   */
  displayHelp() {
    console.log(chalk.blue('\n📖 Available Commands:'));
    console.log(chalk.white('  help     '), chalk.gray('- Show this help message'));
    console.log(chalk.white('  status   '), chalk.gray('- Show conversation status'));
    console.log(chalk.white('  cost     '), chalk.gray('- Show cost information'));
    console.log(chalk.white('  history  '), chalk.gray('- Show conversation history'));
    console.log(chalk.white('  exit     '), chalk.gray('- End conversation and quit'));
    console.log(chalk.blue('\n💡 During conversation:'));
    console.log(chalk.white('  yes      '), chalk.gray('- Accept proposed issues and create them'));
    console.log(chalk.white('  no       '), chalk.gray('- Continue discussion without creating issues'));
    console.log(chalk.white('  modify   '), chalk.gray('- Request changes to proposed issues'));
    console.log('');
  }

  /**
   * Display conversation status
   */
  displayStatus() {
    console.log(chalk.blue('\n📊 Conversation Status:'));
    console.log(chalk.white('  Repository: '), chalk.cyan(`${this.currentSession.repoOwner}/${this.currentSession.repoName}`));
    console.log(chalk.white('  Session ID: '), chalk.gray(this.currentSession.sessionId));
    console.log(chalk.white('  Turns:      '), chalk.yellow(this.turnCount.toString()));
    console.log(chalk.white('  Total Cost: '), chalk.green(`$${this.totalCost.toFixed(4)}`));
    console.log('');
  }

  /**
   * Display cost information
   */
  displayCostInfo() {
    console.log(chalk.blue('\n💰 Cost Information:'));
    console.log(chalk.white('  Total Cost: '), chalk.green(`$${this.totalCost.toFixed(4)}`));
    console.log(chalk.white('  Turns:      '), chalk.yellow(this.turnCount.toString()));
    if (this.turnCount > 0) {
      console.log(chalk.white('  Avg/Turn:   '), chalk.cyan(`$${(this.totalCost / this.turnCount).toFixed(4)}`));
    }
    console.log('');
  }

  /**
   * Display conversation history
   */
  async displayConversationHistory(sessionId) {
    // Delegate to SessionManager while preserving exact same interface
    await this.sessionManager.displayConversationHistory(sessionId, this.multiAgentMode);
  }

  // Multi-Agent Support Methods

  /**
   * Switch to Tech Lead agent
   */
  async switchToTechLead(input) {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return;
    }

    if (!this.techLeadAgent) {
      console.log(chalk.red('❌ Tech Lead agent is not available'));
      return;
    }

    const previousAgent = this.activeAgent;
    this.activeAgent = 'tl';

    // Record the handoff in conversation
    if (this.conversationManager && previousAgent !== 'tl') {
      await this.conversationManager.recordAgentHandoff(
        this.currentSession.sessionId,
        previousAgent,
        'tl',
        'User requested Tech Lead',
        input
      );
    }

    console.log(chalk.blue('🏗️ Switched to Tech Lead agent'));
    console.log(chalk.gray('   Note: TL analysis may take longer for complex technical questions'));
    
    // Process the message if it contains more than just the @tl command
    const message = input.replace(/^@(tl|techlead)\s*/i, '').trim();
    if (message) {
      try {
        await this.processUserInput(message);
      } catch (error) {
        // If TL processing fails completely, provide clear feedback
        console.log(chalk.yellow('\n⚠️  The Tech Lead agent encountered an issue and couldn\'t process your request'));
        console.log(chalk.blue('🔄 Switching back to Business Analyst to help you...'));
        
        // Switch back to BA and continue
        this.activeAgent = 'ba';
        await this.processUserInput(message);
      }
    }
  }

  /**
   * Switch to Business Analyst agent
   */
  async switchToBusinessAnalyst() {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return;
    }

    const previousAgent = this.activeAgent;
    this.activeAgent = 'ba';

    // Record the handoff in conversation
    if (this.conversationManager && previousAgent !== 'ba') {
      await this.conversationManager.recordAgentHandoff(
        this.currentSession.sessionId,
        previousAgent,
        'ba',
        'User requested Business Analyst',
        'Switching back to Business Analyst'
      );
    }

    console.log(chalk.blue('🤖 Switched to Business Analyst agent'));
  }

  /**
   * Switch active agent (toggle between BA and TL)
   */
  async switchActiveAgent() {
    if (!this.multiAgentMode) {
      console.log(chalk.yellow('⚠️ Multi-agent mode is not enabled'));
      return;
    }

    const newAgent = this.activeAgent === 'ba' ? 'tl' : 'ba';
    const previousAgent = this.activeAgent;
    
    if (newAgent === 'tl' && !this.techLeadAgent) {
      console.log(chalk.red('❌ Tech Lead agent is not available'));
      return;
    }

    this.activeAgent = newAgent;

    // Record the handoff
    if (this.conversationManager) {
      await this.conversationManager.recordAgentHandoff(
        this.currentSession.sessionId,
        previousAgent,
        newAgent,
        'User switched agents',
        `Switched from ${previousAgent.toUpperCase()} to ${newAgent.toUpperCase()}`
      );
    }

    const agentName = newAgent === 'tl' ? 'Tech Lead' : 'Business Analyst';
    const agentIcon = newAgent === 'tl' ? '🏗️' : '🤖';
    console.log(chalk.blue(`${agentIcon} Switched to ${agentName} agent`));
  }

  /**
   * Check token limits before processing request
   * @returns {Promise<boolean>} True if can proceed, false if limit reached
   */
  async checkTokenLimits() {
    try {
      // Update current usage from session costs
      this.updateTokenUsageFromSession();
      
      // Check if we're at or near limits
      const tokenUsage = this.tokenBudget.sessionTokensUsed / this.tokenBudget.maxTokensPerSession;
      const costUsage = this.tokenBudget.sessionCostUsed / this.tokenBudget.maxCostPerSession;
      
      // Hard limit check
      if (tokenUsage >= 1.0 || costUsage >= 1.0) {
        console.log(chalk.red(`\n🚫 Token/cost limit reached before processing request.`));
        await this.handleTokenLimit();
        return false;
      }
      
      // Warning threshold check
      if (tokenUsage >= this.tokenBudget.warningThreshold || costUsage >= this.tokenBudget.warningThreshold) {
        const remainingTokens = Math.max(0, this.tokenBudget.maxTokensPerSession - this.tokenBudget.sessionTokensUsed);
        const remainingCost = Math.max(0, this.tokenBudget.maxCostPerSession - this.tokenBudget.sessionCostUsed);
        
        console.log(chalk.yellow(`\n⚠️  Approaching limits: ${remainingTokens} tokens, $${remainingCost.toFixed(2)} remaining`));
      }
      
      return true;
    } catch (error) {
      console.log(chalk.gray('Note: Unable to check token limits, proceeding with request'));
      return true;
    }
  }

  /**
   * Update token usage from current session costs
   */
  updateTokenUsageFromSession() {
    // Estimate tokens from cost (rough approximation)
    const estimatedTokens = Math.round(this.totalCost * 1000); // ~$0.001 per token estimate
    this.tokenBudget.sessionTokensUsed = estimatedTokens;
    this.tokenBudget.sessionCostUsed = this.totalCost;
  }

  /**
   * Update token budget from server limits information
   * @param {Object} limitsInfo - Server limits information
   */
  updateTokenBudgetFromServer(limitsInfo) {
    if (limitsInfo && limitsInfo.current_usage) {
      // Use server's actual usage data if available
      this.tokenBudget.sessionTokensUsed = limitsInfo.current_usage.tokens || this.tokenBudget.sessionTokensUsed;
      this.tokenBudget.sessionCostUsed = limitsInfo.current_usage.cost || this.tokenBudget.sessionCostUsed;
      
      // Update limits if server has different values (due to extensions)
      if (limitsInfo.limits) {
        this.tokenBudget.maxTokensPerSession = Math.max(this.tokenBudget.maxTokensPerSession, limitsInfo.limits.max_tokens || this.tokenBudget.maxTokensPerSession);
        this.tokenBudget.maxCostPerSession = Math.max(this.tokenBudget.maxCostPerSession, limitsInfo.limits.max_cost || this.tokenBudget.maxCostPerSession);
      }
    }
  }

  /**
   * Check if an error is related to token limits
   * @param {Error} error - Error to check
   * @returns {boolean} True if token limit error
   */
  isTokenLimitError(error) {
    const message = error.message.toLowerCase();
    return message.includes('token') || 
           message.includes('limit') || 
           message.includes('quota') || 
           message.includes('usage') ||
           message.includes('context length');
  }

  /**
   * Handle token limit reached scenario
   * @param {Error} [error] - Optional error that triggered this
   */
  async handleTokenLimit(_error = null) {
    console.log(chalk.blue('\n═══════════════════════════════════════'));
    console.log(chalk.blue('          TOKEN LIMIT REACHED'));
    console.log(chalk.blue('═══════════════════════════════════════'));
    
    // Show current usage
    const tokenUsage = this.tokenBudget.sessionTokensUsed;
    const costUsage = this.tokenBudget.sessionCostUsed;
    const extensions = this.tokenBudget.extensions.length;
    
    console.log(chalk.yellow(`📊 Current Usage:`));
    console.log(chalk.white(`   Tokens: ${tokenUsage}/${this.tokenBudget.maxTokensPerSession} (${Math.round(tokenUsage/this.tokenBudget.maxTokensPerSession*100)}%)`));
    console.log(chalk.white(`   Cost: $${costUsage.toFixed(4)}/$${this.tokenBudget.maxCostPerSession.toFixed(2)} (${Math.round(costUsage/this.tokenBudget.maxCostPerSession*100)}%)`));
    if (extensions > 0) {
      console.log(chalk.white(`   Extensions: ${extensions} previous limit increases`));
    }
    
    // Show active agent in multi-agent mode
    if (this.multiAgentMode) {
      const agentName = this.activeAgent === 'tl' ? 'Tech Lead' : 'BA';
      const agentIcon = this.activeAgent === 'tl' ? '🏗️' : '🤖';
      console.log(chalk.blue(`   Active Agent: ${agentIcon} ${agentName}`));
    }
    
    console.log(chalk.blue('\n🤔 Would you like to continue the conversation?'));
    console.log(chalk.gray('   • All conversation context will be preserved'));
    console.log(chalk.gray('   • You can specify additional token/cost budget'));
    
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('\nContinue conversation? (y/n): '), async (answer) => {
        if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
          await this.handleTokenExtension();
          resolve();
        } else {
          console.log(chalk.blue('\n✅ Conversation ended. All context has been preserved.'));
          console.log(chalk.blue(`📋 Session ID: ${this.currentSession?.sessionId}`));
          console.log(chalk.blue(`💰 Total cost: $${this.totalCost.toFixed(4)} (${this.turnCount} turns)`));
          
          if (this.rl) {
            this.rl.close();
          }
          resolve();
        }
      });
    });
  }

  /**
   * Handle token limit extension
   */
  async handleTokenExtension() {
    console.log(chalk.blue('\n💰 Token Limit Extension'));
    
    // Show cost estimates
    console.log(chalk.gray('Estimated costs (rough):'));
    console.log(chalk.gray('  • 2,000 tokens ≈ $2.00'));
    console.log(chalk.gray('  • 5,000 tokens ≈ $5.00'));
    console.log(chalk.gray('  • 10,000 tokens ≈ $10.00'));
    
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('\nHow many additional tokens? (e.g., 4000): '), async (answer) => {
        const additionalTokens = parseInt(answer.trim());
        
        if (isNaN(additionalTokens) || additionalTokens <= 0) {
          console.log(chalk.red('❌ Invalid token amount. Please enter a positive number.'));
          return this.handleTokenExtension().then(resolve);
        }
        
        // Apply extension
        const extension = {
          tokens: additionalTokens,
          estimatedCost: additionalTokens * 0.001, // Rough estimate
          timestamp: new Date().toISOString()
        };
        
        this.tokenBudget.extensions.push(extension);
        this.tokenBudget.maxTokensPerSession += additionalTokens;
        this.tokenBudget.maxCostPerSession += extension.estimatedCost;
        
        // Update conversation state if conversation manager is available
        if (this.conversationManager && this.currentSession) {
          await this.conversationManager.updateTokenBudget(
            this.currentSession.sessionId,
            additionalTokens,
            extension.estimatedCost
          );
        }
        
        console.log(chalk.green(`✅ Token limit extended by ${additionalTokens} tokens (~$${extension.estimatedCost.toFixed(2)})`));
        console.log(chalk.blue(`📊 New limits: ${this.tokenBudget.maxTokensPerSession} tokens, $${this.tokenBudget.maxCostPerSession.toFixed(2)} cost`));
        console.log(chalk.blue('\n💬 You can now continue the conversation!\n'));
        
        resolve();
      });
    });
  }

  /**
   * Detect technical focus area from user input
   * @param {string} input - User input to analyze
   * @returns {string} Technical focus area
   */
  detectTechnicalFocus(input) {
    const lowercaseInput = input.toLowerCase();
    
    if (lowercaseInput.includes('security') || lowercaseInput.includes('auth') || lowercaseInput.includes('encryption')) {
      return 'security';
    }
    
    if (lowercaseInput.includes('performance') || lowercaseInput.includes('optimize') || lowercaseInput.includes('speed')) {
      return 'performance';
    }
    
    if (lowercaseInput.includes('architecture') || lowercaseInput.includes('design') || lowercaseInput.includes('structure')) {
      return 'architecture';
    }
    
    return 'general';
  }

  /**
   * Process input with Tech Lead agent
   */
  async processTechLeadInput(context, input) {
    // Integrate with Tech Lead agent for technical analysis
    try {
      // Prepare enhanced context for TL agent
      const tlContext = {
        ...context,
        repoOwner: this.currentSession.repoOwner,
        repoName: this.currentSession.repoName,
        description: input,
        businessRequirements: input,
        taskType: 'interactive_analysis',
        focusArea: this.detectTechnicalFocus(input)
      };

      // Enhance context with methods expected by TL agent
      const enhancedContext = this.techLeadAgent.ensureContextMethods(tlContext);

      // Execute Tech Lead agent for technical analysis
      const tlResult = await this.techLeadAgent.execute(enhancedContext);
      
      // Format result to match conversational agent structure
      const result = {
        response: tlResult.summary || tlResult.technical_analysis || 'Technical analysis completed',
        cost: tlResult.cost || 0,
        turnCost: tlResult.cost || 0,
        totalCost: this.totalCost + (tlResult.cost || 0),
        turnCount: this.turnCount + 1,
        state: 'continuing',
        sessionId: context.sessionId
      };
      
      // Store TL response in multi-agent conversation
      if (this.conversationManager && this.multiAgentMode) {
        await this.conversationManager.storeConversationTurn(
          this.currentSession.sessionId,
          'tl',
          result.response,
          result.turnCost || 0,
          { agent: 'tech-lead', handoff: false }
        );
      }

      // Log TL response to session logs for npm run logs visibility
      if (this.sessionService && result.response) {
        await this.sessionService.logInteraction(
          'tl_response',
          result.response,
          {
            session_id: this.currentSession.sessionId,
            agent_type: 'tl',
            agent_name: 'Tech Lead',
            turn_count: result.turnCount,
            turn_cost: result.turnCost || 0,
            total_cost: result.totalCost || 0,
            focus_area: this.detectTechnicalFocus(input),
            technical_analysis: true
          }
        );
      }

      return result;
    } catch (error) {
      // Enhanced error handling for timeout and other failures
      const isTimeout = error.message.includes('timeout') || error.message.includes('Request timeout');
      
      if (isTimeout) {
        console.log(chalk.yellow('\n⏱️  Tech Lead analysis timed out (this can happen with complex requests)'));
        console.log(chalk.blue('🔄 Falling back to Business Analyst to continue the conversation...'));
        
        // Log timeout incident
        if (this.sessionService) {
          await this.sessionService.logInteraction(
            'tl_timeout',
            `Tech Lead agent timed out: ${error.message}`,
            {
              session_id: this.currentSession.sessionId,
              agent_type: 'tl',
              user_input: input,
              timeout_duration: '90s',
              fallback_action: 'switch_to_ba'
            }
          );
        }
      } else {
        console.log(chalk.red('❌ Tech Lead processing failed, falling back to BA'));
        console.log(chalk.gray(`   Error: ${error.message}`));
        
        // Log general error
        if (this.sessionService) {
          await this.sessionService.logInteraction(
            'tl_error',
            `Tech Lead agent failed: ${error.message}`,
            {
              session_id: this.currentSession.sessionId,
              agent_type: 'tl',
              user_input: input,
              error_type: error.name,
              fallback_action: 'switch_to_ba'
            }
          );
        }
      }
      
      console.log(chalk.gray('\n💡 Tip: You can try asking the question differently or use "@ba" to stay with the Business Analyst'));
      
      return await this.conversationalAgent.continueConversation(context);
    }
  }

  /**
   * Display agent response with proper identification
   */
  displayAgentResponse(response, agentType) {
    const agentName = agentType === 'tl' ? 'Tech Lead' : 'BA';
    const agentIcon = agentType === 'tl' ? '🏗️' : '🤖';
    
    console.log(chalk.green(`\n${agentIcon} ${agentName}:`), this.formatResponse(response));
  }

  /**
   * Display agent status in multi-agent mode
   */
  displayAgentStatus() {
    // Delegate to AgentSwitcher while preserving exact same interface
    this.agentSwitcher.displayAgentStatus();
  }

  /**
   * Enhanced help display for multi-agent mode
   */
  displayHelp() {
    console.log(chalk.blue('\n📖 Available Commands:'));
    console.log(chalk.white('  help     '), chalk.gray('- Show this help message'));
    console.log(chalk.white('  status   '), chalk.gray('- Show conversation status'));
    console.log(chalk.white('  cost     '), chalk.gray('- Show cost information'));
    console.log(chalk.white('  history  '), chalk.gray('- Show conversation history'));
    console.log(chalk.white('  exit     '), chalk.gray('- End conversation and quit'));
    
    if (this.multiAgentMode) {
      console.log(chalk.blue('\n🤖 Multi-Agent Commands:'));
      console.log(chalk.white('  @tl      '), chalk.gray('- Switch to or invoke Tech Lead agent'));
      console.log(chalk.white('  @ba      '), chalk.gray('- Switch back to Business Analyst'));
      console.log(chalk.white('  switch   '), chalk.gray('- Toggle between BA and TL agents'));
      console.log(chalk.white('  agents   '), chalk.gray('- Show agent status and availability'));
    }
    
    console.log(chalk.blue('\n💡 During conversation:'));
    console.log(chalk.white('  yes      '), chalk.gray('- Accept proposed issues and create them'));
    console.log(chalk.white('  no       '), chalk.gray('- Continue discussion without creating issues'));
    console.log(chalk.white('  modify   '), chalk.gray('- Request changes to proposed issues'));
    console.log('');
  }


  // Methods needed for TDD refactoring tests

  /**
   * Update token budget tracking
   * @param {number} tokens - Number of tokens used
   * @param {number} cost - Cost incurred
   */
  updateTokenBudget(tokens, cost) {
    // Delegate to BudgetTracker while preserving exact same interface
    this.budgetTracker.updateUsage(tokens, cost);
  }

  /**
   * Check if approaching token limit
   * @returns {boolean} True if approaching limit
   */
  isApproachingTokenLimit() {
    // Delegate to BudgetTracker while preserving exact same interface
    return this.budgetTracker.isApproachingTokenLimit();
  }

  /**
   * Check if approaching cost limit
   * @returns {boolean} True if approaching limit
   */
  isApproachingCostLimit() {
    // Delegate to BudgetTracker while preserving exact same interface
    return this.budgetTracker.isApproachingCostLimit();
  }

  /**
   * Switch between agents in multi-agent mode
   * @param {string} agentType - 'ba' or 'tl'
   */
  async switchAgent(agentType) {
    // Delegate to AgentSwitcher while preserving exact same interface
    return await this.agentSwitcher.switchAgent(agentType);
  }

  /**
   * Get current active agent instance
   * @returns {Object} Current agent instance
   */
  getCurrentAgent() {
    // Delegate to AgentSwitcher while preserving exact same interface
    return this.agentSwitcher.getCurrentAgent();
  }

  /**
   * Handle special commands (@ba, @tl, help, etc.)
   * @param {string} input - User input
   * @returns {Promise<boolean>} True if command was handled
   */
  async handleSpecialCommand(input) {
    const command = input.toLowerCase().trim();
    
    // Agent switching commands
    if (this.multiAgentMode) {
      if (command.startsWith('@ba')) {
        await this.switchAgent('ba');
        // Extract message after @ba and process it
        const message = input.substring(3).trim();
        if (message) {
          return await this.processUserInput(message);
        }
        return true;
      }
      
      if (command.startsWith('@tl')) {
        await this.switchAgent('tl');
        // Extract message after @tl and process it
        const message = input.substring(3).trim();
        if (message) {
          return await this.processUserInput(message);
        }
        return true;
      }
      
      if (command === 'switch') {
        const newAgent = this.activeAgent === 'ba' ? 'tl' : 'ba';
        await this.switchAgent(newAgent);
        console.log(chalk.blue(`Switched to ${newAgent === 'ba' ? 'Business Analyst' : 'Tech Lead'} agent`));
        return true;
      }
    }
    
    // General commands
    switch (command) {
      case 'help':
        this.displayHelp();
        return true;
      
      case 'status':
        this.displayStatus();
        return true;
      
      case 'exit':
        return 'exit';
      
      default:
        return false;
    }
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
   * Display help information
   */
  displayHelp() {
    // Delegate to UIManager while preserving exact same interface
    this.uiManager.displayHelp();
  }

  /**
   * Display current status
   */
  displayStatus() {
    // Prepare status data for UIManager
    const statusData = {
      sessionId: this.currentSession?.sessionId,
      totalCost: this.totalCost,
      turnCount: this.turnCount,
      tokensUsed: this.tokenBudget.sessionTokensUsed,
      activeAgent: this.activeAgent
    };
    
    // Add budget warnings if any
    const budgetWarnings = [];
    if (this.isApproachingTokenLimit()) {
      budgetWarnings.push('Approaching token limit');
    }
    if (this.isApproachingCostLimit()) {
      budgetWarnings.push('Approaching cost limit');
    }
    if (budgetWarnings.length > 0) {
      statusData.budgetWarnings = budgetWarnings;
    }
    
    // Delegate to UIManager while preserving exact same interface
    this.uiManager.displayStatus(statusData);
  }

  /**
   * Get token utilization percentage
   * @returns {number} Utilization percentage (0-1)
   */
  getTokenUtilization() {
    // Delegate to BudgetTracker while preserving exact same interface
    return this.budgetTracker.getTokenUtilization();
  }

  /**
   * Get cost utilization percentage
   * @returns {number} Utilization percentage (0-1)
   */
  getCostUtilization() {
    // Delegate to BudgetTracker while preserving exact same interface
    return this.budgetTracker.getCostUtilization();
  }
}