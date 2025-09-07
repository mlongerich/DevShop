import { ProviderFactory } from './provider-factory.js';
import { UsageTrackingDecorator } from '../decorators/usage-tracking-decorator.js';
import { ModelPricingConfig } from '../config/model-pricing-config.js';

/**
 * Manager for handling multiple LLM providers
 * Coordinates provider creation, caching, and selection
 */
export class ProviderManager {
  constructor() {
    this.providers = new Map(); // Cache of provider instances
    this.pricingConfig = new ModelPricingConfig();
  }

  /**
   * Get or create a provider for the given model and API key
   * @param {string} model - Model name
   * @param {string} apiKey - API key for the provider
   * @param {string} [baseUrl] - Base URL for OpenAI-compatible providers
   * @returns {UsageTrackingDecorator} Provider wrapped with usage tracking
   */
  getProvider(model, apiKey, baseUrl) {
    const providerName = ProviderFactory.detectProvider(model);
    const cacheKey = `${providerName}:${apiKey?.substring(0, 8)}:${baseUrl || ''}`;
    
    // Return cached provider if available
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey);
    }

    // Create new provider
    const baseProvider = ProviderFactory.createProvider(model, apiKey, baseUrl);
    const decoratedProvider = new UsageTrackingDecorator(baseProvider, this.pricingConfig);
    
    // Cache the provider
    this.providers.set(cacheKey, decoratedProvider);
    
    return decoratedProvider;
  }

  /**
   * Get a provider by name (if it exists in cache)
   * @param {string} providerName - Name of the provider
   * @returns {UsageTrackingDecorator|null} Cached provider or null
   */
  getProviderByName(providerName) {
    for (const [key, provider] of this.providers.entries()) {
      if (key.startsWith(`${providerName}:`)) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Get all cached providers
   * @returns {Map<string, UsageTrackingDecorator>} All cached providers
   */
  getAllProviders() {
    return new Map(this.providers);
  }

  /**
   * Clear provider cache
   * @param {string} [providerName] - Specific provider to clear, or all if not specified
   */
  clearCache(providerName) {
    if (providerName) {
      // Clear specific provider
      const keysToDelete = Array.from(this.providers.keys())
        .filter(key => key.startsWith(`${providerName}:`));
      
      keysToDelete.forEach(key => this.providers.delete(key));
    } else {
      // Clear all providers
      this.providers.clear();
    }
  }

  /**
   * Validate all cached providers
   * @returns {Promise<Object>} Validation results for all providers
   */
  async validateAllProviders() {
    const results = {
      valid_providers: [],
      invalid_providers: [],
      error_providers: []
    };

    for (const [key, provider] of this.providers.entries()) {
      try {
        const isValid = await provider.validateApiKey();
        const [providerName] = key.split(':');
        
        if (isValid) {
          results.valid_providers.push({
            provider: providerName,
            cache_key: key,
            status: 'valid'
          });
        } else {
          results.invalid_providers.push({
            provider: providerName,
            cache_key: key,
            status: 'invalid'
          });
        }
      } catch (error) {
        const [providerName] = key.split(':');
        results.error_providers.push({
          provider: providerName,
          cache_key: key,
          error: error.message,
          status: 'error'
        });
      }
    }

    return results;
  }

  /**
   * Get provider statistics
   * @returns {Object} Statistics about cached providers
   */
  getProviderStats() {
    const stats = {
      total_providers: this.providers.size,
      providers_by_type: {},
      cache_keys: Array.from(this.providers.keys()),
      timestamp: new Date().toISOString()
    };

    // Count providers by type
    for (const key of this.providers.keys()) {
      const [providerName] = key.split(':');
      stats.providers_by_type[providerName] = (stats.providers_by_type[providerName] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get supported models for all providers
   * @returns {Object} Map of provider to supported models
   */
  getAllSupportedModels() {
    return ProviderFactory.getSupportedModels().reduce((acc, providerInfo) => {
      acc[providerInfo.provider] = providerInfo.models;
      return acc;
    }, {});
  }

  /**
   * Find best provider for a specific use case
   * @param {Object} criteria - Selection criteria
   * @param {string} [criteria.task] - Task type (chat, completion, etc.)
   * @param {string} [criteria.cost_preference] - Cost preference (low, medium, high)
   * @param {string} [criteria.speed_preference] - Speed preference (fast, medium, slow)
   * @returns {Array} Recommended models sorted by suitability
   */
  recommendModels(criteria = {}) {
    const allModels = this.getAllSupportedModels();
    const recommendations = [];

    for (const [provider, models] of Object.entries(allModels)) {
      for (const model of models) {
        const pricing = this.pricingConfig.getPricing(model);
        const recommendation = {
          model,
          provider,
          pricing,
          cost_per_1k_tokens: pricing.input + pricing.output,
          suitability_score: this.calculateSuitabilityScore(model, provider, criteria)
        };
        
        recommendations.push(recommendation);
      }
    }

    // Sort by suitability score (higher is better)
    return recommendations.sort((a, b) => b.suitability_score - a.suitability_score);
  }

  /**
   * Calculate suitability score for a model based on criteria
   * @param {string} model - Model name
   * @param {string} provider - Provider name
   * @param {Object} criteria - Selection criteria
   * @returns {number} Suitability score (0-100)
   */
  calculateSuitabilityScore(model, provider, criteria) {
    let score = 50; // Base score

    // Cost preference scoring
    const pricing = this.pricingConfig.getPricing(model);
    const costPer1k = pricing.input + pricing.output;
    
    if (criteria.cost_preference === 'low') {
      score += (0.01 - Math.min(costPer1k, 0.01)) * 1000; // Favor cheaper models
    } else if (criteria.cost_preference === 'high') {
      score += Math.min(costPer1k, 0.1) * 100; // Favor more expensive (presumably better) models
    }

    // Speed preference (heuristic based on model size/type)
    if (criteria.speed_preference === 'fast') {
      if (model.includes('nano') || model.includes('haiku') || model.includes('flash')) {
        score += 20;
      }
    } else if (criteria.speed_preference === 'slow') {
      if (model.includes('opus') || model.includes('pro') || model.includes('2.5')) {
        score += 20;
      }
    }

    // Task-specific preferences
    if (criteria.task === 'coding') {
      if (model.includes('claude') || model.includes('gpt-4')) {
        score += 15;
      }
    } else if (criteria.task === 'analysis') {
      if (model.includes('opus') || model.includes('gpt-5')) {
        score += 15;
      }
    }

    return Math.min(Math.max(score, 0), 100); // Clamp between 0-100
  }

  /**
   * Get aggregated usage statistics across all providers
   * @param {string} [sessionId] - Filter by session ID
   * @param {string} [providerName] - Filter by provider name
   * @returns {Object} Usage statistics
   */
  getUsageStats(sessionId, providerName) {
    const stats = {
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0,
      sessions: {},
      providers: {},
      timestamp: new Date().toISOString()
    };

    for (const [cacheKey, provider] of this.providers.entries()) {
      const [providerType] = cacheKey.split(':');
      
      // Skip if provider filter doesn't match
      if (providerName && providerType !== providerName) {
        continue;
      }

      // Get usage from decorated provider
      if (provider.usage) {
        const usage = provider.usage;
        
        // Aggregate totals
        stats.total_tokens += usage.total_tokens || 0;
        stats.prompt_tokens += usage.prompt_tokens || 0;
        stats.completion_tokens += usage.completion_tokens || 0;
        stats.total_cost += usage.total_cost || 0;

        // Provider-specific stats
        if (!stats.providers[providerType]) {
          stats.providers[providerType] = {
            total_tokens: 0,
            total_cost: 0,
            session_count: 0
          };
        }
        
        stats.providers[providerType].total_tokens += usage.total_tokens || 0;
        stats.providers[providerType].total_cost += usage.total_cost || 0;

        // Session-specific stats
        if (usage.sessions) {
          for (const [sessId, sessionUsage] of Object.entries(usage.sessions)) {
            // Skip if session filter doesn't match
            if (sessionId && sessId !== sessionId) {
              continue;
            }

            if (!stats.sessions[sessId]) {
              stats.sessions[sessId] = {
                total_tokens: 0,
                total_cost: 0,
                providers: []
              };
            }

            stats.sessions[sessId].total_tokens += sessionUsage.total_tokens || 0;
            stats.sessions[sessId].total_cost += sessionUsage.total_cost || 0;
            
            if (!stats.sessions[sessId].providers.includes(providerType)) {
              stats.sessions[sessId].providers.push(providerType);
            }
            
            stats.providers[providerType].session_count += 1;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Check if usage is within configured limits
   * @param {string} [sessionId] - Session to check limits for
   * @param {number} [proposedTokens] - Additional tokens to validate
   * @returns {Object} Limit check results
   */
  checkLimits(sessionId, proposedTokens = 0) {
    const maxCostPerSession = parseFloat(process.env.MAX_COST_PER_SESSION) || 5.00;
    const maxTokensPerSession = parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000;

    const currentUsage = this.getUsageStats(sessionId);
    const sessionUsage = sessionId && currentUsage.sessions[sessionId] 
      ? currentUsage.sessions[sessionId] 
      : { total_tokens: 0, total_cost: 0 };

    const projectedTokens = sessionUsage.total_tokens + proposedTokens;
    const projectedCost = sessionUsage.total_cost + (proposedTokens * 0.001); // Rough estimate

    return {
      within_limits: projectedTokens <= maxTokensPerSession && projectedCost <= maxCostPerSession,
      current_usage: {
        tokens: sessionUsage.total_tokens,
        cost: sessionUsage.total_cost
      },
      projected_usage: {
        tokens: projectedTokens,
        cost: projectedCost
      },
      limits: {
        max_tokens: maxTokensPerSession,
        max_cost: maxCostPerSession
      },
      session_id: sessionId,
      timestamp: new Date().toISOString()
    };
  }
}