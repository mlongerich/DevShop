import { BaseCommand } from './base-command.js';
import { TechLeadAgent } from '../agents/tech-lead-agent.js';
import { AgentCommunicationService } from '../services/agent-communication-service.js';
import { DocumentService } from '../services/document-service.js';
import chalk from 'chalk';

/**
 * Tech Lead Command
 * Handles tech lead agent workflow and multi-agent collaboration
 */
export class TLCommand extends BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    super(configService, sessionService, mcpClientManager);
    this.agent = new TechLeadAgent(mcpClientManager, sessionService, configService.getConfig());
    this.communicationService = new AgentCommunicationService(this.logDir, sessionService);
    this.documentService = new DocumentService(mcpClientManager, sessionService, configService.getConfig());
  }

  /**
   * Execute Tech Lead workflow
   * @param {Object} options - Command options
   * @param {string} options.repo - Repository name
   * @param {string} [options.description] - Feature description for analysis
   * @param {number} [options.issue] - GitHub issue number to analyze
   * @param {string} [options.session] - Session ID for multi-agent collaboration
   * @param {string} [options.focusArea] - Technical focus area (architecture, performance, security)
   * @param {boolean} [options.generateAdr] - Generate ADR from analysis
   * @param {boolean} [options.collaborate] - Start collaboration with BA agent
   * @param {boolean} [options.verbose] - Verbose output
   * @returns {Promise<Object>} Tech Lead analysis result
   */
  async execute(options) {
    const command = 'tl';
    await this.logCommandStart(command, options);

    try {
      // Validate required options
      this.validateOptions(options, ['repo']);

      // Route to appropriate workflow
      if (options.collaborate) {
        return await this.handleMultiAgentCollaboration(options);
      } else if (options.session) {
        return await this.handleContinueCollaboration(options);
      } else if (options.issue) {
        return await this.handleIssueAnalysis(options);
      } else {
        return await this.handleStandaloneTechAnalysis(options);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Tech Lead Command failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Handle standalone technical analysis
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Analysis result
   */
  async handleStandaloneTechAnalysis(options) {
    console.log(chalk.blue('🏗️ Starting standalone Tech Lead analysis...'));

    // Validate required options for standalone mode
    this.validateOptions(options, ['repo', 'description']);

    // Create session
    const sessionId = await this.createOrResumeSession(
      'tech-lead',
      `Technical analysis for ${options.repo}: ${options.description}`,
      options
    );

    // Prepare context
    const context = this.prepareRepositoryContext(options, sessionId, {
      businessRequirements: options.description, // TL agent expects this field
      featureDescription: options.description,
      taskType: 'standalone_analysis',
      focusArea: options.focusArea,
      // CRITICAL FIX: Pass original user context to TL
      originalUserRequest: options.originalUserRequest,
      isSimplifiedFromBA: options.isSimplifiedFromBA
    });

    // Execute Tech Lead agent
    const result = await this.executeAgent(
      'tech-lead',
      context,
      'tl_analysis_complete',
      'Tech Lead analysis completed',
      {
        repo: options.repo,
        focusArea: options.focusArea
      }
    );

    // Generate ADR if requested or in multi-agent mode
    if (options.generateAdr || options.multiAgent) {
      const adrResult = await this.generateADR(context, result, options.description);
      result.adr = adrResult;
    }

    // Display summary
    const summaryLines = [
      `Architecture decisions: ${result.architecture_decisions?.length || 0}`,
      `Technical risks identified: ${result.technical_risks?.length || 0}`,
      `Technology recommendations: ${result.technology_recommendations?.length || 0}`
    ];
    this.displayBasicSummary('Tech Lead Analysis', sessionId, summaryLines);

    if (options.verbose) {
      console.log(chalk.yellow('\n🏗️ Technical Summary:'));
      console.log(result.summary || 'No summary available');
    }

    return {
      session_id: sessionId,
      ...result
    };
  }

  /**
   * Handle GitHub issue technical analysis
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Analysis result
   */
  async handleIssueAnalysis(options) {
    console.log(chalk.blue(`🎫 Starting Tech Lead analysis for issue #${options.issue}...`));

    // Create session
    const sessionId = await this.createOrResumeSession(
      'tech-lead-issue',
      `Technical analysis for ${options.repo} issue #${options.issue}`,
      options
    );

    // Prepare context
    const context = this.prepareRepositoryContext(options, sessionId, {
      issueNumber: options.issue,
      taskType: 'issue_analysis',
      focusArea: options.focusArea
    });

    // Execute Tech Lead agent
    const result = await this.executeAgent(
      'tech-lead',
      context,
      'tl_issue_analysis_complete',
      'Tech Lead issue analysis completed',
      {
        repo: options.repo,
        issue: options.issue
      }
    );

    // Generate ADR if requested
    if (options.generateAdr) {
      const adrResult = await this.generateADR(context, result, `Issue #${options.issue} Technical Analysis`);
      result.adr = adrResult;
    }

    // Display summary
    const summaryLines = [
      `Issue #${options.issue} analyzed`,
      `Architecture decisions: ${result.architecture_decisions?.length || 0}`,
      `Technical risks: ${result.technical_risks?.length || 0}`
    ];
    this.displayBasicSummary('Tech Lead Issue Analysis', sessionId, summaryLines);

    return {
      session_id: sessionId,
      issue_number: options.issue,
      ...result
    };
  }

  /**
   * Handle multi-agent collaboration with BA
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Collaboration result
   */
  async handleMultiAgentCollaboration(options) {
    console.log(chalk.blue('🤝 Starting BA-TL collaboration...'));

    // Validate collaboration options
    this.validateOptions(options, ['repo']);

    // Create collaboration session
    const sessionId = await this.createOrResumeSession(
      'ba-tl-collaboration',
      `BA-TL collaboration for ${options.repo}`,
      options
    );

    // Initialize communication
    await this.communicationService.initializeCommunication(
      sessionId,
      'tl', // Tech Lead is initiating
      'ba', // Communicating with BA
      {
        repo: options.repo,
        initialRequest: options.description || 'Tech Lead requesting business requirements clarification',
        sessionId
      }
    );

    // Prepare initial message to BA
    const initialMessage = options.description ?
      `I need business requirements clarification for: ${options.description}` :
      'I\'m starting technical analysis and need business context and requirements.';

    // Send initial message to BA (simulated - in real implementation this would trigger BA agent)
    const messageResult = await this.communicationService.sendMessage(
      sessionId,
      'tl',
      'ba',
      'question',
      initialMessage,
      { 
        repo: options.repo,
        cost: 0 // Will be updated when actual LLM calls are made
      }
    );

    console.log(chalk.green('🤝 Collaboration session initialized'));
    console.log(chalk.blue(`Continue collaboration with: npm run ba -- --session=${sessionId}`));
    console.log(chalk.blue(`Monitor communication: npm run logs --session=${sessionId} --verbose`));

    return {
      session_id: sessionId,
      collaboration_status: 'initialized',
      initial_message: initialMessage,
      exchange_count: messageResult.exchangeCount,
      max_exchanges: messageResult.maxExchanges,
      next_speaker: 'ba'
    };
  }

  /**
   * Handle continuing existing collaboration
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Collaboration continuation result
   */
  async handleContinueCollaboration(options) {
    if (!options.userInput && !options.description) {
      throw new Error('Please provide input to continue the collaboration');
    }

    const userInput = options.userInput || options.description || '';
    
    console.log(chalk.blue('🤝 Continuing BA-TL collaboration...'));

    // Check if communication session exists
    const exists = await this.communicationService.communicationExists(options.session);
    if (!exists) {
      throw new Error(`Collaboration session ${options.session} not found. Start new collaboration with --collaborate`);
    }

    // Get communication context
    const communication = await this.communicationService.getCommunication(options.session);

    // Process the message and generate Tech Lead response
    const responseResult = await this.processCollaborationMessage(options.session, userInput, communication);

    // Display response
    console.log(chalk.green(`\n🏗️ Tech Lead Response:`));
    console.log(responseResult.response);

    console.log(chalk.yellow(`\n💰 Collaboration cost: $${responseResult.cost?.toFixed(4) || '0.0000'}`));

    // Check collaboration status
    if (responseResult.escalated) {
      console.log(chalk.red('🔺 Collaboration escalated to user - manual intervention required'));
    } else if (responseResult.completed) {
      console.log(chalk.green('✅ Collaboration completed successfully'));
      
      // Generate ADR if requested or in collaboration mode  
      if ((options.generateAdr || options.collaborate) && responseResult.finalAnalysis) {
        const context = this.prepareRepositoryContext(options, options.session, {});
        const adrResult = await this.generateADR(context, responseResult.finalAnalysis, 'BA-TL Collaboration Results');
        responseResult.adr = adrResult;
      }
    } else {
      console.log(chalk.blue(`🤝 Continue with: npm run ba -- --session=${options.session} "your response"`));
    }

    return responseResult;
  }

  /**
   * Process collaboration message and generate Tech Lead response
   * @param {string} sessionId - Session ID
   * @param {string} userInput - Input message
   * @param {Object} communication - Communication context
   * @returns {Promise<Object>} Processing result
   */
  async processCollaborationMessage(sessionId, userInput, communication) {
    try {
      // Prepare context for Tech Lead analysis
      const context = {
        sessionId,
        repoOwner: communication.context?.repo?.split('/')[0],
        repoName: communication.context?.repo?.split('/')[1],
        businessRequirements: userInput,
        collaborationContext: communication,
        verbose: true
      };

      const enhancedContext = this.agent.ensureContextMethods(context);

      // Generate Tech Lead response based on BA input
      const analysisResult = await this.agent.execute(enhancedContext);

      // Send response back to BA
      await this.communicationService.processMessage(
        sessionId,
        'tl',
        analysisResult.summary || 'Technical analysis completed',
        {
          cost: analysisResult.cost || 0,
          analysisResult
        }
      );

      // Check if we should complete or escalate
      const commStats = await this.communicationService.getCommunicationStats(sessionId);
      
      if (commStats.utilizationPercent >= 80) {
        // Approaching limit, try to complete
        await this.communicationService.completeCommunication(
          sessionId,
          'Analysis complete - exchange limit approaching',
          analysisResult
        );
        
        return {
          response: analysisResult.summary,
          cost: analysisResult.cost || 0,
          completed: true,
          finalAnalysis: analysisResult,
          exchangeCount: commStats.totalExchanges
        };
      }

      return {
        response: analysisResult.summary,
        cost: analysisResult.cost || 0,
        completed: false,
        escalated: false,
        exchangeCount: commStats.totalExchanges,
        maxExchanges: commStats.exchangeLimit
      };

    } catch (error) {
      console.error(chalk.red(`❌ Collaboration processing failed: ${error.message}`));
      
      // Escalate on error
      await this.communicationService.escalateToUser(sessionId, `Processing error: ${error.message}`);
      
      return {
        response: `Error processing collaboration: ${error.message}`,
        cost: 0,
        completed: false,
        escalated: true,
        error: error.message
      };
    }
  }

  /**
   * Generate ADR from technical analysis
   * @param {Object} context - Enhanced context
   * @param {Object} analysisResult - Tech Lead analysis result
   * @param {string} title - ADR title
   * @returns {Promise<Object>} ADR generation result
   */
  async generateADR(context, analysisResult, title) {
    console.log(chalk.blue('📄 Generating Architectural Decision Record...'));

    try {
      const adrResult = await this.documentService.generateADRWithVerification(
        title,
        analysisResult,
        context
      );

      if (adrResult.success && adrResult.verified) {
        console.log(chalk.green(`✅ ADR generated and verified: ${adrResult.fileName}`));
      } else if (adrResult.success && !adrResult.verified) {
        console.log(chalk.yellow(`⚠️ ADR generated but verification failed: ${adrResult.error}`));
        console.log(chalk.gray('Document may not actually exist in repository'));
      } else {
        console.log(chalk.yellow(`⚠️ ADR could not be stored in repository: ${adrResult.error}`));
        console.log(chalk.gray('ADR content generated but not committed to repository'));
      }

      return adrResult;

    } catch (error) {
      console.error(chalk.red(`❌ ADR generation failed: ${error.message}`));
      return {
        success: false,
        error: error.message,
        type: 'ADR',
        title
      };
    }
  }

  /**
   * Display collaboration status
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async displayCollaborationStatus(sessionId) {
    try {
      const summary = await this.communicationService.getCommunicationSummary(sessionId);
      const history = await this.communicationService.formatCommunicationHistory(sessionId, false);

      console.log(chalk.blue('\n🤝 Collaboration Status:'));
      console.log(chalk.white('  Status: '), chalk.cyan(summary.status));
      console.log(chalk.white('  Exchanges: '), chalk.yellow(`${summary.exchangeCount}/${summary.maxExchanges}`));
      console.log(chalk.white('  Total Cost: '), chalk.green(`$${summary.totalCost.toFixed(4)}`));
      
      if (summary.averageResponseTime > 0) {
        console.log(chalk.white('  Avg Response: '), chalk.gray(`${summary.averageResponseTime}ms`));
      }

      console.log(history);

    } catch (error) {
      console.log(chalk.red('❌ Could not load collaboration status'));
    }
  }
}