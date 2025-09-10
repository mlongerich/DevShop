import { BAAgent } from './ba-agent.js';
import { ConversationManager } from '../services/conversation-manager.js';
import { AgentCommunicationService } from '../services/agent-communication-service.js';
import { TLCommand } from '../commands/tl-command.js';
import chalk from 'chalk';

/**
 * Conversational Business Analyst Agent
 * Extends BAAgent to support multi-turn conversations before creating issues
 */
export class ConversationalBAAgent extends BAAgent {
  constructor(mcpClientManager, sessionService, config, options = {}) {
    super(mcpClientManager, sessionService, config);
    this.conversationManager = new ConversationManager(sessionService.logDir);
    
    // Multi-agent support
    this.multiAgentMode = options.multiAgent || false;
    this.techLeadAgent = options.techLeadAgent || null;
    this.interactiveMode = options.interactive || false;
    
    // Create TL command for ADR generation (if not provided)
    if (this.multiAgentMode && !options.tlCommand && config) {
      // Create a config service mock for TL command
      const configService = { getConfig: () => config };
      this.tlCommand = new TLCommand(configService, sessionService, mcpClientManager);
    } else {
      this.tlCommand = options.tlCommand || null;
    }
    
    // Create communication service with interactive mode
    this.agentCommunicationService = new AgentCommunicationService(
      sessionService.logDir, 
      sessionService,
      {
        interactive: this.interactiveMode,
        verboseCollaboration: options.verboseCollaboration || false
      }
    );
  }

  getName() {
    return 'conversational-ba';
  }

  getDescription() {
    return 'Conversational Business Analyst agent for multi-turn requirements gathering';
  }

  /**
   * Start a new conversation
   * @param {Object} context - Initial context with repo info and user input
   * @returns {Promise<Object>} Initial conversation response with session ID
   */
  async startConversation(context) {
    console.log(chalk.cyan(`\n🗣️  Starting conversation for ${context.repoOwner}/${context.repoName}`));
    
    
    // Declare enhancedContext outside try block so it's accessible in catch
    let enhancedContext;
    
    try {
      // Ensure context has required methods with proper error handling
      try {
        enhancedContext = this.ensureContextMethods(context);
      } catch (contextError) {
        console.error(chalk.red(`[ERROR] Failed to enhance context: ${contextError.message}`));
        console.error(chalk.red(`[ERROR] Context error stack: ${contextError.stack}`));
        throw new Error(`Context enhancement failed: ${contextError.message}`);
      }
      
      // Initialize conversation state
      await this.conversationManager.initializeConversation(enhancedContext.sessionId, enhancedContext);
      
      // Store initial user input
      await this.conversationManager.storeConversationTurn(
        enhancedContext.sessionId, 
        'user', 
        enhancedContext.initialInput, 
        0
      );

      // Check for similar issues/conversations before proceeding
      await this.checkSimilarIssuesAndConversations();

      // Analyze repository for context
      const repoAnalysis = await this.analyzeRepository(enhancedContext);
      
      // Generate initial BA response with conversation awareness
      const baResponse = await this.generateConversationResponse(enhancedContext, repoAnalysis, null);
      
      await this.logInteraction('conversation_started', 'Started conversation', {
        repository: enhancedContext.getRepository(),
        initial_input: enhancedContext.initialInput,
        session_id: enhancedContext.sessionId
      });

      return {
        sessionId: enhancedContext.sessionId,
        response: baResponse.content,
        cost: baResponse.usage?.cost || 0,
        state: 'gathering',
        turnCount: 1
      };

    } catch (error) {
      // Use enhancedContext if available, otherwise fall back to original context
      const contextForLogging = enhancedContext || context;
      await this.logError(error, { 
        repository: contextForLogging.getRepository ? contextForLogging.getRepository() : `${context.repoOwner}/${context.repoName}`,
        operation: 'start_conversation'
      });
      throw new Error(`Failed to start conversation: ${error.message}`);
    }
  }

  /**
   * Continue an existing conversation
   * @param {Object} context - Context with session ID and user input
   * @returns {Promise<Object>} Conversation response
   */
  async continueConversation(context) {
    console.log(chalk.cyan(`\n💬 Continuing conversation (Session: ${context.sessionId})`));
    
    try {
      // Verify conversation exists
      const conversationExists = await this.conversationManager.conversationExists(context.sessionId);
      if (!conversationExists) {
        throw new Error(`Conversation ${context.sessionId} not found. Start a new conversation with --conversation flag.`);
      }

      // Store user input
      await this.conversationManager.storeConversationTurn(
        context.sessionId,
        'user', 
        context.userInput,
        0
      );

      // Get conversation context for LLM
      const conversationContext = await this.conversationManager.getConversationContext(context.sessionId);
      
      // Generate contextual response
      const baResponse = await this.generateConversationResponse(context, null, conversationContext);
      
      // Store BA response with cost
      await this.conversationManager.storeConversationTurn(
        context.sessionId,
        'ba',
        baResponse.content,
        baResponse.usage?.cost || 0
      );

      // Update conversation state based on response content
      const newState = this.determineConversationState(baResponse.content, conversationContext);
      if (newState !== conversationContext.state) {
        await this.conversationManager.updateConversationState(context.sessionId, newState);
      }

      await this.logInteraction('conversation_continued', 'Continued conversation', {
        session_id: context.sessionId,
        turn_count: conversationContext.turnCount + 1,
        user_input: context.userInput
      });

      return {
        sessionId: context.sessionId,
        response: baResponse.content,
        cost: baResponse.usage?.cost || 0,
        turnCost: baResponse.usage?.cost || 0,
        totalCost: conversationContext.totalCost + (baResponse.usage?.cost || 0),
        state: newState,
        turnCount: conversationContext.turnCount + 1
      };

    } catch (error) {
      await this.logError(error, { 
        session_id: context.sessionId,
        operation: 'continue_conversation'
      });
      throw error;
    }
  }

  /**
   * Finalize conversation and create GitHub issues immediately
   * @param {Object} context - Context with session ID
   * @returns {Promise<Object>} Finalization result with created issues
   */
  async finalizeConversation(context) {
    console.log(chalk.cyan(`\n✅ Finalizing conversation (Session: ${context.sessionId})`));
    
    try {
      const conversationContext = await this.conversationManager.getConversationContext(context.sessionId);
      
      // Generate final issues based on conversation
      const proposedIssues = await this.proposeIssuesFromConversation(conversationContext);
      
      if (proposedIssues.length === 0) {
        throw new Error('No issues could be generated from this conversation. Please provide more details about what you want to accomplish.');
      }

      // Check for duplicates before creating
      const duplicateCheck = await this.checkForDuplicateIssues(proposedIssues);
      let issuesToCreate = proposedIssues;
      
      if (duplicateCheck.duplicates.length > 0) {
        console.log(chalk.yellow('\n⚠️  Found similar existing issues:'));
        for (const duplicateInfo of duplicateCheck.duplicates) {
          const { proposed, existing } = duplicateInfo;
          console.log(chalk.gray(`   • Proposed: "${proposed.title}"`));
          console.log(chalk.gray(`     Similar to Issue #${existing.number}: "${existing.title}"`));
          console.log(chalk.gray(`     Similarity: ${existing.similarity}% - ${existing.url}`));
          console.log('');
        }
        console.log(chalk.yellow('   📝 Consider updating existing issues instead of creating new ones.'));
        console.log(chalk.yellow('   🤔 Proceeding with creation - you can manually review and close duplicates if needed.'));
      }

      // Create issues immediately as requested
      const createdIssues = [];
      let totalCreationCost = 0;

      for (const issue of issuesToCreate) {
        try {
          const issueResult = await this.createRepositoryIssue(
            context,
            issue.title,
            issue.body,
            issue.labels || ['enhancement', 'conversation-generated']
          );
          
          createdIssues.push({
            title: issue.title,
            number: issueResult.number || 'unknown',
            url: issueResult.url || 'unknown'
          });
          
          // Small cost for each issue creation
          totalCreationCost += 0.001;
          
        } catch (error) {
          console.log(chalk.red(`Failed to create issue "${issue.title}": ${error.message}`));
        }
      }

      // Update conversation with final state
      await this.conversationManager.updateConversationState(context.sessionId, 'finalized');
      
      await this.logInteraction('conversation_finalized', 'Finalized conversation and created issues', {
        session_id: context.sessionId,
        issues_created: createdIssues.length,
        total_cost: conversationContext.totalCost + totalCreationCost
      });

      return {
        sessionId: context.sessionId,
        createdIssues,
        totalIssues: createdIssues.length,
        totalCost: conversationContext.totalCost + totalCreationCost,
        conversationTurns: conversationContext.turnCount,
        duplicatesFound: duplicateCheck.duplicates.length
      };

    } catch (error) {
      await this.logError(error, { 
        session_id: context.sessionId,
        operation: 'finalize_conversation'
      });
      throw error;
    }
  }

  /**
   * Generate conversation-aware response using LLM
   * @param {Object} context - Current context
   * @param {Object} repoAnalysis - Repository analysis (if available)
   * @param {Object} conversationContext - Full conversation context
   * @returns {Promise<Object>} LLM response with content and usage
   */
  async generateConversationResponse(context, repoAnalysis, conversationContext) {
    const isInitial = !conversationContext;
    let systemPrompt, userPrompt;
    
    if (isInitial) {
      // Initial conversation system prompt
      systemPrompt = `You are a Business Analyst conducting requirements gathering. Your goal is to understand the user's needs through conversation before creating GitHub issues.

Guidelines:
- Ask 1-2 clarifying questions at a time (don't overwhelm)
- Be conversational and professional
- Focus on understanding the problem and desired outcomes
- Don't create issues yet - gather requirements first
- Build understanding gradually through multiple turns

Repository context will be provided to help you ask relevant questions.`;

      userPrompt = `I need help with a project in the repository ${context.repoOwner}/${context.repoName}.

User request: "${context.initialInput}"

Repository analysis:
${repoAnalysis?.structure || 'Repository analysis not available'}

Please start our requirements gathering conversation by asking relevant clarifying questions to understand what the user wants to accomplish.`;

    } else {
      // Continuation conversation system prompt  
      systemPrompt = `You are a Business Analyst in an ongoing requirements gathering conversation. Continue the conversation naturally based on the history provided.

Guidelines:
- Reference previous conversation turns naturally
- Ask follow-up questions based on what you've learned
- When you have enough information, propose specific GitHub issues
- Be conversational and build on the existing context
- Progress toward creating concrete, actionable issues

Current conversation state: ${conversationContext.state}`;

      // Format conversation history for context
      const historyText = conversationContext.history.map(turn => 
        `${turn.speaker === 'user' ? 'User' : 'BA'}: ${turn.message}`
      ).join('\n');

      userPrompt = `Conversation history:
${historyText}

Latest user input: "${context.userInput}"

Please continue the conversation by responding to the user's latest input while building on our previous discussion.`;
    }

    // Generate initial BA response
    const sessionContext = conversationContext ? { sessionId: conversationContext.sessionId } : { sessionId: context.sessionId };
    const baResponse = await this.generateLLMResponse('ba', systemPrompt, userPrompt, sessionContext);
    
    // If in multi-agent mode, check if we need technical input
    if (this.multiAgentMode && this.techLeadAgent && this.needsTechnicalInput(baResponse.content)) {
      console.log(chalk.blue('\n🔍 BA detected technical questions, consulting Tech Lead...'));
      
      try {
        // Show what questions BA is sending to TL
        const technicalQuestions = this.extractTechnicalQuestions(baResponse.content, conversationContext);
        
        if (this.interactiveMode) {
          console.log(chalk.cyan('\n📋 Questions being sent to Tech Lead:'));
          console.log(chalk.white(`"${technicalQuestions}"`));
          console.log(chalk.gray('\n🏗️  Tech Lead processing... (this may take up to 90 seconds)'));
        }
        
        // Get technical answers from TL agent
        const techAnswers = await this.consultTechLead(context, baResponse.content, conversationContext);
        
        if (techAnswers) {
          // Show TL response before integration (in interactive mode)
          if (this.interactiveMode) {
            // Note: Full TL response is already shown by AgentCommunicationService.displayExchange()
            // Just add integration step indicator
            console.log(chalk.blue('\n🔄 Integrating technical guidance into business response...'));
          }
          
          // Integrate tech answers into BA response
          const enhancedResponse = await this.integrateTechnicalAnswers(baResponse.content, techAnswers, context);
          
          // Store the agent collaboration in conversation
          if (conversationContext) {
            await this.conversationManager.storeConversationTurn(
              context.sessionId,
              'system',
              `BA consulted TL: ${techAnswers.substring(0, 100)}...`,
              0,
              { agent_collaboration: true, ba_question: true, tl_response: true }
            );
          }
          
          // Show completion message in interactive mode
          if (this.interactiveMode) {
            console.log(chalk.green('\n✅ BA + TL collaboration complete'));
          }
          
          return {
            content: enhancedResponse,
            usage: baResponse.usage // Keep original usage for cost tracking
          };
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Tech Lead consultation failed: ${error.message}`));
        // Continue with original BA response if TL consultation fails
      }
    }

    return baResponse;
  }

  /**
   * Determine conversation state based on BA response content
   * @param {string} responseContent - BA response content
   * @param {Object} conversationContext - Current conversation context
   * @returns {string} New conversation state
   */
  determineConversationState(responseContent, conversationContext) {
    const content = responseContent.toLowerCase();
    
    // Check if BA is proposing issues
    if (content.includes('propose') || content.includes('create these issues') || content.includes('github issue')) {
      return 'proposing';
    }
    
    // Check if asking clarifying questions
    if (content.includes('?') && conversationContext.turnCount < 3) {
      return 'clarifying';
    }
    
    // Default based on turn count
    if (conversationContext.turnCount >= 5) {
      return 'ready_to_finalize';
    }
    
    return 'gathering';
  }

  /**
   * Check for similar issues and conversations before starting
   * @returns {Promise<void>}
   */
  async checkSimilarIssuesAndConversations() {
    // This would use GitHub MCP tools to search for similar issues
    // For now, log that we should implement this
    console.log(chalk.gray('🔍 Checking for similar issues and conversations...'));
    
    // Future implementation would:
    // 1. Search GitHub issues with keywords from user input
    // 2. Search existing conversation sessions
    // 3. Present options to user if duplicates found
    
    return { similar: [] };
  }

  /**
   * Check for duplicate issues before creation
   * @param {Array} proposedIssues - Issues to check for duplicates
   * @returns {Promise<Object>} Duplicate check results
   */
  async checkForDuplicateIssues(proposedIssues) {
    console.log(chalk.gray('🔍 Checking for duplicate issues...'));
    
    try {
      // Get GitHub repository info from context
      const context = this.context || {};
      if (!context.repoOwner || !context.repoName) {
        console.log(chalk.yellow('⚠️ No repository context available for duplicate checking'));
        return { duplicates: [], unique: proposedIssues };
      }

      const duplicates = [];
      const unique = [];

      // Search for each proposed issue
      for (const proposedIssue of proposedIssues) {
        const isDuplicate = await this.searchForSimilarIssue(
          context.repoOwner,
          context.repoName,
          proposedIssue.title,
          proposedIssue.body
        );

        if (isDuplicate) {
          duplicates.push({
            proposed: proposedIssue,
            existing: isDuplicate
          });
        } else {
          unique.push(proposedIssue);
        }
      }

      if (duplicates.length > 0) {
        console.log(chalk.yellow(`⚠️ Found ${duplicates.length} potential duplicate(s)`));
      } else {
        console.log(chalk.green('✅ No duplicates found'));
      }

      return { duplicates, unique };

    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not check for duplicates: ${error.message}`));
      // Fail gracefully - return all as unique if duplicate checking fails
      return { duplicates: [], unique: proposedIssues };
    }
  }

  /**
   * Search for similar existing issues using GitHub API
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name  
   * @param {string} title - Proposed issue title
   * @param {string} body - Proposed issue body
   * @returns {Promise<Object|null>} Existing issue if found, null otherwise
   */
  async searchForSimilarIssue(owner, repo, title, body) {
    try {
      // Get GitHub tools from MCP client
      const tools = await this.mcpClientManager.listTools('github');
      const searchTool = tools.find(tool => 
        tool.name.includes('search') || 
        tool.name.includes('issues') || 
        tool.name.includes('list')
      );

      if (!searchTool) {
        console.log(chalk.gray('No GitHub search tools available'));
        return null;
      }

      // Extract key terms from title for search
      const searchTerms = this.extractSearchTerms(title);
      const query = `${searchTerms} repo:${owner}/${repo} type:issue state:open`;

      // Search for existing issues
      const searchArgs = {
        owner,
        repo, 
        q: query,
        sort: 'relevance',
        order: 'desc',
        per_page: 10
      };

      const searchResult = await this.mcpClientManager.callTool('github', searchTool.name, searchArgs);
      
      if (searchResult?.items?.length > 0) {
        // Check for similarity using title comparison
        for (const existingIssue of searchResult.items) {
          const similarity = this.calculateTitleSimilarity(title, existingIssue.title);
          
          // Consider it a duplicate if similarity > 70%
          if (similarity > 0.7) {
            return {
              number: existingIssue.number,
              title: existingIssue.title,
              url: existingIssue.html_url,
              similarity: Math.round(similarity * 100)
            };
          }
        }
      }

      return null;

    } catch (error) {
      console.log(chalk.gray(`Could not search for similar issues: ${error.message}`));
      return null;
    }
  }

  /**
   * Extract key search terms from issue title
   * @param {string} title - Issue title
   * @returns {string} Search terms
   */
  extractSearchTerms(title) {
    // Remove common words and extract key terms
    const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as'];
    const words = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    return words.slice(0, 5).join(' '); // Use top 5 key terms
  }

  /**
   * Calculate similarity between two titles using simple word overlap
   * @param {string} title1 - First title
   * @param {string} title2 - Second title  
   * @returns {number} Similarity score between 0 and 1
   */
  calculateTitleSimilarity(title1, title2) {
    const words1 = new Set(title1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
    const words2 = new Set(title2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Generate GitHub issues from conversation history
   * @param {Object} conversationContext - Full conversation context
   * @returns {Promise<Array>} Array of proposed issue objects
   */
  async proposeIssuesFromConversation(conversationContext) {
    const historyText = conversationContext.history.map(turn => 
      `${turn.speaker === 'user' ? 'User' : 'BA'}: ${turn.message}`
    ).join('\n\n');

    const systemPrompt = `You are a Business Analyst creating GitHub issues based on a requirements gathering conversation.

Analyze the conversation and create 1-3 specific, actionable GitHub issues. Each issue should:
- Have a clear, descriptive title
- Include detailed description with acceptance criteria
- Be focused on a single feature or task
- Include context from the conversation

Format your response as JSON with this structure:
{
  "issues": [
    {
      "title": "Clear, descriptive title",
      "body": "# Description\\n\\nDetailed description...\\n\\n## Acceptance Criteria\\n\\n- [ ] Criterion 1\\n- [ ] Criterion 2",
      "labels": ["enhancement", "conversation-generated"]
    }
  ]
}`;

    const userPrompt = `Based on this requirements gathering conversation, create specific GitHub issues:

${historyText}

Repository: ${conversationContext.repo}

Generate actionable GitHub issues that address the user's needs as discussed in this conversation.`;

    const response = await this.generateLLMResponse('ba', systemPrompt, userPrompt, { sessionId: conversationContext.sessionId });
    
    try {
      const parsed = JSON.parse(response.content);
      return parsed.issues || [];
    } catch (error) {
      // Fallback: create a single issue with the full conversation context
      return [{
        title: 'Requirements from BA Conversation',
        body: `# Requirements Analysis\n\nBased on conversation session ${conversationContext.sessionId}:\n\n${historyText}`,
        labels: ['enhancement', 'conversation-generated']
      }];
    }
  }

  /**
   * Display conversation history
   * @param {string} sessionId - Session ID
   * @param {boolean} includeCost - Whether to show cost information
   * @returns {Promise<void>}
   */
  async displayConversationHistory(sessionId, includeCost = false) {
    const formatted = await this.conversationManager.formatConversationHistory(sessionId, includeCost);
    console.log(formatted);
  }

  // Multi-Agent Collaboration Methods

  /**
   * Detect if BA response contains technical questions that need TL input
   * @param {string} response - BA response content
   * @returns {boolean} True if technical input needed
   */
  needsTechnicalInput(response) {
    const technicalKeywords = [
      // Tech stack questions
      'tech stack', 'language', 'framework', 'technology',
      
      // Testing specific
      'testing framework', 'test runner', 'jest', 'pytest', 'junit',
      'coverage', 'mocking', 'test data', 'fixtures',
      
      // Development workflow
      'ci/cd', 'github actions', 'pipeline', 'deployment',
      'build tool', 'package manager', 'dependencies',
      
      // Architecture questions
      'architecture', 'design patterns', 'best practices',
      'performance', 'security', 'scalability',
      
      // Specific tooling
      'what.*use', 'which.*tool', 'how.*run', 'what.*setup'
    ];

    const responseText = response.toLowerCase();
    
    // Check for technical question patterns
    return technicalKeywords.some(keyword => responseText.includes(keyword)) ||
           // Check for question patterns about technical topics
           (responseText.includes('?') && technicalKeywords.some(keyword => 
             responseText.includes(keyword)
           ));
  }

  /**
   * Consult Tech Lead agent for technical answers to BA questions
   * @param {Object} context - Current conversation context
   * @param {string} baResponse - BA response with technical questions
   * @param {Object} conversationContext - Full conversation context
   * @returns {Promise<string>} TL technical answers
   */
  async consultTechLead(context, baResponse, conversationContext) {
    try {
      // Initialize agent communication if needed
      if (!await this.agentCommunicationService.communicationExists(context.sessionId)) {
        await this.agentCommunicationService.initializeCommunication(
          context.sessionId,
          'ba',
          'tl',
          { 
            repository: `${context.repoOwner}/${context.repoName}`,
            task: 'technical_consultation',
            conversation_context: conversationContext ? conversationContext.state : 'initial'
          }
        );
      }

      // Extract technical questions from BA response
      const technicalQuestions = this.extractTechnicalQuestions(baResponse, conversationContext);
      
      // Create options for TL command execution (standalone analysis, not session-based)
      const tlOptions = {
        repo: `${context.repoOwner}/${context.repoName}`,
        description: technicalQuestions,
        multiAgent: this.multiAgentMode, // This will trigger ADR generation
        focusArea: this.detectTechnicalFocus(technicalQuestions),
        verbose: this.interactiveMode
        // Note: No session option to trigger standalone analysis instead of collaboration
      };

      // Use TL command instead of direct agent call to ensure ADR generation
      let tlResult;
      if (this.tlCommand) {
        tlResult = await this.tlCommand.execute(tlOptions);
      } else if (this.techLeadAgent && this.techLeadAgent.ensureContextMethods) {
        // Fallback to direct agent call
        const tlContext = {
          sessionId: context.sessionId,
          repoOwner: context.repoOwner,
          repoName: context.repoName,
          description: technicalQuestions,
          taskType: 'ba_consultation',
          focusArea: this.detectTechnicalFocus(technicalQuestions)
        };
        const enhancedTlContext = this.techLeadAgent.ensureContextMethods(tlContext);
        tlResult = await this.techLeadAgent.execute(enhancedTlContext);
      } else {
        throw new Error('Neither TL command nor TL agent available for consultation');
      }

      // Send BA question to TL via communication service
      await this.agentCommunicationService.sendMessage(
        context.sessionId,
        'ba',
        'tl', 
        'question',
        technicalQuestions,
        { 
          cost: tlResult.cost || 0,
          focus_area: this.detectTechnicalFocus(technicalQuestions),
          consultation_type: 'ba_technical_questions'
        }
      );

      // Process TL response via communication service
      const tlResponse = tlResult.summary || tlResult.technical_analysis || 'Technical analysis completed';
      
      await this.agentCommunicationService.processMessage(
        context.sessionId,
        'tl',
        tlResponse,
        { 
          cost: tlResult.cost || 0,
          response_type: 'technical_answers' 
        }
      );

      console.log(chalk.green('✅ Tech Lead consultation completed'));
      
      return tlResponse;
      
    } catch (error) {
      console.log(chalk.red(`❌ TL consultation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Extract technical questions from BA response
   * @param {string} baResponse - BA response content
   * @param {Object} conversationContext - Conversation context
   * @returns {string} Extracted technical questions
   */
  extractTechnicalQuestions(baResponse, conversationContext) {
    // Split response into sentences and find technical questions
    const sentences = baResponse.split(/[.!?]+/).filter(s => s.trim());
    const technicalSentences = sentences.filter(sentence => 
      sentence.includes('?') && this.needsTechnicalInput(sentence)
    );

    if (technicalSentences.length > 0) {
      return technicalSentences.join(' ') + 
        (conversationContext ? `\n\nContext: User wants to ${conversationContext.history[0]?.message}` : '');
    }

    // Fallback: ask TL to help with the general technical aspects
    const userRequest = conversationContext ? 
      conversationContext.history.find(turn => turn.speaker === 'user')?.message : 
      'technical implementation';
      
    return `Please provide technical guidance for: ${userRequest}. What are the recommended approaches, tools, and best practices?`;
  }

  /**
   * Detect technical focus area from questions
   * @param {string} questions - Technical questions
   * @returns {string} Focus area
   */
  detectTechnicalFocus(questions) {
    const text = questions.toLowerCase();
    
    if (text.includes('test') || text.includes('coverage')) return 'testing';
    if (text.includes('deploy') || text.includes('ci') || text.includes('pipeline')) return 'deployment';
    if (text.includes('performance') || text.includes('scale')) return 'performance';
    if (text.includes('security') || text.includes('auth')) return 'security';
    if (text.includes('database') || text.includes('data')) return 'data';
    if (text.includes('api') || text.includes('service')) return 'api';
    if (text.includes('ui') || text.includes('frontend')) return 'frontend';
    
    return 'general';
  }

  /**
   * Integrate TL technical answers into BA response
   * @param {string} baResponse - Original BA response
   * @param {string} tlAnswers - TL technical answers
   * @param {Object} context - Current context
   * @returns {string} Enhanced response with TL answers integrated
   */
  async integrateTechnicalAnswers(baResponse, tlAnswers, context) {
    // Use LLM to naturally integrate the technical answers
    const systemPrompt = 'You are helping integrate business and technical perspectives in a conversation.';
    const integrationPrompt = `You are a Business Analyst who just received technical expertise from a Tech Lead. 
Integrate the technical answers naturally into your business analysis response.

Original BA Response:
${baResponse}

Tech Lead Answers:
${tlAnswers}

Please provide a cohesive response that:
1. Maintains the conversational BA tone
2. Incorporates the technical guidance naturally
3. Continues to focus on requirements gathering
4. Doesn't overwhelm the user with too much technical detail
5. Shows collaboration between BA and TL perspectives

Keep the business analyst voice while including the technical insights.`;

    try {
      const integrationResponse = await this.generateLLMResponse('ba', systemPrompt, integrationPrompt, context);
      return integrationResponse.content;
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Response integration failed, using TL answers directly`));
      // Fallback: append TL answers with clear attribution
      return `${baResponse}\n\n---\n\n**Tech Lead Input:** ${tlAnswers}`;
    }
  }
}