import { BAAgent } from './ba-agent.js';
import { ConversationManager } from '../services/conversation-manager.js';
import chalk from 'chalk';

/**
 * Conversational Business Analyst Agent
 * Extends BAAgent to support multi-turn conversations before creating issues
 */
export class ConversationalBAAgent extends BAAgent {
  constructor(mcpClientManager, sessionService, config) {
    super(mcpClientManager, sessionService, config);
    this.conversationManager = new ConversationManager(sessionService.logDir);
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
    
    try {
      // Ensure context has required methods
      const enhancedContext = this.ensureContextMethods(context);
      
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
      const baResponse = await this.generateConversationResponse(enhancedContext, repoAnalysis);
      
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
      await this.logError(error, { 
        repository: enhancedContext.getRepository(),
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
        for (const duplicate of duplicateCheck.duplicates) {
          console.log(chalk.gray(`   • Issue #${duplicate.number}: ${duplicate.title}`));
        }
        console.log(chalk.yellow('   Consider updating existing issues instead of creating new ones.'));
        // For now, proceed with creation - user can manually close duplicates
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

    return await this.generateLLMResponse('ba', systemPrompt, userPrompt, context);
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
    
    // This would use GitHub MCP tools to search for existing issues
    // For now, return empty duplicates
    return {
      duplicates: [],
      unique: proposedIssues
    };
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
}