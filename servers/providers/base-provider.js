/**
 * Base provider interface for LLM API integration
 * Defines the contract that all provider implementations must follow
 */
export class BaseLLMProvider {
  constructor(apiKey) {
    if (this.constructor === BaseLLMProvider) {
      throw new Error('BaseLLMProvider is an abstract class and cannot be instantiated directly');
    }
    this.apiKey = apiKey;
  }

  /**
   * Get the provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by subclass');
  }

  /**
   * Check if this provider supports the given model
   * @param {string} model - Model name to check
   * @returns {boolean} True if model is supported
   */
  supportsModel(model) {
    throw new Error('supportsModel() must be implemented by subclass');
  }

  /**
   * Map internal model name to provider-specific model name
   * @param {string} model - Internal model name
   * @returns {string} Provider-specific model name
   */
  mapModelName(model) {
    throw new Error('mapModelName() must be implemented by subclass');
  }

  /**
   * Make a chat completion request
   * @param {Object} request - Request parameters
   * @param {Array} request.messages - Chat messages
   * @param {string} request.model - Model name
   * @param {number} [request.maxTokens] - Maximum tokens to generate
   * @param {number} [request.temperature] - Temperature setting
   * @returns {Promise<Object>} Response with content and usage
   */
  async chatCompletion(request) {
    throw new Error('chatCompletion() must be implemented by subclass');
  }

  /**
   * Validate the API key
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    throw new Error('validateApiKey() must be implemented by subclass');
  }
}

/**
 * Standard response format for all providers
 */
export class LLMResponse {
  constructor(content, usage) {
    this.content = content;
    this.usage = {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens)
    };
  }
}

/**
 * Standard request format for chat completion
 */
export class ChatCompletionRequest {
  constructor({ messages, model, maxTokens, temperature, maxCompletionTokens }) {
    this.messages = messages || [];
    this.model = model;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
    this.maxCompletionTokens = maxCompletionTokens;
  }

  validate() {
    if (!this.messages || this.messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }
    
    if (!this.model) {
      throw new Error('Model is required');
    }

    for (const message of this.messages) {
      if (!message.role || !message.content) {
        throw new Error('Each message must have role and content properties');
      }
    }
  }
}