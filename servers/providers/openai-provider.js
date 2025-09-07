import OpenAI from 'openai';
import { BaseLLMProvider, LLMResponse, ChatCompletionRequest } from './base-provider.js';

/**
 * OpenAI provider implementation
 * Handles GPT models and OpenAI-compatible APIs
 */
export class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey, baseUrl = 'https://api.openai.com/v1') {
    super(apiKey);
    this.baseUrl = baseUrl;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });
  }

  getProviderName() {
    return 'openai';
  }

  supportsModel(model) {
    const openaiModels = [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest', 'gpt-5-pro', 'gpt-5-turbo',
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
      'o1-preview', 'o1-mini'
    ];
    
    return openaiModels.some(supportedModel => model.includes(supportedModel));
  }

  mapModelName(model) {
    // OpenAI models typically don't need mapping, but we can handle aliases
    const modelMap = {
      'gpt-5-pro': 'gpt-5',
      'gpt-5-turbo': 'gpt-5'
    };
    
    return modelMap[model] || model;
  }

  async chatCompletion(request) {
    const chatRequest = new ChatCompletionRequest(request);
    chatRequest.validate();

    const mappedModel = this.mapModelName(chatRequest.model);
    
    // Build OpenAI request parameters
    const requestParams = {
      model: mappedModel,
      messages: chatRequest.messages,
    };

    // Add optional parameters
    if (chatRequest.temperature !== undefined) {
      requestParams.temperature = chatRequest.temperature;
    }

    // Use max_completion_tokens for GPT-5 models, max_tokens for others
    if (mappedModel.startsWith('gpt-5') && chatRequest.maxCompletionTokens) {
      requestParams.max_completion_tokens = chatRequest.maxCompletionTokens;
    } else if (chatRequest.maxTokens) {
      requestParams.max_tokens = chatRequest.maxTokens;
    }

    try {
      const completion = await this.client.chat.completions.create(requestParams);
      
      const content = completion.choices[0].message.content;
      const usage = completion.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };

      return new LLMResponse(content, usage);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async validateApiKey() {
    try {
      // Make a minimal request to validate the API key
      await this.client.models.list();
      return true;
    } catch (error) {
      if (error.status === 401) {
        return false;
      }
      // Other errors might be network issues, not auth issues
      throw error;
    }
  }

  /**
   * List available models
   * @returns {Promise<Array>} Array of model names
   */
  async listModels() {
    try {
      const response = await this.client.models.list();
      return response.data.map(model => model.id);
    } catch (error) {
      throw new Error(`Failed to list OpenAI models: ${error.message}`);
    }
  }
}