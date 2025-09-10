import chalk from 'chalk';

/**
 * Base Command
 * Abstract base class for all CLI commands using the Command pattern
 */
export class BaseCommand {
  constructor(configService, sessionService, mcpClientManager) {
    this.configService = configService;
    this.sessionService = sessionService;
    this.mcpClientManager = mcpClientManager;
  }

  /**
   * Execute the command
   * @param {Object} options - Command options from CLI
   * @returns {Promise<*>} Command result
   */
  async execute(options) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate required options for the command
   * @param {Object} options - Options to validate
   * @param {Array<string>} required - Required option names
   */
  validateOptions(options, required) {
    const missing = required.filter(opt => !options[opt]);
    if (missing.length > 0) {
      throw new Error(`Missing required options: ${missing.join(', ')}`);
    }
  }

  /**
   * Log command execution
   * @param {string} command - Command name
   * @param {Object} options - Command options
   */
  async logCommandStart(command, options) {
    await this.sessionService.logInteraction('command_start', `Starting ${command} command`, {
      command,
      options: this.sanitizeOptions(options)
    });
  }

  /**
   * Log command completion
   * @param {string} command - Command name
   * @param {*} result - Command result
   */
  async logCommandEnd(command, result) {
    await this.sessionService.logInteraction('command_end', `Completed ${command} command`, {
      command,
      success: true,
      result_summary: typeof result === 'object' ? Object.keys(result) : result
    });
  }

  /**
   * Log command error
   * @param {string} command - Command name
   * @param {Error} error - Error that occurred
   */
  async logCommandError(command, error) {
    await this.sessionService.logError(error, {
      command,
      error_type: 'command_execution_error'
    });
  }

  /**
   * Remove sensitive information from options for logging
   * @param {Object} options - Original options
   * @returns {Object} Sanitized options
   */
  sanitizeOptions(options) {
    const sanitized = { ...options };
    const sensitiveKeys = ['token', 'key', 'password', 'secret'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Create or resume session for agent commands
   * @param {string} agentType - Type of agent (ba, developer, etc.)
   * @param {string} sessionContext - Description of the session
   * @param {Object} options - Command options
   * @returns {Promise<string>} Session ID
   */
  async createOrResumeSession(agentType, sessionContext, options) {
    const sessionId = options.session || 
      await this.sessionService.createSession(agentType, sessionContext);
    
    this.sessionService.setActiveSession(sessionId);
    return sessionId;
  }

  /**
   * Prepare repository context for agent commands
   * @param {Object} options - Command options with repo field
   * @param {string} sessionId - Session ID
   * @param {Object} additionalFields - Additional command-specific fields
   * @returns {Object} Prepared context object
   */
  prepareRepositoryContext(options, sessionId, additionalFields = {}) {
    if (!options.repo) {
      throw new Error('Repository option is required');
    }

    const [repoOwner, repoName] = options.repo.split('/');
    if (!repoOwner || !repoName) {
      throw new Error('Repository must be in format owner/repo-name');
    }

    // Log repository targeting for verification
    console.log(`🎯 Repository context prepared: ${repoOwner}/${repoName} (session: ${sessionId})`);

    return {
      sessionId,
      repoOwner,
      repoName,
      verbose: options.verbose || false,
      getRepository: () => `${repoOwner}/${repoName}`,
      ...additionalFields
    };
  }

  /**
   * Execute agent with standardized logging and error handling
   * @param {string} commandName - Command name for logging
   * @param {Object} context - Context to pass to agent
   * @param {string} completionLogType - Type for completion log interaction
   * @param {string} completionMessage - Message for completion log
   * @param {Object} completionMetadata - Additional metadata for completion log
   * @returns {Promise<Object>} Agent result
   */
  async executeAgent(commandName, context, completionLogType, completionMessage, completionMetadata = {}) {
    // Execute agent
    const result = await this.agent.execute(context);

    // Log completion interaction
    await this.sessionService.logInteraction(completionLogType, completionMessage, {
      ...completionMetadata,
      session_id: context.sessionId
    });

    // Log command completion
    await this.logCommandEnd(commandName, result);

    return result;
  }

  /**
   * Display basic command completion summary
   * @param {string} workType - Type of work completed (e.g., "Business Analysis", "Development Work")
   * @param {string} sessionId - Session ID
   * @param {Array<string>} additionalLines - Additional summary lines to display
   */
  displayBasicSummary(workType, sessionId, additionalLines = []) {
    console.log(chalk.green(`\n✅ ${workType} Complete`));
    console.log(chalk.gray(`Session ID: ${sessionId}`));
    
    for (const line of additionalLines) {
      console.log(chalk.gray(line));
    }
  }
}