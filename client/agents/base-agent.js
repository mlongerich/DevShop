import chalk from 'chalk';

/**
 * Base agent interface for DevShop AI agents
 * Defines the contract that all agent implementations must follow
 */
export class BaseAgent {
  constructor(mcpClientManager, sessionService) {
    if (this.constructor === BaseAgent) {
      throw new Error('BaseAgent is an abstract class and cannot be instantiated directly');
    }
    this.mcpClientManager = mcpClientManager;
    this.sessionService = sessionService;
  }

  /**
   * Get the agent name/type
   * @returns {string} Agent name
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  /**
   * Get the agent description
   * @returns {string} Agent description
   */
  getDescription() {
    throw new Error('getDescription() must be implemented by subclass');
  }

  /**
   * Execute the agent's main workflow
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(_context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate the execution context
   * @param {Object} context - Context to validate
   * @returns {boolean} True if context is valid
   */
  validateContext(_context) {
    throw new Error('validateContext() must be implemented by subclass');
  }

  /**
   * Get required context parameters
   * @returns {Array<string>} Array of required parameter names
   */
  getRequiredContextParams() {
    throw new Error('getRequiredContextParams() must be implemented by subclass');
  }

  /**
   * Common helper method for making MCP tool calls
   * @param {string} serverName - MCP server name
   * @param {string} toolName - Tool name to call
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool call result
   */
  async callMCPTool(serverName, toolName, args) {
    if (!this.mcpClientManager) {
      throw new Error('MCP client manager not available');
    }
    return await this.mcpClientManager.callTool(serverName, toolName, args);
  }

  /**
   * Discover available tools from an MCP server
   * @param {string} serverName - MCP server name
   * @returns {Promise<Array>} List of available tools
   */
  async discoverTools(serverName) {
    if (!this.mcpClientManager) {
      throw new Error('MCP client manager not available');
    }
    
    // Cache tools to avoid repeated discovery
    if (!this.toolCache) {
      this.toolCache = {};
    }
    
    if (this.toolCache[serverName]) {
      return this.toolCache[serverName];
    }
    
    try {
      const result = await this.mcpClientManager.listTools(serverName);
      
      // Handle different response formats
      let tools = [];
      if (Array.isArray(result)) {
        tools = result;
      } else if (result && result.tools && Array.isArray(result.tools)) {
        tools = result.tools;
      } else if (result && result.content && Array.isArray(result.content)) {
        tools = result.content;
      } else {
        console.warn(`Unexpected listTools response format from ${serverName}:`, result);
        tools = [];
      }
      
      this.toolCache[serverName] = tools;
      return tools;
    } catch (error) {
      throw new Error(`Failed to discover tools from ${serverName}: ${error.message}`);
    }
  }

  /**
   * Find tools by capability/purpose rather than exact name
   * @param {string} serverName - MCP server name
   * @param {string|Array} capabilities - Capability keywords to match
   * @returns {Promise<Array>} Matching tools
   */
  async findToolsByCapability(serverName, capabilities) {
    const tools = await this.discoverTools(serverName);
    const searchTerms = Array.isArray(capabilities) ? capabilities : [capabilities];
    
    return tools.filter(tool => {
      const toolText = `${tool.name} ${tool.description || ''}`.toLowerCase();
      return searchTerms.some(term => 
        toolText.includes(term.toLowerCase()) ||
        tool.name.toLowerCase().includes(term.toLowerCase())
      );
    });
  }

  /**
   * Find the best tool for a specific capability
   * @param {string} serverName - MCP server name
   * @param {string|Array} capabilities - Capability keywords to match
   * @returns {Promise<Object|null>} Best matching tool or null
   */
  async findBestToolForCapability(serverName, capabilities) {
    const matchingTools = await this.findToolsByCapability(serverName, capabilities);
    
    if (matchingTools.length === 0) {
      return null;
    }
    
    // Return the first match for now
    // Could implement more sophisticated scoring in the future
    return matchingTools[0];
  }

  /**
   * Find tools for file/repository analysis
   * @param {string} serverName - MCP server name (typically 'github')
   * @returns {Promise<Object|null>} Best tool for repository analysis
   */
  async findFileAnalysisTools(serverName) {
    const capabilities = [
      ['contents', 'file_contents', 'get_contents'],
      ['files', 'list_files', 'tree'],
      ['repository', 'repo_info', 'get_repository'],
      ['commits', 'history', 'list_commits'],
      ['branches', 'list_branches']
    ];

    for (const capabilityGroup of capabilities) {
      const tool = await this.findBestToolForCapability(serverName, capabilityGroup);
      if (tool) {
        return tool;
      }
    }
    
    return null;
  }

  /**
   * Find tools for GitHub issue creation
   * @param {string} serverName - MCP server name (typically 'github')
   * @returns {Promise<Object|null>} Best tool for issue creation
   */
  async findIssueCreationTools(serverName) {
    const capabilities = [
      ['create_issue', 'issue_create'],
      ['create', 'issue'],
      ['new_issue', 'add_issue']
    ];

    for (const capabilityGroup of capabilities) {
      const tool = await this.findBestToolForCapability(serverName, capabilityGroup);
      if (tool) {
        return tool;
      }
    }
    
    return null;
  }

  /**
   * Find tools for LLM operations
   * @param {string} serverName - MCP server name (typically 'litellm' or 'fastmcp')
   * @param {string} operation - Specific operation: 'chat', 'prompt', 'usage'
   * @returns {Promise<Object|null>} Best tool for the LLM operation
   */
  async findLLMTools(serverName, operation) {
    let capabilities = [];
    
    switch (operation) {
      case 'chat':
        capabilities = [
          ['chat_completion', 'llm_chat'],
          ['completion', 'chat'],
          ['generate', 'llm']
        ];
        break;
      case 'prompt':
        capabilities = [
          ['agent_prompt', 'create_prompt'],
          ['prompt', 'system_prompt'],
          ['template', 'prompt_template']
        ];
        break;
      case 'usage':
        capabilities = [
          ['get_usage', 'usage_stats'],
          ['usage', 'stats'],
          ['cost', 'billing']
        ];
        break;
      default:
        return null;
    }

    for (const capabilityGroup of capabilities) {
      const tool = await this.findBestToolForCapability(serverName, capabilityGroup);
      if (tool) {
        return tool;
      }
    }
    
    return null;
  }

  /**
   * Common helper method for logging interactions
   * @param {string} type - Interaction type
   * @param {string} content - Interaction content
   * @param {Object} metadata - Additional metadata
   */
  async logInteraction(type, content, metadata = {}) {
    if (!this.sessionService) {
      console.warn('Session service not available for logging');
      return;
    }
    await this.sessionService.logInteraction(type, content, {
      ...metadata,
      agent: this.getName()
    });
  }

  /**
   * Common helper method for error logging
   * @param {Error} error - Error to log
   * @param {Object} context - Error context
   */
  async logError(error, context = {}) {
    if (!this.sessionService) {
      console.error('Error:', error.message);
      return;
    }
    await this.sessionService.logError(error, {
      ...context,
      agent: this.getName()
    });
  }

  /**
   * Ensure context has required validation methods
   * Converts plain objects to AgentContext-like objects with validate() method
   * @param {Object} context - Plain object or AgentContext instance
   * @returns {Object} Context object with validate() method
   */
  ensureContextMethods(context) {
    // If already has validate method, return as-is
    if (context && typeof context.validate === 'function') {
      return context;
    }

    // Create a context-like object with validate method
    const enhancedContext = { ...context };
    
    enhancedContext.validate = function(requiredParams = []) {
      const missing = [];
      
      for (const param of requiredParams) {
        if (this[param] === undefined || this[param] === null) {
          missing.push(param);
        }
      }

      if (missing.length > 0) {
        throw new Error(`Missing required context parameters: ${missing.join(', ')}`);
      }

      return true;
    };

    enhancedContext.getRepository = function() {
      if (!this.repoOwner || !this.repoName) {
        throw new Error('Repository information not available in context');
      }
      return `${this.repoOwner}/${this.repoName}`;
    };

    return enhancedContext;
  }

  /**
   * Analyze repository structure using dynamic tool discovery
   * @param {Object} context - Enhanced context with repoOwner, repoName
   * @returns {Promise<Object>} Repository analysis result
   */
  async analyzeRepository(context) {
    console.log(chalk.blue('📁 Analyzing repository structure...'));
    
    try {
      // Discover available GitHub tools dynamically
      console.log(chalk.gray('🔍 Discovering available GitHub tools...'));
      const availableTools = await this.discoverTools('github');
      
      if (availableTools.length === 0) {
        console.log(chalk.yellow('⚠️ No tools discovered from GitHub MCP server. Using fallback analysis.'));
        return {
          structure: `Repository: ${context.repoOwner}/${context.repoName}\nAnalysis: Manual repository analysis needed - GitHub MCP server tools not available.`,
          tool_used: 'fallback',
          analyzed_at: new Date().toISOString()
        };
      }
      
      // Use new capability-based tool discovery
      const bestTool = await this.findFileAnalysisTools('github');
      
      if (!bestTool) {
        // Final fallback: use any available tool
        if (availableTools.length > 0) {
          console.log(chalk.yellow(`⚠️ Using first available tool: ${availableTools[0].name}`));
          return await this.analyzeRepositoryWithTool(context, availableTools[0]);
        }
        throw new Error('No suitable repository analysis tools found');
      }
      
      console.log(chalk.gray(`Using tool: ${bestTool.name}`));
      return await this.analyzeRepositoryWithTool(context, bestTool);
      
    } catch (error) {
      throw new Error(`Failed to analyze repository: ${error.message}`);
    }
  }

  /**
   * Analyze repository using a specific discovered tool
   * @param {Object} context - Enhanced context
   * @param {Object} tool - Tool object from discovery
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeRepositoryWithTool(context, tool) {
    try {
      // Prepare arguments based on common GitHub API patterns
      const args = {
        owner: context.repoOwner,
        repo: context.repoName
      };
      
      // Add token if available (check for config in subclasses)
      if (this.config?.github?.token) {
        args.token = this.config.github.token;
      }
      
      // Add tool-specific parameters based on name patterns and capabilities
      if (tool.name.includes('contents') || tool.name.includes('file')) {
        // For file contents tools, try comprehensive parameter combinations
        const parameterSets = [
          { },  // No additional params - sometimes tools work without path
          { path: '/' },  // Root directory
          { path: '' },  // Empty path string
          { path: '.', ref: 'main' },  // Current directory with main branch
          { path: '', ref: 'main' },  // Empty path with main branch
          { path: '', ref: 'master' },  // Empty path with master branch (fallback)
          { ref: 'main' },  // Just branch reference
          { ref: 'HEAD' },  // HEAD reference
        ];
        
        for (let i = 0; i < parameterSets.length; i++) {
          const params = parameterSets[i];
          try {
            const paramStr = Object.keys(params).length > 0 ? ` with ${JSON.stringify(params)}` : ' with no additional params';
            console.log(chalk.gray(`Calling ${tool.name}${paramStr}...`));
            const result = await this.callMCPTool('github', tool.name, { ...args, ...params });
            console.log(chalk.green(`✅ Repository analysis succeeded with ${tool.name}`));
            return this.formatRepositoryAnalysisResult(result, tool.name);
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Attempt ${i + 1}/${parameterSets.length} failed: ${error.message}`));
            if (i === parameterSets.length - 1) {
              // If all attempts fail, provide a fallback response
              console.log(chalk.red(`❌ All ${parameterSets.length} parameter combinations failed for ${tool.name}`));
              return {
                structure: `Repository: ${args.owner}/${args.repo}\nAnalysis failed after trying ${parameterSets.length} parameter combinations.\nLast error: ${error.message}\nNote: This may be due to repository permissions, private repository access, or API limits. Please check:\n1. Repository is public or you have access\n2. GitHub token has required permissions\n3. API rate limits are not exceeded`,
                tool_used: tool.name,
                error: error.message,
                attempts: parameterSets.length,
                analyzed_at: new Date().toISOString()
              };
            }
            continue; // Try next parameter set
          }
        }
      } else if (tool.name.includes('tree')) {
        // For tree tools, try different recursive and path combinations
        const treeParameterSets = [
          { path: '', recursive: true },
          { path: '', recursive: false },
          { recursive: true },
          { path: '/' },
          { },  // No additional params
        ];
        
        for (let i = 0; i < treeParameterSets.length; i++) {
          const params = treeParameterSets[i];
          try {
            const paramStr = Object.keys(params).length > 0 ? ` with ${JSON.stringify(params)}` : ' with no additional params';
            console.log(chalk.gray(`Calling ${tool.name}${paramStr}...`));
            const result = await this.callMCPTool('github', tool.name, { ...args, ...params });
            console.log(chalk.green(`✅ Repository tree analysis succeeded with ${tool.name}`));
            return this.formatRepositoryAnalysisResult(result, tool.name);
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Tree attempt ${i + 1}/${treeParameterSets.length} failed: ${error.message}`));
            if (i === treeParameterSets.length - 1) {
              throw new Error(`All tree parameter combinations failed: ${error.message}`);
            }
            continue;
          }
        }
      } else if (tool.name.includes('files') || tool.name.includes('list')) {
        // For listing tools, try various parameter combinations
        const listParameterSets = [
          { },  // No additional params
          { path: '' },
          { path: '/' },
          { path: '.', type: 'file' },
          { type: 'all' },
        ];
        
        for (let i = 0; i < listParameterSets.length; i++) {
          const params = listParameterSets[i];
          try {
            const paramStr = Object.keys(params).length > 0 ? ` with ${JSON.stringify(params)}` : ' with no additional params';
            console.log(chalk.gray(`Calling ${tool.name}${paramStr}...`));
            const result = await this.callMCPTool('github', tool.name, { ...args, ...params });
            console.log(chalk.green(`✅ Repository file list succeeded with ${tool.name}`));
            return this.formatRepositoryAnalysisResult(result, tool.name);
          } catch (error) {
            console.log(chalk.yellow(`⚠️ List attempt ${i + 1}/${listParameterSets.length} failed: ${error.message}`));
            if (i === listParameterSets.length - 1) {
              throw new Error(`All list parameter combinations failed: ${error.message}`);
            }
            continue;
          }
        }
      } else {
        // Default case - try the tool as-is, then with common parameters
        const defaultParameterSets = [
          { },  // No additional params
          { ref: 'main' },
          { ref: 'master' },
          { ref: 'HEAD' },
        ];
        
        for (let i = 0; i < defaultParameterSets.length; i++) {
          const params = defaultParameterSets[i];
          try {
            const paramStr = Object.keys(params).length > 0 ? ` with ${JSON.stringify(params)}` : ' with no additional params';
            console.log(chalk.gray(`Calling ${tool.name}${paramStr}...`));
            const result = await this.callMCPTool('github', tool.name, { ...args, ...params });
            console.log(chalk.green(`✅ Repository analysis succeeded with ${tool.name}`));
            return this.formatRepositoryAnalysisResult(result, tool.name);
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Default attempt ${i + 1}/${defaultParameterSets.length} failed: ${error.message}`));
            if (i === defaultParameterSets.length - 1) {
              throw new Error(`All default parameter combinations failed: ${error.message}`);
            }
            continue;
          }
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to analyze repository with ${tool.name}: ${error.message}`);
    }
  }

  /**
   * Format repository analysis result from different tool response formats
   * @param {Object} result - Raw tool result
   * @param {string} toolName - Name of the tool used
   * @returns {Object} Formatted analysis result
   */
  formatRepositoryAnalysisResult(result, toolName) {
    let structure = 'Repository analysis completed';
    
    if (result && result.content && Array.isArray(result.content) && result.content.length > 0) {
      structure = result.content.map(item => item.text || JSON.stringify(item)).join('\n');
    } else if (result && result.content && result.content.text) {
      structure = result.content.text;
    } else if (result && typeof result === 'string') {
      structure = result;
    } else if (result && result.data) {
      structure = JSON.stringify(result.data, null, 2);
    } else if (result) {
      // Fallback: stringify the entire result
      structure = JSON.stringify(result, null, 2);
    } else {
      structure = `No data returned from ${toolName} for repository analysis`;
    }

    return {
      structure,
      tool_used: toolName,
      analyzed_at: new Date().toISOString()
    };
  }

  /**
   * Create a GitHub issue using dynamic tool discovery
   * @param {Object} context - Enhanced context with repoOwner, repoName
   * @param {string} title - Issue title
   * @param {string} body - Issue body content
   * @param {Array} labels - Optional array of label strings
   * @returns {Promise<Object>} Issue creation result
   */
  async createRepositoryIssue(context, title, body, labels = []) {
    console.log(chalk.blue('🎫 Creating GitHub issue...'));
    
    try {
      // Find the best tool for issue creation
      const issueTool = await this.findIssueCreationTools('github');
      
      if (!issueTool) {
        throw new Error('No GitHub issue creation tools found');
      }
      
      console.log(chalk.gray(`Using tool: ${issueTool.name}`));
      
      // Prepare arguments for issue creation
      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        title: title,
        body: body
      };
      
      // Add optional parameters
      if (labels.length > 0) {
        args.labels = labels;
      }
      
      // Add token if available
      if (this.config?.github?.token) {
        args.token = this.config.github.token;
      }
      
      const result = await this.callMCPTool('github', issueTool.name, args);
      
      console.log(chalk.green('✅ GitHub issue created successfully'));
      
      return {
        title: title,
        tool_used: issueTool.name,
        result: result,
        created_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not create GitHub issue: ${error.message}`));
      return {
        title: title,
        error: error.message,
        created_at: new Date().toISOString()
      };
    }
  }

  /**
   * Generate agent prompt using dynamic tool discovery
   * @param {string} agentRole - Agent role (ba, developer, reviewer, architect, general)
   * @param {string} taskDescription - Description of the task
   * @param {string} context - Optional additional context
   * @returns {Promise<string>} Generated system prompt
   */
  async generateAgentPrompt(agentRole, taskDescription, context = '') {
    try {
      // For LLM tools, use known tool names since FastMCP server doesn't expose tools properly
      try {
        const result = await this.callMCPTool('fastmcp', 'llm_create_agent_prompt', {
          agent_role: agentRole,
          task_description: taskDescription,
          context: context
        });
        
        if (result && result.content && result.content[0]) {
          const promptData = JSON.parse(result.content[0].text);
          return promptData.system_prompt;
        }
      } catch (llmError) {
        console.log(chalk.yellow(`⚠️ LLM prompt tool failed: ${llmError.message}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Prompt generation tool failed, using fallback: ${error.message}`));
    }
    
    // Fallback system prompts
    const fallbackPrompts = {
      ba: "You are a Business Analyst AI assistant. Your role is to analyze requirements, create detailed specifications, and ensure business objectives are clearly defined. Focus on understanding user needs, identifying edge cases, and creating comprehensive documentation.",
      developer: "You are a Developer AI assistant. Your role is to write clean, efficient, and well-documented code. Follow best practices, consider edge cases, and ensure code is maintainable and scalable.",
      reviewer: "You are a Code Reviewer AI assistant. Your role is to review code for quality, security, performance, and adherence to best practices. Provide constructive feedback and suggestions for improvement.",
      architect: "You are a Software Architect AI assistant. Your role is to design scalable, maintainable systems and make high-level technical decisions. Consider system architecture, design patterns, and long-term maintainability.",
      general: "You are a helpful AI assistant focused on software development tasks."
    };
    
    return fallbackPrompts[agentRole] || fallbackPrompts.general;
  }

  /**
   * Get the appropriate model for an agent role with proper environment variable priority
   * Environment variables take precedence over config files, enabling .env overrides
   * @param {string} agentRole - Agent role (ba, developer, etc.)
   * @returns {string} Model name to use
   */
  getModelForAgent(agentRole) {
    // Priority order: Environment variables > config files > fallback default
    const envModelMap = {
      ba: process.env.OPENAI_BA_MODEL,
      developer: process.env.OPENAI_DEV_MODEL,
      tl: process.env.OPENAI_TL_MODEL,
      'tech-lead': process.env.OPENAI_TL_MODEL  // Support both 'tl' and 'tech-lead' agent roles
    };
    
    return envModelMap[agentRole] || 
           this.config?.models?.[agentRole] || 
           'gpt-5-nano';
  }

  /**
   * Generate LLM response using standardized pattern
   * @param {string} agentRole - Agent role for logging and model selection
   * @param {Function|string} systemPromptMethod - Method name or prompt string
   * @param {string} userContent - User message content
   * @param {Object} context - Enhanced context
   * @returns {Promise<Object>} LLM response with robust parsing
   */
  async generateLLMResponse(agentRole, systemPromptMethod, userContent, context) {
    console.log(chalk.blue(`🤖 Generating ${agentRole} response...`));

    try {
      // Get system prompt
      let systemPrompt;
      if (typeof systemPromptMethod === 'function') {
        systemPrompt = await systemPromptMethod.call(this);
      } else if (typeof systemPromptMethod === 'string') {
        systemPrompt = systemPromptMethod;
      } else {
        // Fallback system prompt
        systemPrompt = `You are a ${agentRole} AI assistant. Provide helpful and accurate responses based on the context provided.`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];

      // For LLM tools, use known tool names since FastMCP server doesn't expose tools properly
      const modelName = this.getModelForAgent(agentRole);
      const requestParams = {
        messages: messages,
        model: modelName,
        api_key: this.config?.llm?.api_key,
        base_url: this.config?.llm?.base_url,
        session_id: context.sessionId,
        agent_role: agentRole
      };
      
      // Only add temperature for models that support it (avoid gpt-5-nano issues)
      if (!modelName.includes('gpt-5-nano')) {
        requestParams.temperature = 0.7;
      }
      
      const completion = await this.callMCPTool('fastmcp', 'llm_chat_completion', requestParams);

      // Handle different LLM response formats with robust parsing
      let response;
      
      // Check if we have the nested FastMCP structure: { result: { content: [{ text: "..." }] } }
      if (completion && completion.result && completion.result.content && Array.isArray(completion.result.content) && completion.result.content[0]) {
        // FastMCP nested format: { result: { content: [{ text: "..." }] } }
        try {
          const parsed = JSON.parse(completion.result.content[0].text);
          // Extract the response field from the nested JSON
          if (parsed.response) {
            response = { content: parsed.response, usage: parsed.usage };
          } else {
            response = { content: parsed, usage: parsed.usage };
          }
        } catch (error) {
          // If JSON parsing fails, use the text directly
          response = { content: completion.result.content[0].text };
        }
      } else if (completion && completion.content && Array.isArray(completion.content) && completion.content[0]) {
        // MCP format: { content: [{ text: "..." }] }
        try {
          const parsed = JSON.parse(completion.content[0].text);
          // If the parsed response has a 'response' field, use that as content
          if (parsed.response) {
            response = { content: parsed.response, usage: parsed.usage };
          } else {
            response = parsed;
          }
        } catch (error) {
          // If JSON parsing fails, use the text directly
          response = { content: completion.content[0].text };
        }
      } else if (completion && completion.content && completion.content.text) {
        // Direct format: { content: { text: "..." } }
        try {
          const parsed = JSON.parse(completion.content.text);
          if (parsed.response) {
            response = { content: parsed.response, usage: parsed.usage };
          } else {
            response = parsed;
          }
        } catch (error) {
          response = { content: completion.content.text };
        }
      } else if (completion && typeof completion.content === 'string') {
        // String format: { content: "..." }
        try {
          const parsed = JSON.parse(completion.content);
          if (parsed.response) {
            response = { content: parsed.response, usage: parsed.usage };
          } else {
            response = parsed;
          }
        } catch (error) {
          response = { content: completion.content };
        }
      } else {
        // Fallback: use the entire completion
        console.log(chalk.yellow('⚠️ Using fallback parsing - unexpected response structure'));
        response = { 
          content: JSON.stringify(completion, null, 2),
          usage: completion.usage || {}
        };
      }
      
      // Format content for clean display
      const isVerbose = context.verbose || false;
      const formattedContent = this.formatLLMResponseForDisplay(
        response.content, 
        response.usage, 
        isVerbose
      );
      
      console.log(chalk.green(`\n📋 ${agentRole.toUpperCase()} Agent Response:`));
      console.log(formattedContent);

      return {
        content: response.content || 'No response content available',
        usage: response.usage || {},
        generated_at: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Failed to generate ${agentRole} response: ${error.message}`);
    }
  }

  /**
   * Format LLM response content for clean display
   * @param {string} rawContent - Raw LLM response content
   * @param {Object} usage - Usage statistics (optional)
   * @param {boolean} verbose - Whether to show detailed info
   * @returns {string} Formatted content for display
   */
  formatLLMResponseForDisplay(rawContent, usage = {}, verbose = false) {
    if (!rawContent) {
      return 'No response content available';
    }

    // Convert escaped newlines to actual newlines
    let formattedContent = rawContent.replace(/\\n/g, '\n');
    
    // Convert escaped quotes
    formattedContent = formattedContent.replace(/\\"/g, '"');
    
    // Convert escaped backslashes
    formattedContent = formattedContent.replace(/\\\\/g, '\\');
    
    // Remove any trailing/leading whitespace
    formattedContent = formattedContent.trim();
    
    // If verbose mode, add usage information at the end
    if (verbose && usage && Object.keys(usage).length > 0) {
      const tokens = usage.total_tokens || usage.completion_tokens || 0;
      const cost = usage.cost || usage.cost_estimate || 0;
      const model = usage.model || 'unknown';
      
      formattedContent += '\n\n' + chalk.gray('---') + '\n';
      formattedContent += chalk.gray(`💰 Usage: ${tokens} tokens, $${cost.toFixed(4)} (${model})`);
      
      if (usage.processing_time_ms) {
        formattedContent += chalk.gray(` • ${usage.processing_time_ms}ms`);
      }
    }
    
    return formattedContent;
  }

  /**
   * Get GitHub issue details using dynamic tool discovery
   * @param {Object} context - Enhanced context
   * @param {number} issueNumber - Issue number to fetch
   * @returns {Promise<Object>} Issue details
   */
  async getGitHubIssue(context, issueNumber) {
    console.log(chalk.blue(`📋 Fetching issue #${issueNumber} details...`));
    
    try {
      // Find tools for getting issue details
      const issueTools = await this.findToolsByCapability('github', ['get_issue', 'issue']);
      
      if (issueTools.length === 0) {
        throw new Error('No GitHub issue tools found');
      }

      const tool = issueTools[0];
      console.log(chalk.gray(`Using tool: ${tool.name}`));

      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        issue_number: issueNumber
      };

      // Add token if available
      if (this.config?.github?.token) {
        args.token = this.config.github.token;
      }

      const result = await this.callMCPTool('github', tool.name, args);
      
      // Parse the result based on different formats
      let issueData;
      if (result && result.content && Array.isArray(result.content) && result.content[0]) {
        try {
          issueData = JSON.parse(result.content[0].text);
        } catch (error) {
          issueData = result.content[0];
        }
      } else if (result && result.content && result.content.text) {
        try {
          issueData = JSON.parse(result.content.text);
        } catch (error) {
          issueData = result.content;
        }
      } else {
        issueData = result;
      }
      
      return {
        title: issueData.title || 'Unknown Title',
        body: issueData.body || 'No description available',
        state: issueData.state || 'unknown',
        labels: issueData.labels || [],
        tool_used: tool.name,
        fetched_at: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Failed to fetch issue details: ${error.message}`);
    }
  }

  /**
   * Log completion and cost information (unified from both agents)
   * @param {Object} context - Enhanced context
   */
  async logCompletion(context) {
    try {
      // For LLM tools, use known tool names since FastMCP server doesn't expose tools properly
      let usageData = { total_cost: 0, total_tokens: 0 };
      
      try {
        const usage = await this.callMCPTool('fastmcp', 'llm_get_usage', {});
        // Parse usage data with robust error handling
        if (usage && usage.content && Array.isArray(usage.content) && usage.content[0]) {
          try {
            usageData = JSON.parse(usage.content[0].text);
          } catch (error) {
            // Keep default values on parse error
          }
        }
      } catch (usageError) {
        console.log(chalk.yellow(`⚠️ Usage tracking failed: ${usageError.message}`));
      }
      
      console.log(chalk.gray(`\\n💰 Session cost: $${usageData.total_cost.toFixed(4)} (${usageData.total_tokens} tokens)`));
      
      await this.logInteraction('cost_summary', 'Session cost calculated', {
        total_cost: usageData.total_cost,
        total_tokens: usageData.total_tokens,
        session_id: context.sessionId
      });
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not retrieve usage information'));
    }
  }
}

/**
 * Common execution context structure
 */
export class AgentContext {
  constructor({ sessionId, repoOwner, repoName, ...additionalParams }) {
    this.sessionId = sessionId;
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    this.startTime = new Date().toISOString();
    
    // Add any additional parameters
    Object.assign(this, additionalParams);
  }

  validate(requiredParams = []) {
    const missing = [];
    
    for (const param of requiredParams) {
      if (this[param] === undefined || this[param] === null) {
        missing.push(param);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required context parameters: ${missing.join(', ')}`);
    }

    return true;
  }

  getRepository() {
    if (!this.repoOwner || !this.repoName) {
      throw new Error('Repository information not available in context');
    }
    return `${this.repoOwner}/${this.repoName}`;
  }
}

/**
 * Common agent result structure
 */
export class AgentResult {
  constructor(success = false, data = null, message = '') {
    this.success = success;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }

  static success(data, message = 'Operation completed successfully') {
    return new AgentResult(true, data, message);
  }

  static error(message, data = null) {
    return new AgentResult(false, data, message);
  }
}