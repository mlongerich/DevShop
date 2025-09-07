import { ChatCompletionRequest } from '../providers/base-provider.js';

/**
 * Command for handling chat completion requests
 * Implements the Command pattern to encapsulate chat completion logic
 */
export class ChatCompletionCommand {
  constructor(providerManager) {
    this.providerManager = providerManager;
  }

  /**
   * Execute chat completion command
   * @param {Object} args - Command arguments
   * @returns {Promise<Object>} Formatted response
   */
  async execute(args) {
    const {
      messages,
      model = 'auto',
      api_key,
      base_url,
      temperature = 0.7,
      max_tokens,
      max_completion_tokens,
      session_id = 'default',
      agent_role = 'general'
    } = args;

    // Validate required parameters
    if (!messages || messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    if (!api_key) {
      throw new Error('API key is required');
    }

    // Select appropriate model for agent role
    const selectedModel = this.selectModelForAgent(agent_role, model === 'auto' ? null : model);
    
    // Get or create provider for this model
    const provider = this.providerManager.getProvider(selectedModel, api_key, base_url);

    // Create request object
    const request = new ChatCompletionRequest({
      messages,
      model: selectedModel,
      maxTokens: max_tokens,
      maxCompletionTokens: max_completion_tokens,
      temperature
    });

    try {
      // Execute chat completion with usage tracking
      const response = await provider.chatCompletion(request, session_id);

      // Create formatted result
      const result = {
        content: response.content,
        usage: {
          ...response.usage,
          model: selectedModel,
          provider: provider.getProviderName()
        },
        session_id,
        agent_role,
        timestamp: new Date().toISOString()
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Chat completion failed: ${error.message}`);
    }
  }

  /**
   * Select best model for agent role
   * @param {string} agentRole - Role of the agent (ba, developer, etc.)
   * @param {string} requestedModel - Specifically requested model
   * @returns {string} Selected model name
   */
  selectModelForAgent(agentRole, requestedModel) {
    if (requestedModel) {
      return requestedModel;
    }

    // Default model selection based on agent role
    const modelsByRole = {
      'ba': 'gpt-5-nano',        // Business analysis - good balance of cost and capability
      'developer': 'claude-3-haiku', // Development - fast and cost-effective
      'review': 'gpt-5-mini',    // Code review - better reasoning
      'planning': 'claude-4-sonnet', // Strategic planning - high capability
      'general': 'gpt-5-nano'    // General use - cost-effective
    };

    return modelsByRole[agentRole] || modelsByRole.general;
  }

  /**
   * Get command name
   * @returns {string} Command name
   */
  getName() {
    return 'llm_chat_completion';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  getDescription() {
    return 'Make LLM chat completion request with multi-provider support';
  }

  /**
   * Get command input schema
   * @returns {Object} JSON schema for command inputs
   */
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Array of chat messages',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant'] },
              content: { type: 'string' }
            },
            required: ['role', 'content']
          }
        },
        model: {
          type: 'string',
          description: 'LLM model to use (auto-selected by agent role if not specified)',
          default: 'auto'
        },
        api_key: { type: 'string', description: 'API key for the model provider' },
        base_url: {
          type: 'string',
          description: 'Base URL for LiteLLM proxy or provider API',
          default: 'https://api.openai.com/v1'
        },
        temperature: { type: 'number', description: 'Temperature (0-2)', default: 0.7 },
        max_tokens: { type: 'number', description: 'Maximum tokens in response' },
        max_completion_tokens: { type: 'number', description: 'Maximum completion tokens for GPT-5 models' },
        session_id: { type: 'string', description: 'Session identifier for tracking' },
        agent_role: {
          type: 'string',
          description: 'Agent role (ba, developer, etc.)',
          default: 'general'
        }
      },
      required: ['messages', 'api_key']
    };
  }
}