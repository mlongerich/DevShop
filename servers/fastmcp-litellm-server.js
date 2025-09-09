#!/usr/bin/env node

import { FastMCP } from "fastmcp";
import { z } from "zod";
import { ProviderManager } from './providers/provider-manager.js';

/**
 * FastMCP-based LiteLLM Server - Proof of Concept (Fixed API)
 * Demonstrating migration from manual MCP SDK to FastMCP framework
 */
async function createFastMCPServer() {
  // Initialize provider manager
  const providerManager = new ProviderManager();

  // Initialize FastMCP server with enhanced configuration
  const mcp = new FastMCP({
    name: "fastmcp-litellm-server",
    version: "1.1.0",
    description: "Multi-provider LLM server with cost tracking and session management"
  });

  /**
   * Get appropriate API key for the given model
   */
  function getApiKeyForModel(model) {
    if (model.includes('gpt') || model.includes('o1')) {
      return process.env.OPENAI_API_KEY || '';
    } else if (model.includes('claude')) {
      return process.env.ANTHROPIC_API_KEY || '';
    } else if (model.includes('gemini')) {
      return process.env.GOOGLE_API_KEY || '';
    }
    return process.env.OPENAI_API_KEY || ''; // Default fallback
  }

  // Chat completion tool with enhanced features
  mcp.addTool({
    name: "llm_chat_completion",
    description: "Multi-provider LLM chat completion with cost tracking and session management",
    parameters: z.object({
      model: z.string().describe("LLM model name (e.g., gpt-5, claude-3.5-sonnet)"),
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string()
      })).describe("Array of chat messages"),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature (0-2)"),
      max_tokens: z.number().min(1).max(100000).optional().describe("Maximum tokens to generate"),
      session_id: z.string().optional().describe("Session ID for tracking"),
      stream: z.boolean().optional().describe("Enable streaming response"),
      user_id: z.string().optional().describe("User ID for session management")
    }),
    annotations: {
      title: "LLM Chat Completion",
      readOnlyHint: false, // Modifies provider state (usage tracking)
      openWorldHint: true  // Connects to external LLM APIs
    },
    execute: async (params) => {
      const { model, messages, temperature, max_tokens, session_id, stream, user_id } = params;
      const effectiveSessionId = session_id || `session_${Date.now()}`;

      try {
        // Validate model availability
        const supportedModels = providerManager.getAllSupportedModels();
        const allModels = Object.values(supportedModels).flat();
        if (!allModels.some(m => m.includes(model.split('-')[0]))) {
          throw new Error(`Model ${model} is not supported. Available models: ${allModels.slice(0, 5).join(', ')}`);
        }

        // Check limits for usage tracking (non-blocking)
        const limitsCheck = providerManager.checkLimits(effectiveSessionId, max_tokens || 1000);
        if (!limitsCheck.within_limits) {
          // Log usage info but allow request to proceed for graceful client-side handling
          console.log(`⚠️ Usage approaching limits - Session: ${effectiveSessionId}, Tokens: ${limitsCheck.current_usage.tokens}/${limitsCheck.limits.max_tokens}, Cost: $${limitsCheck.current_usage.cost.toFixed(4)}/$${limitsCheck.limits.max_cost.toFixed(2)}`);
        }

        // Get appropriate provider with enhanced error handling
        let provider;
        try {
          provider = providerManager.getProvider(
            model,
            getApiKeyForModel(model)
          );
        } catch (providerError) {
          throw new Error(`Failed to initialize provider for model ${model}: ${providerError.message}`);
        }

        // Execute chat completion with enhanced parameters
        const startTime = Date.now();
        const requestParams = {
          model,
          messages,
          max_tokens: max_tokens || 1000,
          stream: stream || false
        };
        
        // Only add temperature for models that support it (gpt-5-nano doesn't support custom temperature)
        if (temperature !== undefined && !model.includes('gpt-5-nano')) {
          requestParams.temperature = temperature;
        } else if (!model.includes('gpt-5-nano')) {
          requestParams.temperature = 0.7;
        }
        
        const response = await provider.chatCompletion(requestParams, effectiveSessionId);
        
        const processingTime = Date.now() - startTime;

        // Enhanced response with metadata
        const enhancedResponse = {
          success: true,
          response: response.content || response.choices?.[0]?.message?.content || "",
          usage: {
            ...response.usage,
            processing_time_ms: processingTime,
            cost_estimate: response.usage ? (response.usage.total_tokens * 0.001) : 0
          },
          metadata: {
            model,
            session_id: effectiveSessionId,
            user_id: user_id || 'anonymous',
            provider: provider.getProviderName?.() || 'unknown',
            timestamp: new Date().toISOString(),
            streaming_enabled: stream || false
          },
          limits_before: limitsCheck,
          limits_after: providerManager.checkLimits(effectiveSessionId, 0)
        };

        return JSON.stringify(enhancedResponse, null, 2);
      } catch (error) {
        // Enhanced error response with context
        const errorResponse = {
          success: false,
          error: {
            message: error.message,
            type: error.name || 'ChatCompletionError',
            session_id: effectiveSessionId,
            model,
            timestamp: new Date().toISOString()
          }
        };
        
        throw new Error(JSON.stringify(errorResponse, null, 2));
      }
    }
  });

  // Usage tracking tool
  mcp.addTool({
    name: "llm_get_usage",
    description: "Get usage statistics and cost tracking information",
    parameters: z.object({
      session_id: z.string().optional().describe("Filter by session ID"),
      provider: z.string().optional().describe("Filter by provider (openai, anthropic, google)")
    }),
    execute: async (params) => {
      const { session_id, provider } = params;

      try {
        const usage = providerManager.getUsageStats(session_id, provider);
        return JSON.stringify(usage, null, 2);
      } catch (error) {
        throw new Error(`Usage retrieval failed: ${error.message}`);
      }
    }
  });

  // Limits checking tool
  mcp.addTool({
    name: "llm_check_limits",
    description: "Check if usage is within configured limits",
    parameters: z.object({
      session_id: z.string().optional().describe("Session ID to check"),
      proposed_tokens: z.number().optional().describe("Proposed token usage to validate")
    }),
    execute: async (params) => {
      const { session_id, proposed_tokens } = params;

      try {
        const limits = providerManager.checkLimits(session_id, proposed_tokens);
        return JSON.stringify(limits, null, 2);
      } catch (error) {
        throw new Error(`Limits check failed: ${error.message}`);
      }
    }
  });

  // Model listing tool
  mcp.addTool({
    name: "llm_list_models",
    description: "List available models and get recommendations",
    parameters: z.object({
      provider: z.string().optional().describe("Filter by provider (openai, anthropic, google)"),
      task: z.string().optional().describe("Task type for recommendations (coding, analysis, chat)"),
      cost_preference: z.enum(["low", "medium", "high"]).optional().describe("Cost preference")
    }),
    execute: async (params) => {
      const { provider, task, cost_preference } = params;

      try {
        const supportedModels = providerManager.getAllSupportedModels();
        const recommendations = providerManager.recommendModels({
          task,
          cost_preference
        });

        // Filter by provider if requested
        let filteredModels = supportedModels;
        if (provider) {
          filteredModels = { [provider]: supportedModels[provider] || [] };
        }

        const result = {
          supported_models: filteredModels,
          recommendations: recommendations.slice(0, 10),
          provider_stats: providerManager.getProviderStats(),
          filter_applied: { provider, task, cost_preference },
          timestamp: new Date().toISOString()
        };

        return JSON.stringify(result, null, 2);
      } catch (error) {
        throw new Error(`Model listing failed: ${error.message}`);
      }
    }
  });

  // Agent prompt creation tool
  mcp.addTool({
    name: "llm_create_agent_prompt",
    description: "Create optimized prompts for specific agent roles",
    parameters: z.object({
      agent_role: z.enum(["ba", "developer", "reviewer", "architect", "general"]).describe("Agent role"),
      task_description: z.string().describe("Description of the task"),
      context: z.string().optional().describe("Additional context for the prompt")
    }),
    execute: async (params) => {
      const { agent_role, task_description, context } = params;

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

      return JSON.stringify(prompt, null, 2);
    }
  });

  return mcp;
}

// Start the server
async function main() {
  try {
    const server = await createFastMCPServer();
    await server.start({
      transportType: "stdio"
    });
    console.log('FastMCP LiteLLM Server started successfully');
  } catch (error) {
    console.error('Failed to start FastMCP server:', error);
    process.exit(1);
  }
}

main().catch(console.error);