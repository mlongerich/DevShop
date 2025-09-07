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
}