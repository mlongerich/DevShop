#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';

class OpenAIMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'openai-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.openai = null;
    this.tokenUsage = {
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_cost: 0
    };
    
    // Model pricing per 1K tokens (as of 2024)
    this.modelPricing = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
    };

    this.setupToolHandlers();
  }

  initializeOpenAI(apiKey) {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
    }
    return this.openai;
  }

  calculateCost(model, promptTokens, completionTokens) {
    const pricing = this.modelPricing[model] || this.modelPricing['gpt-4o-mini'];
    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  updateTokenUsage(usage, model) {
    this.tokenUsage.total_tokens += usage.total_tokens;
    this.tokenUsage.prompt_tokens += usage.prompt_tokens;
    this.tokenUsage.completion_tokens += usage.completion_tokens;
    
    const cost = this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens);
    this.tokenUsage.total_cost += cost;
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'openai_chat_completion',
            description: 'Make OpenAI chat completion request with agent context',
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
                  description: 'OpenAI model to use',
                  default: 'gpt-4o-mini'
                },
                api_key: { type: 'string', description: 'OpenAI API key' },
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
            name: 'openai_get_usage',
            description: 'Get current token usage and cost statistics',
            inputSchema: {
              type: 'object',
              properties: {
                reset: { type: 'boolean', description: 'Reset counters after getting stats', default: false }
              }
            }
          },
          {
            name: 'openai_check_limits',
            description: 'Check if usage is within specified limits',
            inputSchema: {
              type: 'object',
              properties: {
                max_tokens: { type: 'number', description: 'Maximum tokens allowed' },
                max_cost: { type: 'number', description: 'Maximum cost allowed (USD)' }
              },
              required: []
            }
          },
          {
            name: 'openai_create_agent_prompt',
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
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'openai_chat_completion':
            return await this.chatCompletion(args);
          case 'openai_get_usage':
            return await this.getUsage(args);
          case 'openai_check_limits':
            return await this.checkLimits(args);
          case 'openai_create_agent_prompt':
            return await this.createAgentPrompt(args);
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
      model = 'gpt-4o-mini', 
      api_key, 
      temperature = 0.7, 
      max_tokens,
      session_id,
      agent_role = 'general'
    } = args;

    const openai = this.initializeOpenAI(api_key);

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        ...(max_tokens && { max_tokens })
      });

      const response = completion.choices[0].message.content;
      const usage = completion.usage;

      // Update token usage tracking
      this.updateTokenUsage(usage, model);

      // Create response with usage info
      const result = {
        content: response,
        usage: {
          ...usage,
          cost: this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens),
          model
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
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async getUsage(args) {
    const { reset = false } = args;
    
    const usage = {
      ...this.tokenUsage,
      timestamp: new Date().toISOString()
    };

    if (reset) {
      this.tokenUsage = {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: 0
      };
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
    const { max_tokens, max_cost } = args;
    
    const checks = {
      within_limits: true,
      current_usage: this.tokenUsage,
      limits: { max_tokens, max_cost },
      violations: []
    };

    if (max_tokens && this.tokenUsage.total_tokens > max_tokens) {
      checks.within_limits = false;
      checks.violations.push({
        type: 'token_limit',
        current: this.tokenUsage.total_tokens,
        limit: max_tokens
      });
    }

    if (max_cost && this.tokenUsage.total_cost > max_cost) {
      checks.within_limits = false;
      checks.violations.push({
        type: 'cost_limit',
        current: this.tokenUsage.total_cost,
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new OpenAIMCPServer();
server.run().catch(console.error);