#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';

class LiteLLMMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'litellm-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.clients = new Map(); // Store clients by base URL
    this.tokenUsage = {
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0,
      sessions: {} // Track usage per session
    };
    
    // Updated model pricing for 2025 (per 1K tokens - converted from per 1M tokens)
    this.modelPricing = {
      // OpenAI GPT-5 Series (2025) - prices per 1K tokens
      'gpt-5': { input: 0.00125, output: 0.01 },           // $1.25/$10.00 per 1M tokens
      'gpt-5-mini': { input: 0.00025, output: 0.002 },     // $0.25/$2.00 per 1M tokens
      'gpt-5-nano': { input: 0.00005, output: 0.0004 },    // $0.05/$0.40 per 1M tokens
      'gpt-5-chat-latest': { input: 0.00125, output: 0.01 }, // $1.25/$10.00 per 1M tokens
      'gpt-5-pro': { input: 0.00125, output: 0.01 },       // Legacy alias for gpt-5
      'gpt-5-turbo': { input: 0.00125, output: 0.01 },     // Legacy alias for gpt-5
      
      // OpenAI GPT-4 Series (Legacy)
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      
      // Anthropic Claude Series
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3.5-haiku': { input: 0.0008, output: 0.004 },
      'claude-3-opus': { input: 0.015, output: 0.075 },
      
      // Google Gemini Series
      'gemini-2.5-pro': { input: 0.002, output: 0.008 },
      'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
      
      // Default fallback
      'default': { input: 0.001, output: 0.002 }
    };

    // Model preferences by agent role
    this.agentModelPreferences = {
      'ba': {
        primary: 'claude-3.5-sonnet',    // Better for analysis and requirements
        fallback: 'gpt-5-mini'
      },
      'developer': {
        primary: 'gpt-5',                // Latest GPT-5 for superior code generation
        fallback: 'claude-3.5-sonnet'
      },
      'general': {
        primary: 'gpt-5-mini',           // Cost-effective general purpose
        fallback: 'gpt-5-nano'           // Even more cost-effective fallback
      }
    };

    this.setupToolHandlers();
  }

  // Initialize client for LiteLLM proxy or direct provider
  initializeClient(baseUrl = 'https://api.openai.com/v1', apiKey) {
    const clientKey = `${baseUrl}:${apiKey?.substring(0, 10)}`;
    
    if (!this.clients.has(clientKey)) {
      const client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseUrl
      });
      this.clients.set(clientKey, client);
    }
    
    return this.clients.get(clientKey);
  }

  // Get model pricing, with fallback for unknown models
  getModelPricing(model) {
    // Try exact match first
    if (this.modelPricing[model]) {
      return this.modelPricing[model];
    }
    
    // Try partial matches for model families
    for (const [key, pricing] of Object.entries(this.modelPricing)) {
      if (model.includes(key.split('-')[0])) {
        return pricing;
      }
    }
    
    // Default fallback
    return this.modelPricing.default;
  }

  calculateCost(model, promptTokens, completionTokens) {
    const pricing = this.getModelPricing(model);
    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  updateTokenUsage(usage, model, sessionId = 'default') {
    this.tokenUsage.total_tokens += usage.total_tokens || 0;
    this.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
    this.tokenUsage.completion_tokens += usage.completion_tokens || 0;
    
    const cost = this.calculateCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
    this.tokenUsage.total_cost += cost;

    // Track per session
    if (!this.tokenUsage.sessions[sessionId]) {
      this.tokenUsage.sessions[sessionId] = {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: 0,
        models_used: new Set()
      };
    }

    const session = this.tokenUsage.sessions[sessionId];
    session.total_tokens += usage.total_tokens || 0;
    session.prompt_tokens += usage.prompt_tokens || 0;
    session.completion_tokens += usage.completion_tokens || 0;
    session.total_cost += cost;
    session.models_used.add(model);
  }

  // Select best model for agent role
  selectModelForAgent(agentRole, requestedModel) {
    if (requestedModel) {
      return requestedModel; // Respect explicit model requests
    }

    const preferences = this.agentModelPreferences[agentRole] || this.agentModelPreferences.general;
    return preferences.primary;
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'llm_chat_completion',
            description: 'Make LLM chat completion request with multi-provider support',
            inputSchema: {
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
                session_id: { type: 'string', description: 'Session identifier for tracking' },
                agent_role: { 
                  type: 'string', 
                  description: 'Agent role (ba, developer, etc.)',
                  default: 'general'
                }
              },
              required: ['messages', 'api_key']
            }
          },
          {
            name: 'llm_get_usage',
            description: 'Get current token usage and cost statistics',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Get usage for specific session' },
                reset: { type: 'boolean', description: 'Reset counters after getting stats', default: false }
              }
            }
          },
          {
            name: 'llm_check_limits',
            description: 'Check if usage is within specified limits',
            inputSchema: {
              type: 'object',
              properties: {
                max_tokens: { type: 'number', description: 'Maximum tokens allowed' },
                max_cost: { type: 'number', description: 'Maximum cost allowed (USD)' },
                session_id: { type: 'string', description: 'Check limits for specific session' }
              },
              required: []
            }
          },
          {
            name: 'llm_create_agent_prompt',
            description: 'Create agent-specific system prompt with context',
            inputSchema: {
              type: 'object',
              properties: {
                agent_role: { 
                  type: 'string', 
                  description: 'Agent role (ba, developer)',
                  enum: ['ba', 'developer']
                },
                project_context: { type: 'string', description: 'Project information and context' },
                session_id: { type: 'string', description: 'Session identifier' },
                mcp_tools: { 
                  type: 'array',
                  description: 'Available MCP tools',
                  items: { type: 'string' }
                },
                cost_budget: { type: 'number', description: 'Remaining cost budget' }
              },
              required: ['agent_role']
            }
          },
          {
            name: 'llm_list_models',
            description: 'List available models and their capabilities',
            inputSchema: {
              type: 'object',
              properties: {
                provider: { type: 'string', description: 'Filter by provider (openai, anthropic, google, etc.)' }
              }
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'llm_chat_completion':
            return await this.chatCompletion(args);
          case 'llm_get_usage':
            return await this.getUsage(args);
          case 'llm_check_limits':
            return await this.checkLimits(args);
          case 'llm_create_agent_prompt':
            return await this.createAgentPrompt(args);
          case 'llm_list_models':
            return await this.listModels(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async chatCompletion(args) {
    const { 
      messages, 
      model = 'auto',
      api_key, 
      base_url = 'https://api.openai.com/v1',
      temperature = 0.7, 
      max_tokens,
      session_id = 'default',
      agent_role = 'general'
    } = args;

    // Select appropriate model for agent role
    const selectedModel = this.selectModelForAgent(agent_role, model === 'auto' ? null : model);
    
    const client = this.initializeClient(base_url, api_key);

    try {
      const completion = await client.chat.completions.create({
        model: selectedModel,
        messages,
        temperature,
        ...(max_tokens && { max_tokens })
      });

      const response = completion.choices[0].message.content;
      const usage = completion.usage || {};

      // Update token usage tracking
      this.updateTokenUsage(usage, selectedModel, session_id);

      // Create response with usage info
      const result = {
        content: response,
        usage: {
          ...usage,
          cost: this.calculateCost(selectedModel, usage.prompt_tokens || 0, usage.completion_tokens || 0),
          model: selectedModel,
          provider: this.getProviderFromModel(selectedModel)
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
      throw new Error(`LLM API error: ${error.message}`);
    }
  }

  getProviderFromModel(model) {
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gemini')) return 'google';
    return 'unknown';
  }

  async getUsage(args) {
    const { session_id, reset = false } = args;
    
    let usage;
    if (session_id) {
      usage = {
        session_id,
        ...(this.tokenUsage.sessions[session_id] || {}),
        models_used: Array.from(this.tokenUsage.sessions[session_id]?.models_used || []),
        timestamp: new Date().toISOString()
      };
    } else {
      usage = {
        ...this.tokenUsage,
        sessions: Object.keys(this.tokenUsage.sessions),
        timestamp: new Date().toISOString()
      };
    }

    if (reset) {
      if (session_id) {
        delete this.tokenUsage.sessions[session_id];
      } else {
        this.tokenUsage = {
          total_tokens: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_cost: 0,
          sessions: {}
        };
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(usage, null, 2)
        }
      ]
    };
  }

  async checkLimits(args) {
    const { max_tokens, max_cost, session_id } = args;
    
    const currentUsage = session_id 
      ? this.tokenUsage.sessions[session_id] || { total_tokens: 0, total_cost: 0 }
      : this.tokenUsage;

    const checks = {
      within_limits: true,
      current_usage: currentUsage,
      limits: { max_tokens, max_cost },
      violations: [],
      session_id
    };

    if (max_tokens && currentUsage.total_tokens > max_tokens) {
      checks.within_limits = false;
      checks.violations.push({
        type: 'token_limit',
        current: currentUsage.total_tokens,
        limit: max_tokens
      });
    }

    if (max_cost && currentUsage.total_cost > max_cost) {
      checks.within_limits = false;
      checks.violations.push({
        type: 'cost_limit',
        current: currentUsage.total_cost,
        limit: max_cost
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(checks, null, 2)
        }
      ]
    };
  }

  async createAgentPrompt(args) {
    const { 
      agent_role, 
      project_context = '', 
      session_id = '',
      mcp_tools = [],
      cost_budget = 5.00
    } = args;

    const basePrompts = {
      ba: `You are a Business Analyst AI agent in the DevShop system. Your role is to:

1. **Requirements Gathering**: Analyze user requests and ask clarifying questions
2. **Documentation**: Create detailed, actionable requirements 
3. **Issue Creation**: Generate well-structured GitHub issues with clear acceptance criteria
4. **Project Analysis**: Understand existing codebase and project context

**Optimized Model**: You are running on ${this.agentModelPreferences.ba.primary} for superior analysis capabilities
**Available MCP Tools**: ${mcp_tools.join(', ')}
**Session ID**: ${session_id}
**Cost Budget Remaining**: $${cost_budget.toFixed(2)}

**Context**: ${project_context}

Focus on understanding the "what" and "why" before defining the "how". Ask questions if requirements are unclear.`,

      developer: `You are a Developer AI agent in the DevShop system. Your role is to:

1. **Implementation**: Read GitHub issues and implement required functionality
2. **Code Quality**: Follow existing code patterns and best practices
3. **Documentation**: Add appropriate comments and documentation
4. **Testing**: Consider test coverage and validation

**Optimized Model**: You are running on ${this.agentModelPreferences.developer.primary} for superior code generation
**Available MCP Tools**: ${mcp_tools.join(', ')}
**Session ID**: ${session_id}
**Cost Budget Remaining**: $${cost_budget.toFixed(2)}

**Context**: ${project_context}

Read the assigned GitHub issue carefully, understand the requirements, then implement clean, maintainable code that follows the project's conventions.`
    };

    const prompt = basePrompts[agent_role] || basePrompts.developer;

    return {
      content: [
        {
          type: 'text',
          text: prompt
        }
      ]
    };
  }

  async listModels(args) {
    const { provider } = args;

    const models = {
      openai: [
        'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest',
        'gpt-5-pro', 'gpt-5-turbo',  // Legacy aliases
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'
      ],
      anthropic: [
        'claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-3-opus'
      ],
      google: [
        'gemini-2.5-pro', 'gemini-2.0-flash'
      ]
    };

    let result;
    if (provider) {
      result = {
        provider,
        models: models[provider] || [],
        pricing: Object.fromEntries(
          Object.entries(this.modelPricing)
            .filter(([model]) => models[provider]?.includes(model))
        )
      };
    } else {
      result = {
        all_providers: models,
        agent_preferences: this.agentModelPreferences,
        pricing: this.modelPricing
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new LiteLLMMCPServer();
server.run().catch(console.error);