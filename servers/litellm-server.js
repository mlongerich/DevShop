#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { ProviderManager } from './providers/provider-manager.js';
import { ChatCompletionCommand } from './commands/chat-completion-command.js';
import { UsageCommand } from './commands/usage-command.js';
import { LimitsCommand } from './commands/limits-command.js';

/**
 * Refactored LiteLLM MCP Server
 * Now uses the Strategy, Factory, Repository, Command, and Decorator patterns
 * for better separation of concerns and maintainability
 */
class LiteLLMMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'litellm-mcp-server',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize components using dependency injection
    this.providerManager = new ProviderManager();
    this.commands = new Map();

    // Register commands
    this.registerCommand(new ChatCompletionCommand(this.providerManager));
    this.registerCommand(new UsageCommand(this.providerManager));
    this.registerCommand(new LimitsCommand(this.providerManager));

    this.setupToolHandlers();
  }

  /**
   * Register a command with the server
   * @param {Object} command - Command instance
   */
  registerCommand(command) {
    this.commands.set(command.getName(), command);
  }

  /**
   * Setup MCP tool handlers
   */
  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];

      for (const command of this.commands.values()) {
        tools.push({
          name: command.getName(),
          description: command.getDescription(),
          inputSchema: command.getInputSchema()
        });
      }

      // Add additional utility tools
      tools.push(
        {
          name: 'llm_create_agent_prompt',
          description: 'Create prompts optimized for specific agent roles',
          inputSchema: {
            type: 'object',
            properties: {
              agent_role: {
                type: 'string',
                description: 'Agent role (ba, developer, etc.)'
              },
              task_description: {
                type: 'string',
                description: 'Description of the task'
              },
              context: {
                type: 'string',
                description: 'Additional context for the prompt'
              }
            },
            required: ['agent_role', 'task_description']
          }
        },
        {
          name: 'llm_list_models',
          description: 'List available models and get recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                description: 'Filter by provider (openai, anthropic, google)'
              },
              task: {
                type: 'string',
                description: 'Task type for recommendations (coding, analysis, chat)'
              },
              cost_preference: {
                type: 'string',
                description: 'Cost preference (low, medium, high)',
                enum: ['low', 'medium', 'high']
              }
            }
          }
        }
      );

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check if it's a registered command
        if (this.commands.has(name)) {
          const command = this.commands.get(name);
          return await command.execute(args);
        }

        // Handle utility tools
        switch (name) {
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

  /**
   * Create optimized prompts for different agent roles
   * @param {Object} args - Arguments for prompt creation
   * @returns {Promise<Object>} Generated prompt
   */
  async createAgentPrompt(args) {
    const { agent_role, task_description, context = '' } = args;

    const rolePrompts = {
      ba: {
        system: "You are a Business Analyst AI assistant. Your role is to analyze requirements, create detailed specifications, and ensure business objectives are clearly defined. Focus on understanding user needs, identifying edge cases, and creating comprehensive documentation.",
        prefix: "As a BA, analyze the following request and provide detailed requirements:"
      },
      developer: {
        system: "You are a Developer AI assistant. Your role is to write clean, efficient, and well-documented code. Follow best practices, consider edge cases, and ensure code is maintainable and scalable.",
        prefix: "As a developer, implement the following feature:"
      },
      reviewer: {
        system: "You are a Code Reviewer AI assistant. Your role is to review code for quality, security, performance, and adherence to best practices. Provide constructive feedback and suggestions for improvement.",
        prefix: "Review the following code and provide feedback:"
      },
      architect: {
        system: "You are a Software Architect AI assistant. Your role is to design scalable, maintainable systems and make high-level technical decisions. Consider system architecture, design patterns, and long-term maintainability.",
        prefix: "Design the architecture for the following system:"
      },
      general: {
        system: "You are a helpful AI assistant focused on software development tasks.",
        prefix: "Please help with the following:"
      }
    };

    const roleConfig = rolePrompts[agent_role] || rolePrompts.general;

    const prompt = {
      system_prompt: roleConfig.system,
      user_prompt: `${roleConfig.prefix}\n\n${task_description}${context ? `\n\nAdditional context:\n${context}` : ''}`,
      agent_role,
      created_at: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(prompt, null, 2)
        }
      ]
    };
  }

  /**
   * List available models and provide recommendations
   * @param {Object} args - Arguments for model listing
   * @returns {Promise<Object>} Available models and recommendations
   */
  async listModels(args) {
    const { provider, task, cost_preference } = args;

    const supportedModels = this.providerManager.getAllSupportedModels();
    const providerStats = this.providerManager.getProviderStats();

    // Filter by provider if requested
    let filteredModels = supportedModels;
    if (provider) {
      filteredModels = { [provider]: supportedModels[provider] || [] };
    }

    // Get recommendations based on criteria
    const recommendations = this.providerManager.recommendModels({
      task,
      cost_preference
    }).slice(0, 10); // Top 10 recommendations

    const result = {
      supported_models: filteredModels,
      recommendations: recommendations.map(rec => ({
        model: rec.model,
        provider: rec.provider,
        cost_per_1k_tokens: rec.cost_per_1k_tokens.toFixed(6),
        suitability_score: rec.suitability_score.toFixed(1),
        input_cost_per_1k: rec.pricing.input.toFixed(6),
        output_cost_per_1k: rec.pricing.output.toFixed(6)
      })),
      provider_stats: providerStats,
      filter_applied: { provider, task, cost_preference },
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
  }

  /**
   * Start the server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new LiteLLMMCPServer();
server.run().catch(console.error);