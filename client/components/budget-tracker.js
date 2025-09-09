/**
 * BudgetTracker - Extracted from InteractiveCLI
 * Handles token and cost budget management with extensions and warnings
 */
export class BudgetTracker {
  constructor(options = {}) {
    // Initialize with existing InteractiveCLI logic
    this.sessionTokensUsed = 0;
    this.sessionCostUsed = 0;
    
    // Priority: options > environment > defaults
    this.maxTokensPerSession = options.maxTokens || parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000;
    this.maxCostPerSession = options.maxCost || parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00;
    this.warningThreshold = options.warningThreshold || 0.8; // Warn when 80% of limit reached
    this.extensions = []; // Track token limit extensions
    
    // Store original limits for reset functionality
    this.originalMaxTokens = this.maxTokensPerSession;
    this.originalMaxCost = this.maxCostPerSession;
  }

  /**
   * Update token budget tracking (existing InteractiveCLI.updateTokenBudget logic)
   * @param {number} tokens - Number of tokens used
   * @param {number} cost - Cost incurred
   */
  updateUsage(tokens, cost) {
    this.sessionTokensUsed += tokens;
    this.sessionCostUsed += cost;
  }

  /**
   * Check if approaching token limit (existing InteractiveCLI.isApproachingTokenLimit logic)
   * @returns {boolean} True if approaching limit
   */
  isApproachingTokenLimit() {
    return (this.sessionTokensUsed / this.maxTokensPerSession) >= this.warningThreshold;
  }

  /**
   * Check if approaching cost limit (existing InteractiveCLI.isApproachingCostLimit logic)
   * @returns {boolean} True if approaching limit
   */
  isApproachingCostLimit() {
    return (this.sessionCostUsed / this.maxCostPerSession) >= this.warningThreshold;
  }

  /**
   * Check if token limit exceeded
   * @returns {boolean} True if limit exceeded
   */
  isTokenLimitExceeded() {
    return this.sessionTokensUsed >= this.maxTokensPerSession;
  }

  /**
   * Check if cost limit exceeded
   * @returns {boolean} True if limit exceeded
   */
  isCostLimitExceeded() {
    return this.sessionCostUsed >= this.maxCostPerSession;
  }

  /**
   * Get token utilization percentage (existing InteractiveCLI.getTokenUtilization logic)
   * @returns {number} Utilization percentage (0-1)
   */
  getTokenUtilization() {
    return this.sessionTokensUsed / this.maxTokensPerSession;
  }

  /**
   * Get cost utilization percentage (existing InteractiveCLI.getCostUtilization logic)
   * @returns {number} Utilization percentage (0-1)
   */
  getCostUtilization() {
    return this.sessionCostUsed / this.maxCostPerSession;
  }

  /**
   * Add budget extension (similar to existing InteractiveCLI extension logic)
   * @param {number} additionalTokens - Additional tokens to allow
   * @param {number} additionalCost - Additional cost to allow
   * @param {string} reason - Reason for extension
   */
  addExtension(additionalTokens, additionalCost, reason = 'Budget extension') {
    const extension = {
      tokens: additionalTokens,
      cost: additionalCost,
      reason,
      timestamp: new Date().toISOString()
    };
    
    this.extensions.push(extension);
    this.maxTokensPerSession += additionalTokens;
    this.maxCostPerSession += additionalCost;
  }

  /**
   * Get comprehensive budget status
   * @returns {Object} Budget status information
   */
  getStatus() {
    return {
      tokensUsed: this.sessionTokensUsed,
      costUsed: this.sessionCostUsed,
      maxTokens: this.maxTokensPerSession,
      maxCost: this.maxCostPerSession,
      tokenUtilization: this.getTokenUtilization(),
      costUtilization: this.getCostUtilization(),
      isApproachingTokenLimit: this.isApproachingTokenLimit(),
      isApproachingCostLimit: this.isApproachingCostLimit(),
      isTokenLimitExceeded: this.isTokenLimitExceeded(),
      isCostLimitExceeded: this.isCostLimitExceeded(),
      extensionsCount: this.extensions.length,
      warningThreshold: this.warningThreshold
    };
  }

  /**
   * Reset usage counters to zero
   */
  resetUsage() {
    this.sessionTokensUsed = 0;
    this.sessionCostUsed = 0;
  }

  /**
   * Clear all extensions and reset to original limits
   */
  clearExtensions() {
    this.extensions = [];
    this.maxTokensPerSession = this.originalMaxTokens;
    this.maxCostPerSession = this.originalMaxCost;
  }

  /**
   * Load budget state from conversation context (used in InteractiveCLI)
   * @param {Object} conversationContext - Context with tokenBudget data
   */
  loadFromConversationContext(conversationContext) {
    if (conversationContext.tokenBudget) {
      this.sessionTokensUsed = conversationContext.tokenBudget.sessionTokensUsed || 0;
      this.sessionCostUsed = conversationContext.tokenBudget.sessionCostUsed || 0;
      this.extensions = conversationContext.tokenBudget.extensions || [];
      
      // Recalculate max limits based on extensions
      this.maxTokensPerSession = this.originalMaxTokens;
      this.maxCostPerSession = this.originalMaxCost;
      
      this.extensions.forEach(ext => {
        this.maxTokensPerSession += ext.tokens;
        this.maxCostPerSession += ext.cost;
      });
    }
  }

  /**
   * Export current state for persistence
   * @returns {Object} Serializable budget state
   */
  exportState() {
    return {
      sessionTokensUsed: this.sessionTokensUsed,
      sessionCostUsed: this.sessionCostUsed,
      maxTokensPerSession: this.maxTokensPerSession,
      maxCostPerSession: this.maxCostPerSession,
      extensions: this.extensions,
      warningThreshold: this.warningThreshold,
      originalMaxTokens: this.originalMaxTokens,
      originalMaxCost: this.originalMaxCost
    };
  }
}