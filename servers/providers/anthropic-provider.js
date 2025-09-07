import { BaseLLMProvider, LLMResponse, ChatCompletionRequest } from './base-provider.js';

/**
 * Anthropic provider implementation
 * Handles Claude models via Anthropic's Messages API
 */
export class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  getProviderName() {
    return 'anthropic';
  }

  supportsModel(model) {
    const anthropicModels = [
      'claude-4.1-opus', 'claude-4-sonnet', 'claude-3.5-haiku', 'claude-3-haiku',
      'claude-3.5-sonnet', 'claude-3-opus', 'claude-3-sonnet'
    ];
    
    return anthropicModels.some(supportedModel => model.includes(supportedModel));
  }

  mapModelName(model) {
    const modelMap = {
      'claude-4.1-opus': 'claude-opus-4.1-20250301',
      'claude-4-sonnet': 'claude-sonnet-4-20250514',
      'claude-3.5-haiku': 'claude-3.5-haiku-20241022',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229'
    };
    
    return modelMap[model] || model;
  }

  async chatCompletion(request) {
    const chatRequest = new ChatCompletionRequest(request);
    chatRequest.validate();

    const mappedModel = this.mapModelName(chatRequest.model);
    
    // Build Anthropic request
    const requestBody = {
      model: mappedModel,
      messages: chatRequest.messages,
      max_tokens: chatRequest.maxTokens || 1000
    };

    // Add optional parameters
    if (chatRequest.temperature !== undefined) {
      requestBody.temperature = chatRequest.temperature;
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Handle error responses
      if (data.type === 'error') {
        throw new Error(`Anthropic API error: ${data.error.message}`);
      }
      
      const content = data.content[0].text;
      const usage = {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens
      };

      return new LLMResponse(content, usage);
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error(`Anthropic API network error: ${error.message}`);
      }
      throw error;
    }
  }

  async validateApiKey() {
    try {
      // Make a minimal request to validate the API key
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      });

      // If we get a 401, the API key is invalid
      if (response.status === 401) {
        return false;
      }

      // Any other response (including errors) means the key is valid
      return true;
    } catch (error) {
      // Network errors don't necessarily mean invalid key
      throw error;
    }
  }

  /**
   * List available models
   * @returns {Promise<Array>} Array of model names
   */
  async listModels() {
    // Anthropic doesn't provide a models endpoint, return known models
    return [
      'claude-opus-4.1-20250301',
      'claude-sonnet-4-20250514', 
      'claude-3.5-haiku-20241022',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229'
    ];
  }
}