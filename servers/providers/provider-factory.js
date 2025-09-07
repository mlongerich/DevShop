import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GoogleProvider } from './google-provider.js';

/**
 * Factory for creating LLM provider instances
 * Implements the Factory pattern to centralize provider creation logic
 */
export class ProviderFactory {
  /**
   * Create a provider instance for the given model
   * @param {string} model - Model name to determine provider
   * @param {string} apiKey - API key for the provider
   * @param {string} [baseUrl] - Base URL for OpenAI-compatible providers
   * @returns {BaseLLMProvider} Provider instance
   */
  static createProvider(model, apiKey, baseUrl) {
    const provider = this.detectProvider(model);
    
    switch (provider) {
      case 'openai':
        return new OpenAIProvider(apiKey, baseUrl);
      
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      
      case 'google':
        return new GoogleProvider(apiKey);
      
      default:
        throw new Error(`Unsupported model provider for model: ${model}`);
    }
  }

  /**
   * Detect which provider should handle the given model
   * @param {string} model - Model name
   * @returns {string} Provider name
   */
  static detectProvider(model) {
    const modelLower = model.toLowerCase();
    
    // OpenAI models
    if (modelLower.includes('gpt') || modelLower.includes('o1')) {
      return 'openai';
    }
    
    // Anthropic models
    if (modelLower.includes('claude')) {
      return 'anthropic';
    }
    
    // Google models
    if (modelLower.includes('gemini') || modelLower.includes('palm')) {
      return 'google';
    }
    
    // Default to OpenAI for unknown models (many providers are OpenAI-compatible)
    return 'openai';
  }

  /**
   * Get all supported models across all providers
   * @returns {Array<{provider: string, models: Array<string>}>} List of providers and their models
   */
  static getSupportedModels() {
    return [
      {
        provider: 'openai',
        models: [
          'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest', 'gpt-5-pro', 'gpt-5-turbo',
          'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
          'o1-preview', 'o1-mini'
        ]
      },
      {
        provider: 'anthropic',
        models: [
          'claude-4.1-opus', 'claude-4-sonnet', 'claude-3.5-haiku', 'claude-3-haiku',
          'claude-3.5-sonnet', 'claude-3-opus', 'claude-3-sonnet'
        ]
      },
      {
        provider: 'google',
        models: [
          'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
          'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'
        ]
      }
    ];
  }

  /**
   * Check if a model is supported by any provider
   * @param {string} model - Model name to check
   * @returns {boolean} True if model is supported
   */
  static isModelSupported(model) {
    const supportedModels = this.getSupportedModels();
    
    return supportedModels.some(providerInfo =>
      providerInfo.models.some(supportedModel =>
        model.includes(supportedModel) || supportedModel.includes(model)
      )
    );
  }

  /**
   * Get the provider name for a specific model
   * @param {string} model - Model name
   * @returns {string|null} Provider name or null if not supported
   */
  static getProviderForModel(model) {
    if (!this.isModelSupported(model)) {
      return null;
    }
    
    return this.detectProvider(model);
  }

  /**
   * Create multiple providers with their respective API keys
   * @param {Object} apiKeys - Object with provider names as keys and API keys as values
   * @param {string} [apiKeys.openai] - OpenAI API key
   * @param {string} [apiKeys.anthropic] - Anthropic API key  
   * @param {string} [apiKeys.google] - Google API key
   * @param {string} [baseUrl] - Base URL for OpenAI-compatible providers
   * @returns {Map<string, BaseLLMProvider>} Map of provider name to provider instance
   */
  static createAllProviders(apiKeys = {}, baseUrl) {
    const providers = new Map();
    
    if (apiKeys.openai) {
      providers.set('openai', new OpenAIProvider(apiKeys.openai, baseUrl));
    }
    
    if (apiKeys.anthropic) {
      providers.set('anthropic', new AnthropicProvider(apiKeys.anthropic));
    }
    
    if (apiKeys.google) {
      providers.set('google', new GoogleProvider(apiKeys.google));
    }
    
    return providers;
  }
}