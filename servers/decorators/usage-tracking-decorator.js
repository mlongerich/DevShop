import { ModelPricingConfig } from '../config/model-pricing-config.js';

/**
 * Decorator that wraps providers to add usage tracking functionality
 * Implements the Decorator pattern to add behavior without modifying the original provider
 */
export class UsageTrackingDecorator {
  constructor(provider, pricingConfig = new ModelPricingConfig()) {
    this.provider = provider;
    this.pricingConfig = pricingConfig;
    
    // Initialize usage tracking
    this.usage = {
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0,
      sessions: {} // Track usage per session
    };
  }

  // Delegate provider methods
  getProviderName() {
    return this.provider.getProviderName();
  }

  supportsModel(model) {
    return this.provider.supportsModel(model);
  }

  mapModelName(model) {
    return this.provider.mapModelName(model);
  }

  async validateApiKey() {
    return await this.provider.validateApiKey();
  }

  async listModels() {
    return await this.provider.listModels();
  }

  /**
   * Chat completion with usage tracking
   * @param {Object} request - Chat completion request
   * @param {string} [sessionId] - Session identifier for tracking
   * @returns {Promise<Object>} Response with enhanced usage information
   */
  async chatCompletion(request, sessionId = 'default') {
    // Call the underlying provider
    const response = await this.provider.chatCompletion(request);
    
    // Calculate cost using our pricing repository
    const cost = this.pricingConfig.calculateCost(
      request.model,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    // Update total usage
    this.updateUsage(response.usage, request.model, cost, sessionId);

    // Enhance response with cost and provider information
    return {
      ...response,
      usage: {
        ...response.usage,
        cost,
        model: request.model,
        provider: this.getProviderName()
      }
    };
  }

  /**
   * Update usage statistics
   * @param {Object} usage - Usage data from provider response
   * @param {string} model - Model used
   * @param {number} cost - Calculated cost
   * @param {string} sessionId - Session identifier
   */
  updateUsage(usage, model, cost, sessionId) {
    // Update global totals
    this.usage.total_tokens += usage.total_tokens || 0;
    this.usage.prompt_tokens += usage.prompt_tokens || 0;
    this.usage.completion_tokens += usage.completion_tokens || 0;
    this.usage.total_cost += cost;

    // Initialize session if it doesn't exist
    if (!this.usage.sessions[sessionId]) {
      this.usage.sessions[sessionId] = {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: 0,
        models_used: new Set(),
        requests: 0,
        started_at: new Date().toISOString()
      };
    }

    // Update session totals
    const session = this.usage.sessions[sessionId];
    session.total_tokens += usage.total_tokens || 0;
    session.prompt_tokens += usage.prompt_tokens || 0;
    session.completion_tokens += usage.completion_tokens || 0;
    session.total_cost += cost;
    session.models_used.add(model);
    session.requests += 1;
    session.last_request_at = new Date().toISOString();
  }

  /**
   * Get current usage statistics
   * @param {string} [sessionId] - Get usage for specific session
   * @returns {Object} Usage statistics
   */
  getUsage(sessionId) {
    if (sessionId) {
      const sessionUsage = this.usage.sessions[sessionId];
      if (!sessionUsage) {
        return {
          session_id: sessionId,
          total_tokens: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_cost: 0,
          models_used: [],
          requests: 0,
          error: 'Session not found'
        };
      }

      return {
        session_id: sessionId,
        ...sessionUsage,
        models_used: Array.from(sessionUsage.models_used),
        provider: this.getProviderName(),
        timestamp: new Date().toISOString()
      };
    }

    // Return global usage
    return {
      ...this.usage,
      sessions: Object.keys(this.usage.sessions),
      provider: this.getProviderName(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset usage statistics
   * @param {string} [sessionId] - Reset specific session, or all if not provided
   */
  resetUsage(sessionId) {
    if (sessionId) {
      delete this.usage.sessions[sessionId];
    } else {
      this.usage = {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: 0,
        sessions: {}
      };
    }
  }

  /**
   * Check if usage is within specified limits
   * @param {Object} limits - Limit specifications
   * @param {number} [limits.maxTokens] - Maximum tokens allowed
   * @param {number} [limits.maxCost] - Maximum cost allowed (USD)
   * @param {string} [sessionId] - Check limits for specific session
   * @returns {Object} Limit check results
   */
  checkLimits(limits, sessionId) {
    const usage = sessionId ? 
      this.usage.sessions[sessionId] || { total_tokens: 0, total_cost: 0 } :
      this.usage;

    const results = {
      within_limits: true,
      checks: [],
      current_usage: sessionId ? this.getUsage(sessionId) : this.getUsage()
    };

    if (limits.maxTokens !== undefined) {
      const tokenCheck = {
        type: 'tokens',
        limit: limits.maxTokens,
        current: usage.total_tokens,
        within_limit: usage.total_tokens <= limits.maxTokens,
        percentage: (usage.total_tokens / limits.maxTokens) * 100
      };
      
      results.checks.push(tokenCheck);
      if (!tokenCheck.within_limit) {
        results.within_limits = false;
      }
    }

    if (limits.maxCost !== undefined) {
      const costCheck = {
        type: 'cost',
        limit: limits.maxCost,
        current: usage.total_cost,
        within_limit: usage.total_cost <= limits.maxCost,
        percentage: (usage.total_cost / limits.maxCost) * 100
      };
      
      results.checks.push(costCheck);
      if (!costCheck.within_limit) {
        results.within_limits = false;
      }
    }

    return results;
  }

  /**
   * Get usage summary for all sessions
   * @returns {Object} Summary of all session usage
   */
  getUsageSummary() {
    const sessions = Object.entries(this.usage.sessions).map(([id, session]) => ({
      session_id: id,
      total_cost: session.total_cost,
      total_tokens: session.total_tokens,
      requests: session.requests,
      models_used: Array.from(session.models_used),
      started_at: session.started_at,
      last_request_at: session.last_request_at
    }));

    return {
      provider: this.getProviderName(),
      global_usage: {
        total_tokens: this.usage.total_tokens,
        prompt_tokens: this.usage.prompt_tokens,
        completion_tokens: this.usage.completion_tokens,
        total_cost: this.usage.total_cost
      },
      session_count: sessions.length,
      sessions: sessions.sort((a, b) => new Date(b.last_request_at) - new Date(a.last_request_at)),
      timestamp: new Date().toISOString()
    };
  }
}