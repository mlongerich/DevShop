import readline from 'readline';
import chalk from 'chalk';

/**
 * Interactive CLI for real-time conversation with BA agent
 * Provides a user-friendly interface for multi-turn conversations
 */
export class InteractiveCLI {
  constructor(conversationalAgent, conversationManager, sessionService) {
    this.conversationalAgent = conversationalAgent;
    this.conversationManager = conversationManager;
    this.sessionService = sessionService;
    this.rl = null;
    this.currentSession = null;
    this.totalCost = 0;
    this.turnCount = 0;
  }

  /**
   * Start interactive conversation session
   * @param {string} repo - Repository in format owner/repo
   * @param {string} existingSessionId - Optional session ID to resume
   * @returns {Promise<void>}
   */
  async start(repo, existingSessionId = null) {
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
        // Start new session
        await this.startNewSession(repoOwner, repoName);
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
    console.log(chalk.blue('\n════════════════════════════════════════'));
    console.log(chalk.blue('     DevShop Interactive BA Session'));
    console.log(chalk.blue('════════════════════════════════════════'));
    console.log(chalk.cyan(`Repository: ${repo}`));
    if (existingSessionId) {
      console.log(chalk.cyan(`Resuming Session: ${existingSessionId.substring(0, 8)}...`));
    }
    console.log(chalk.gray("Type 'help' for commands or 'exit' to quit."));
    console.log(chalk.blue('────────────────────────────────────────\n'));
  }

  /**
   * Start a new interactive session
   */
  async startNewSession(repoOwner, repoName) {
    // Create context for new session
    const sessionId = await this.sessionService.createSession(
      'interactive-ba',
      `Interactive conversation for ${repoOwner}/${repoName}`
    );

    const context = {
      sessionId,
      repoOwner,
      repoName,
      initialInput: `Hi! I'm starting an interactive conversation to discuss potential work on this repository.`,
      verbose: false
    };

    // Start conversation with BA agent
    const result = await this.conversationalAgent.startConversation(context);
    
    this.currentSession = {
      sessionId: result.sessionId,
      repoOwner,
      repoName
    };
    
    this.totalCost = result.cost;
    this.turnCount = result.turnCount;

    // Display initial BA response
    this.displayBAResponse(result.response);
    this.displaySessionInfo();
  }

  /**
   * Resume an existing session
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
    
    this.totalCost = conversationContext.totalCost;
    this.turnCount = conversationContext.turnCount;

    // Display conversation history
    console.log(chalk.green('📋 Resuming conversation...\n'));
    await this.displayConversationHistory(sessionId);
    console.log(chalk.green('────────────────────────────────────────'));
    console.log(chalk.green('💬 Continue the conversation below:\n'));
    
    this.displaySessionInfo();
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
            const commandResult = this.handleSpecialCommands(trimmedInput);
            if (commandResult === 'exit') {
              console.log(chalk.yellow('\nGoodbye! 👋'));
              console.log(chalk.gray(`Session ${this.currentSession.sessionId.substring(0, 8)}... has been saved.`));
              console.log(chalk.gray(`Review it with: npm run logs --session=${this.currentSession.sessionId}`));
              resolve();
              return;
            } else if (commandResult === 'handled') {
              promptUser();
              return;
            }

            // Process user input with BA agent
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
   * Handle special commands (help, exit, status, cost)
   * @param {string} input - User input
   * @returns {string} 'exit', 'handled', or 'continue'
   */
  handleSpecialCommands(input) {
    const command = input.toLowerCase();

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
        this.displayConversationHistory(this.currentSession.sessionId);
        return 'handled';

      default:
        return 'continue';
    }
  }

  /**
   * Process user input with BA agent
   */
  async processUserInput(input) {
    console.log(chalk.gray('\n🤖 BA is thinking...'));

    const context = {
      sessionId: this.currentSession.sessionId,
      userInput: input,
      verbose: false
    };

    // Continue conversation with BA agent
    const result = await this.conversationalAgent.continueConversation(context);
    
    // Update session state
    this.totalCost = result.totalCost;
    this.turnCount = result.turnCount;

    // Clear thinking message
    process.stdout.write('\r' + ' '.repeat(20) + '\r');

    // Display BA response
    this.displayBAResponse(result.response);

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
    console.log(chalk.gray(`Session: ${this.currentSession.sessionId.substring(0, 8)}... | Cost: $${this.totalCost.toFixed(4)} | Turns: ${this.turnCount}`));
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
    try {
      const formatted = await this.conversationManager.formatConversationHistory(sessionId, false);
      console.log(formatted);
    } catch (error) {
      console.log(chalk.red('❌ Could not load conversation history'));
    }
  }
}