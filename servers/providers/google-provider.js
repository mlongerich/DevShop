import { BaseLLMProvider, LLMResponse, ChatCompletionRequest } from './base-provider.js';

/**
 * Google provider implementation
 * Handles Gemini models via Google's Generative Language API
 */
export class GoogleProvider extends BaseLLMProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  getProviderName() {
    return 'google';
  }

  supportsModel(model) {
    const googleModels = [
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
      'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'
    ];
    
    return googleModels.some(supportedModel => model.includes(supportedModel));
  }

  mapModelName(model) {
    const modelMap = {
      'gemini-2.5-pro': 'gemini-2.5-pro-exp',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'gemini-2.0-flash': 'gemini-2.0-flash-exp',
      'gemini-1.5-pro': 'gemini-1.5-pro-latest',
      'gemini-1.5-flash': 'gemini-1.5-flash-latest'
    };
    
    return modelMap[model] || model;
  }

  /**
   * Convert OpenAI-style messages to Google's format
   * @param {Array} messages - OpenAI format messages
   * @returns {Array} Google format contents
   */
  convertMessages(messages) {
    return messages.map(msg => ({
      parts: [{ text: msg.content }],
      role: msg.role === 'assistant' ? 'model' : 'user'
    }));
  }

  async chatCompletion(request) {
    const chatRequest = new ChatCompletionRequest(request);
    chatRequest.validate();

    const mappedModel = this.mapModelName(chatRequest.model);
    const contents = this.convertMessages(chatRequest.messages);
    
    // Build Google request
    const requestBody = {
      contents: contents
    };

    // Add generation config if needed
    const generationConfig = {};
    if (chatRequest.maxTokens) {
      generationConfig.maxOutputTokens = chatRequest.maxTokens;
    }
    if (chatRequest.temperature !== undefined) {
      generationConfig.temperature = chatRequest.temperature;
    }

    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models/${mappedModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Handle error responses
      if (data.error) {
        throw new Error(`Google API error: ${data.error.message}`);
      }

      // Check if we have candidates
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response candidates from Google API');
      }

      const content = data.candidates[0].content.parts[0].text;
      const usage = {
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata?.totalTokenCount || 0
      };

      return new LLMResponse(content, usage);
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error(`Google API network error: ${error.message}`);
      }
      throw error;
    }
  }

  async validateApiKey() {
    try {
      // Make a minimal request to validate the API key
      const response = await fetch(`${this.baseUrl}/models/gemini-2.5-flash-lite:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'test' }],
            role: 'user'
          }]
        })
      });

      // If we get a 400 with INVALID_API_KEY or 401/403, the API key is invalid
      if (response.status === 401 || response.status === 403) {
        return false;
      }

      if (response.status === 400) {
        const errorText = await response.text();
        if (errorText.includes('API_KEY_INVALID') || errorText.includes('INVALID_API_KEY')) {
          return false;
        }
      }

      // Any other response (including success or other errors) means the key is valid
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
    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json();
      return data.models
        .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
        .map(model => model.name.replace('models/', ''));
    } catch (error) {
      // Fallback to known models if the API call fails
      return [
        'gemini-2.5-pro-exp',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest'
      ];
    }
  }
}