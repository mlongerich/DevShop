/**
 * Command for checking usage limits
 * Implements the Command pattern to encapsulate limit checking logic
 */
export class LimitsCommand {
  constructor(providerManager) {
    this.providerManager = providerManager;
  }

  /**
   * Execute limits command
   * @param {Object} args - Command arguments
   * @returns {Promise<Object>} Formatted response
   */
  async execute(args) {
    const {
      max_tokens,
      max_cost,
      session_id,
      provider_name
    } = args;

    try {
      const limits = {};
      if (max_tokens !== undefined) limits.maxTokens = max_tokens;
      if (max_cost !== undefined) limits.maxCost = max_cost;

      let result;

      if (provider_name) {
        // Check limits for specific provider
        const provider = this.providerManager.getProviderByName(provider_name);
        if (!provider) {
          throw new Error(`Provider '${provider_name}' not found`);
        }
        result = provider.checkLimits(limits, session_id);
      } else {
        // Check limits across all providers
        result = await this.checkLimitsAcrossProviders(limits, session_id);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Limits check failed: ${error.message}`);
    }
  }

  /**
   * Check limits across all providers
   * @param {Object} limits - Limit specifications
   * @param {string} sessionId - Session identifier
   * @returns {Object} Combined limit check results
   */
  async checkLimitsAcrossProviders(limits, sessionId) {
    const providers = this.providerManager.getAllProviders();
    const results = {
      within_limits: true,
      global_checks: [],
      provider_checks: {},
      timestamp: new Date().toISOString()
    };

    // Collect usage from all providers
    let totalUsage = {
      total_tokens: 0,
      total_cost: 0
    };

    const providerResults = [];

    for (const [name, provider] of providers.entries()) {
      const providerResult = provider.checkLimits(limits, sessionId);
      providerResults.push({ name, result: providerResult });
      
      results.provider_checks[name] = providerResult;
      
      if (!providerResult.within_limits) {
        results.within_limits = false;
      }

      // Add to total usage
      const usage = sessionId ? 
        provider.getUsage(sessionId) :
        provider.getUsage();
      
      if (usage && !usage.error) {
        totalUsage.total_tokens += usage.total_tokens || 0;
        totalUsage.total_cost += usage.total_cost || 0;
      }
    }

    // Perform global limit checks
    if (limits.maxTokens !== undefined) {
      const tokenCheck = {
        type: 'tokens',
        limit: limits.maxTokens,
        current: totalUsage.total_tokens,
        within_limit: totalUsage.total_tokens <= limits.maxTokens,
        percentage: (totalUsage.total_tokens / limits.maxTokens) * 100
      };
      
      results.global_checks.push(tokenCheck);
      if (!tokenCheck.within_limit) {
        results.within_limits = false;
      }
    }

    if (limits.maxCost !== undefined) {
      const costCheck = {
        type: 'cost',
        limit: limits.maxCost,
        current: totalUsage.total_cost,
        within_limit: totalUsage.total_cost <= limits.maxCost,
        percentage: (totalUsage.total_cost / limits.maxCost) * 100
      };
      
      results.global_checks.push(costCheck);
      if (!costCheck.within_limit) {
        results.within_limits = false;
      }
    }

    // Add summary information
    results.summary = {
      total_providers: providers.size,
      providers_within_limits: providerResults.filter(p => p.result.within_limits).length,
      global_usage: totalUsage,
      session_id: sessionId || 'global'
    };

    return results;
  }

  /**
   * Get recommended actions based on limit violations
   * @param {Object} limitResults - Results from limit checks
   * @returns {Array} Array of recommended actions
   */
  getRecommendedActions(limitResults) {
    const actions = [];

    if (!limitResults.within_limits) {
      for (const check of limitResults.global_checks || []) {
        if (!check.within_limit) {
          if (check.type === 'tokens') {
            actions.push({
              type: 'token_limit_exceeded',
              message: `Token usage (${check.current}) exceeds limit (${check.limit})`,
              recommendations: [
                'Reduce max_tokens parameter in requests',
                'Use more efficient models (e.g., gpt-5-nano instead of gpt-5)',
                'Implement request batching',
                'Clear old sessions if no longer needed'
              ]
            });
          } else if (check.type === 'cost') {
            actions.push({
              type: 'cost_limit_exceeded',
              message: `Cost ($${check.current.toFixed(4)}) exceeds limit ($${check.limit})`,
              recommendations: [
                'Switch to cheaper models',
                'Reduce request frequency',
                'Optimize prompt lengths',
                'Set stricter max_tokens limits'
              ]
            });
          }
        }
      }
    }

    return actions;
  }

  /**
   * Get command name
   * @returns {string} Command name
   */
  getName() {
    return 'llm_check_limits';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  getDescription() {
    return 'Check if usage is within specified limits';
  }

  /**
   * Get command input schema
   * @returns {Object} JSON schema for command inputs
   */
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        max_tokens: { type: 'number', description: 'Maximum tokens allowed' },
        max_cost: { type: 'number', description: 'Maximum cost allowed (USD)' },
        session_id: { type: 'string', description: 'Check limits for specific session' },
        provider_name: { type: 'string', description: 'Check limits for specific provider only' }
      },
      required: []
    };
  }
}