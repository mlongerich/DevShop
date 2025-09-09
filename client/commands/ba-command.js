import { BaseCommand } from './base-command.js';
import { BAAgent } from '../agents/ba-agent.js';
import { ConversationalBAAgent } from '../agents/conversational-ba-agent.js';
import { TechLeadAgent } from '../agents/tech-lead-agent.js';
import { AgentCommunicationService } from '../services/agent-communication-service.js';
import { InteractiveCLI } from '../interfaces/interactive-cli.js';
import chalk from 'chalk';

/**
 * BA Command
 * Handles business analyst agent workflow including multi-agent collaboration
 */
export class BACommand extends BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    super(configService, sessionService, mcpClientManager);
    this.agent = new BAAgent(mcpClientManager, sessionService, configService.getConfig());
    this.techLeadAgent = new TechLeadAgent(mcpClientManager, sessionService, configService.getConfig());
    this.agentCommunicationService = new AgentCommunicationService(this.logDir, sessionService);
    
    // Create conversational BA agent with multi-agent capabilities
    // Note: interactive mode will be set when executing interactive commands
    this.conversationalAgent = new ConversationalBAAgent(
      mcpClientManager, 
      sessionService, 
      configService.getConfig(),
      {
        multiAgent: true,
        techLeadAgent: this.techLeadAgent,
        agentCommunicationService: this.agentCommunicationService,
        interactive: false // Default to false, will be updated for interactive mode
      }
    );
  }

  /**
   * Execute BA workflow - routes between conversation and legacy modes
   * @param {Object} options - Command options
   * @param {string} options.repo - Repository name
   * @param {string} [options.description] - Feature description (legacy mode)
   * @param {string} [options.conversation] - Initial conversation input
   * @param {string} [options.session] - Existing session ID for conversation
   * @param {boolean} [options.finalize] - Finalize conversation and create issues
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} BA analysis result
   */
  async execute(options) {
    const command = 'ba';
    await this.logCommandStart(command, options);

    try {
      // Route to interactive, conversation, or legacy mode
      if (options.interactive) {
        return await this.handleInteractiveMode(options);
      } else if (options.conversation || options.session || options.finalize) {
        return await this.handleConversationMode(options);
      } else {
        return await this.handleLegacyMode(options);
      }
    } catch (error) {
      console.error(chalk.red(`❌ BA Command failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Handle legacy single-shot BA mode (backward compatibility)
   * @param {Object} options - Command options
   * @returns {Promise<Object>} BA analysis result
   */
  async handleLegacyMode(options) {
    // Validate required options for legacy mode
    this.validateOptions(options, ['repo', 'description']);

    console.log(chalk.blue('🔍 Starting Business Analysis...'));

    // Create or resume session using base method
    const sessionId = await this.createOrResumeSession(
        'ba', 
        `Feature analysis for ${options.repo}: ${options.description}`, 
        options
      );

    // Prepare context using base method
    const context = this.prepareRepositoryContext(options, sessionId, {
      featureDescription: options.description,
      repo: options.repo,
      description: options.description
    });

    // Execute BA agent using base method
    const result = await this.executeAgent(
      'ba',
      context,
      'ba_analysis_complete',
      'BA analysis completed',
      {
        repo: options.repo
      }
    );

    // Log additional result metrics after execution
    await this.sessionService.logInteraction('ba_analysis_metrics', 'BA analysis metrics', {
      repo: options.repo,
      requirements_count: result?.requirements?.length || 0,
      acceptance_criteria_count: result?.acceptance_criteria?.length || 0,
      technical_considerations: result?.technical_considerations?.length || 0
    });

    // Display summary using base method with additional lines
    const summaryLines = [
      `Requirements identified: ${result.requirements?.length || 0}`,
      `Acceptance criteria: ${result.acceptance_criteria?.length || 0}`
    ];
    this.displayBasicSummary('Business Analysis', sessionId, summaryLines);

    if (options.verbose) {
      console.log(chalk.yellow('\n📋 Summary:'));
      console.log(result.summary || 'No summary available');
    }

    return {
      session_id: sessionId,
      ...result
    };
  }

  /**
   * Handle conversational BA mode
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Conversation result
   */
  async handleConversationMode(options) {
    // Validate repository is provided
    this.validateOptions(options, ['repo']);

    if (options.finalize) {
      return await this.handleFinalize(options);
    } else if (options.session) {
      return await this.handleContinueConversation(options);
    } else if (options.conversation) {
      return await this.handleStartConversation(options);
    } else {
      throw new Error('Conversation mode requires --conversation, --session, or --finalize flag');
    }
  }

  /**
   * Start a new conversation
   * @param {Object} options - Command options with conversation input
   * @returns {Promise<Object>} Initial conversation response
   */
  async handleStartConversation(options) {
    console.log(chalk.blue('🗣️  Starting new conversation...'));

    // Create session for conversation
    const sessionId = await this.createOrResumeSession(
      'conversational-ba',
      `Conversation for ${options.repo}: ${options.conversation}`,
      options
    );

    // Prepare context for conversation
    const context = this.prepareRepositoryContext(options, sessionId, {
      initialInput: options.conversation
    });

    // Start conversation with conversational agent
    const result = await this.conversationalAgent.startConversation(context);

    // Display response
    console.log(chalk.green(`\n🤖 BA Agent (Session: ${result.sessionId}):`));
    console.log(result.response);
    
    if (result.cost > 0) {
      console.log(chalk.yellow(`\n💰 Turn cost: $${result.cost.toFixed(4)}`));
    }

    console.log(chalk.blue(`\n💬 Continue with: npm run ba -- --session=${result.sessionId} "your response"`));
    console.log(chalk.blue(`📋 Finalize with: npm run ba -- --session=${result.sessionId} --finalize`));

    return result;
  }

  /**
   * Continue an existing conversation
   * @param {Object} options - Command options with session and user input
   * @returns {Promise<Object>} Conversation response
   */
  async handleContinueConversation(options) {
    if (!options.userInput && !options.description) {
      throw new Error('Please provide input to continue the conversation');
    }

    const userInput = options.userInput || options.description || '';
    
    console.log(chalk.blue(`💬 Continuing conversation...`));

    // Prepare context for continuation
    const context = {
      sessionId: options.session,
      userInput: userInput,
      verbose: options.verbose
    };

    // Continue conversation
    const result = await this.conversationalAgent.continueConversation(context);

    // Display response
    console.log(chalk.green(`\n🤖 BA Agent (Turn ${result.turnCount}):`));
    console.log(result.response);
    
    console.log(chalk.yellow(`\n💰 Turn cost: $${result.turnCost.toFixed(4)} • Total: $${result.totalCost.toFixed(4)}`));

    if (result.state === 'ready_to_finalize' || result.state === 'proposing') {
      console.log(chalk.blue(`\n✅ Ready to finalize! Use: npm run ba -- --session=${result.sessionId} --finalize`));
    } else {
      console.log(chalk.blue(`\n💬 Continue with: npm run ba -- --session=${result.sessionId} "your response"`));
    }

    return result;
  }

  /**
   * Finalize conversation and create GitHub issues
   * @param {Object} options - Command options with session
   * @returns {Promise<Object>} Finalization result
   */
  async handleFinalize(options) {
    if (!options.session) {
      throw new Error('Session ID is required to finalize conversation. Use --session=<id>');
    }

    console.log(chalk.blue('✅ Finalizing conversation and creating issues...'));

    // Prepare context for finalization
    const context = this.prepareRepositoryContext(options, options.session, {});

    // Finalize conversation
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

    console.log(chalk.yellow(`\n💰 Total conversation cost: $${result.totalCost.toFixed(4)} (${result.conversationTurns} turns)`));
    console.log(chalk.blue(`📋 Session: ${result.sessionId}`));

    return result;
  }

  /**
   * Handle interactive real-time conversation mode (single or multi-agent)
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Interactive session result
   */
  async handleInteractiveMode(options) {
    // Validate repository is provided
    this.validateOptions(options, ['repo']);

    const isMultiAgent = options.multiAgent || false;
    const sessionType = isMultiAgent ? 'multi-agent interactive' : 'interactive BA';
    
    console.log(chalk.blue(`🚀 Starting ${sessionType} session...`));

    // Check if resuming an existing session
    const existingSessionId = options.session;
    
    // Create interactive-enabled conversational BA agent
    const interactiveConversationalAgent = new ConversationalBAAgent(
      this.mcpClientManager, 
      this.sessionService, 
      this.configService.getConfig(),
      {
        multiAgent: isMultiAgent,
        techLeadAgent: isMultiAgent ? this.techLeadAgent : null,
        agentCommunicationService: isMultiAgent ? this.agentCommunicationService : null,
        interactive: true, // Enable interactive mode for full conversation visibility
        verboseCollaboration: options.verbose || false
      }
    );
    
    // Configure options for InteractiveCLI
    const cliOptions = {
      multiAgent: isMultiAgent,
      techLeadAgent: isMultiAgent ? this.techLeadAgent : null,
      agentCommunicationService: isMultiAgent ? this.agentCommunicationService : null
    };

    // Create InteractiveCLI instance with multi-agent support
    const interactiveCLI = new InteractiveCLI(
      interactiveConversationalAgent,
      interactiveConversationalAgent.conversationManager,
      this.sessionService,
      cliOptions
    );

    try {
      // Start interactive session
      await interactiveCLI.start(options.repo, existingSessionId);

      return {
        mode: isMultiAgent ? 'multi-agent-interactive' : 'interactive',
        multiAgent: isMultiAgent,
        repo: options.repo,
        completed: true
      };

    } catch (error) {
      console.error(chalk.red(`❌ Interactive session failed: ${error.message}`));
      throw error;
    }
  }
}