/**
 * Base agent interface for DevShop AI agents
 * Defines the contract that all agent implementations must follow
 */
export class BaseAgent {
  constructor(mcpClientManager, sessionService) {
    if (this.constructor === BaseAgent) {
      throw new Error('BaseAgent is an abstract class and cannot be instantiated directly');
    }
    this.mcpClientManager = mcpClientManager;
    this.sessionService = sessionService;
  }

  /**
   * Get the agent name/type
   * @returns {string} Agent name
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  /**
   * Get the agent description
   * @returns {string} Agent description
   */
  getDescription() {
    throw new Error('getDescription() must be implemented by subclass');
  }

  /**
   * Execute the agent's main workflow
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate the execution context
   * @param {Object} context - Context to validate
   * @returns {boolean} True if context is valid
   */
  validateContext(context) {
    throw new Error('validateContext() must be implemented by subclass');
  }

  /**
   * Get required context parameters
   * @returns {Array<string>} Array of required parameter names
   */
  getRequiredContextParams() {
    throw new Error('getRequiredContextParams() must be implemented by subclass');
  }

  /**
   * Common helper method for making MCP tool calls
   * @param {string} serverName - MCP server name
   * @param {string} toolName - Tool name to call
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool call result
   */
  async callMCPTool(serverName, toolName, args) {
    if (!this.mcpClientManager) {
      throw new Error('MCP client manager not available');
    }
    return await this.mcpClientManager.callTool(serverName, toolName, args);
  }

  /**
   * Common helper method for logging interactions
   * @param {string} type - Interaction type
   * @param {string} content - Interaction content
   * @param {Object} metadata - Additional metadata
   */
  async logInteraction(type, content, metadata = {}) {
    if (!this.sessionService) {
      console.warn('Session service not available for logging');
      return;
    }
    await this.sessionService.logInteraction(type, content, {
      ...metadata,
      agent: this.getName()
    });
  }

  /**
   * Common helper method for error logging
   * @param {Error} error - Error to log
   * @param {Object} context - Error context
   */
  async logError(error, context = {}) {
    if (!this.sessionService) {
      console.error('Error:', error.message);
      return;
    }
    await this.sessionService.logError(error, {
      ...context,
      agent: this.getName()
    });
  }
}

/**
 * Common execution context structure
 */
export class AgentContext {
  constructor({ sessionId, repoOwner, repoName, ...additionalParams }) {
    this.sessionId = sessionId;
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    this.startTime = new Date().toISOString();
    
    // Add any additional parameters
    Object.assign(this, additionalParams);
  }

  validate(requiredParams = []) {
    const missing = [];
    
    for (const param of requiredParams) {
      if (this[param] === undefined || this[param] === null) {
        missing.push(param);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required context parameters: ${missing.join(', ')}`);
    }

    return true;
  }

  getRepository() {
    if (!this.repoOwner || !this.repoName) {
      throw new Error('Repository information not available in context');
    }
    return `${this.repoOwner}/${this.repoName}`;
  }
}

/**
 * Common agent result structure
 */
export class AgentResult {
  constructor(success = false, data = null, message = '') {
    this.success = success;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }

  static success(data, message = 'Operation completed successfully') {
    return new AgentResult(true, data, message);
  }

  static error(message, data = null) {
    return new AgentResult(false, data, message);
  }
}