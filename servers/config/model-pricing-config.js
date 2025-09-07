/**
 * Configuration manager for model pricing information
 * Manages pricing data and provides utility methods for cost calculations
 */
export class ModelPricingConfig {
  constructor() {
    // Pricing per 1K tokens (converted from per 1M tokens)
    this.pricing = {
      // OpenAI GPT-5 Series (2025)
      'gpt-5': { input: 0.00125, output: 0.01 },           // $1.25/$10.00 per 1M tokens
      'gpt-5-mini': { input: 0.00025, output: 0.002 },     // $0.25/$2.00 per 1M tokens
      'gpt-5-nano': { input: 0.00005, output: 0.0004 },    // $0.05/$0.40 per 1M tokens
      'gpt-5-chat-latest': { input: 0.00125, output: 0.01 },
      'gpt-5-pro': { input: 0.00125, output: 0.01 },
      'gpt-5-turbo': { input: 0.00125, output: 0.01 },

      // OpenAI GPT-4 Series (Legacy)
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },

      // OpenAI o1 Series
      'o1-preview': { input: 0.015, output: 0.06 },
      'o1-mini': { input: 0.003, output: 0.012 },

      // Anthropic Claude Series
      'claude-4.1-opus': { input: 0.015, output: 0.075 },    // $15/$75 per 1M tokens
      'claude-4-sonnet': { input: 0.003, output: 0.015 },    // $3/$15 per 1M tokens (≤200K)
      'claude-3.5-haiku': { input: 0.0008, output: 0.004 },  // $0.80/$4 per 1M tokens
      'claude-3-haiku': { input: 0.00025, output: 0.00125 }, // $0.25/$1.25 per 1M tokens
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },

      // Google Gemini Series
      'gemini-2.5-pro': { input: 0.00125, output: 0.01 },     // $1.25/$10 per 1M tokens (≤200K)
      'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },  // $0.30/$2.50 per 1M tokens
      'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 }, // $0.10/$0.40 per 1M tokens
      'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
      'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
      'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },

      // Default fallback
      'default': { input: 0.001, output: 0.002 }
    };
  }

  /**
   * Get pricing for a specific model
   * @param {string} model - Model name
   * @returns {Object} Pricing object with input and output rates
   */
  getPricing(model) {
    // Direct match
    if (this.pricing[model]) {
      return this.pricing[model];
    }

    // Try partial matches for model families
    for (const [key, pricing] of Object.entries(this.pricing)) {
      if (model.includes(key.split('-')[0]) && key !== 'default') {
        return pricing;
      }
    }

    // Default fallback
    return this.pricing.default;
  }

  /**
   * Calculate cost for token usage
   * @param {string} model - Model name
   * @param {number} promptTokens - Number of prompt tokens
   * @param {number} completionTokens - Number of completion tokens
   * @returns {number} Total cost in USD
   */
  calculateCost(model, promptTokens, completionTokens) {
    const pricing = this.getPricing(model);
    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Get all available pricing data
   * @returns {Object} Complete pricing object
   */
  getAllPricing() {
    return { ...this.pricing };
  }

  /**
   * Add or update pricing for a model
   * @param {string} model - Model name
   * @param {Object} pricing - Pricing object with input and output rates
   */
  setPricing(model, pricing) {
    if (!pricing.input || !pricing.output) {
      throw new Error('Pricing must include both input and output rates');
    }
    
    this.pricing[model] = { ...pricing };
  }

  /**
   * Remove pricing for a model
   * @param {string} model - Model name
   */
  removePricing(model) {
    if (model === 'default') {
      throw new Error('Cannot remove default pricing');
    }
    
    delete this.pricing[model];
  }

  /**
   * Get pricing estimates for different token amounts
   * @param {string} model - Model name
   * @returns {Object} Cost estimates for various token amounts
   */
  getPricingEstimates(model) {
    const pricing = this.getPricing(model);
    const tokenAmounts = [1000, 10000, 100000, 1000000];
    
    return {
      model,
      pricing,
      estimates: tokenAmounts.map(tokens => ({
        tokens,
        inputCost: (tokens / 1000) * pricing.input,
        outputCost: (tokens / 1000) * pricing.output,
        totalCost: (tokens / 1000) * (pricing.input + pricing.output)
      }))
    };
  }

  /**
   * Find cheapest models by input cost
   * @param {number} limit - Maximum number of models to return
   * @returns {Array} Array of models sorted by input cost (cheapest first)
   */
  getCheapestModels(limit = 10) {
    const models = Object.entries(this.pricing)
      .filter(([model]) => model !== 'default')
      .map(([model, pricing]) => ({
        model,
        inputCost: pricing.input,
        outputCost: pricing.output,
        totalCost: pricing.input + pricing.output
      }))
      .sort((a, b) => a.inputCost - b.inputCost)
      .slice(0, limit);

    return models;
  }

  /**
   * Compare pricing between models
   * @param {Array<string>} models - Model names to compare
   * @returns {Array} Comparison data for the models
   */
  compareModels(models) {
    return models.map(model => ({
      model,
      pricing: this.getPricing(model),
      estimates: this.getPricingEstimates(model).estimates
    }));
  }
}