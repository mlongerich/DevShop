/**
 * Command for handling usage statistics requests
 * Implements the Command pattern to encapsulate usage tracking logic
 */
export class UsageCommand {
  constructor(providerManager) {
    this.providerManager = providerManager;
  }

  /**
   * Execute usage command
   * @param {Object} args - Command arguments
   * @returns {Promise<Object>} Formatted response
   */
  async execute(args) {
    const { session_id, reset = false, provider_name } = args;

    try {
      let usage;

      if (provider_name) {
        // Get usage for specific provider
        const provider = this.providerManager.getProviderByName(provider_name);
        if (!provider) {
          throw new Error(`Provider '${provider_name}' not found`);
        }
        usage = provider.getUsage(session_id);
      } else if (session_id) {
        // Get usage for specific session across all providers
        usage = await this.getSessionUsage(session_id);
      } else {
        // Get global usage across all providers
        usage = await this.getGlobalUsage();
      }

      // Reset if requested
      if (reset) {
        await this.resetUsage(session_id, provider_name);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(usage, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Usage command failed: ${error.message}`);
    }
  }

  /**
   * Get usage for a specific session across all providers
   * @param {string} sessionId - Session identifier
   * @returns {Object} Combined session usage
   */
  async getSessionUsage(sessionId) {
    const providers = this.providerManager.getAllProviders();
    const sessionUsage = {
      session_id: sessionId,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0,
      providers: {},
      timestamp: new Date().toISOString()
    };

    for (const [name, provider] of providers.entries()) {
      const providerUsage = provider.getUsage(sessionId);
      if (providerUsage && !providerUsage.error) {
        sessionUsage.total_tokens += providerUsage.total_tokens || 0;
        sessionUsage.prompt_tokens += providerUsage.prompt_tokens || 0;
        sessionUsage.completion_tokens += providerUsage.completion_tokens || 0;
        sessionUsage.total_cost += providerUsage.total_cost || 0;
        
        sessionUsage.providers[name] = providerUsage;
      }
    }

    return sessionUsage;
  }

  /**
   * Get global usage across all providers
   * @returns {Object} Combined global usage
   */
  async getGlobalUsage() {
    const providers = this.providerManager.getAllProviders();
    const globalUsage = {
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0,
      providers: {},
      session_count: 0,
      active_providers: providers.size,
      timestamp: new Date().toISOString()
    };

    const allSessions = new Set();

    for (const [name, provider] of providers.entries()) {
      const providerUsage = provider.getUsage();
      
      globalUsage.total_tokens += providerUsage.total_tokens || 0;
      globalUsage.prompt_tokens += providerUsage.prompt_tokens || 0;
      globalUsage.completion_tokens += providerUsage.completion_tokens || 0;
      globalUsage.total_cost += providerUsage.total_cost || 0;
      
      globalUsage.providers[name] = providerUsage;
      
      // Collect unique session IDs
      if (providerUsage.sessions) {
        providerUsage.sessions.forEach(sessionId => allSessions.add(sessionId));
      }
    }

    globalUsage.session_count = allSessions.size;
    globalUsage.sessions = Array.from(allSessions);

    return globalUsage;
  }

  /**
   * Reset usage statistics
   * @param {string} sessionId - Session to reset, or null for all
   * @param {string} providerName - Provider to reset, or null for all
   */
  async resetUsage(sessionId, providerName) {
    if (providerName) {
      const provider = this.providerManager.getProviderByName(providerName);
      if (provider) {
        provider.resetUsage(sessionId);
      }
    } else {
      const providers = this.providerManager.getAllProviders();
      for (const provider of providers.values()) {
        provider.resetUsage(sessionId);
      }
    }
  }

  /**
   * Get command name
   * @returns {string} Command name
   */
  getName() {
    return 'llm_get_usage';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  getDescription() {
    return 'Get current token usage and cost statistics';
  }

  /**
   * Get command input schema
   * @returns {Object} JSON schema for command inputs
   */
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Get usage for specific session' },
        reset: { type: 'boolean', description: 'Reset counters after getting stats', default: false },
        provider_name: { type: 'string', description: 'Get usage for specific provider only' }
      }
    };
  }
}