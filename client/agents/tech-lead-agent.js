import { BaseAgent, AgentResult } from './base-agent.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tech Lead Agent
 * Focuses on technical analysis, architecture decisions, and implementation planning
 * Part of the multi-agent BA-TL system for separation of concerns
 */
export class TechLeadAgent extends BaseAgent {
  constructor(mcpClientManager, sessionService, config) {
    super(mcpClientManager, sessionService);
    this.config = config;
  }

  getName() {
    return 'tech-lead';
  }

  getDescription() {
    return 'Tech Lead AI agent focused on technical analysis, architecture decisions, and implementation planning';
  }

  getRequiredContextParams() {
    return ['sessionId', 'repoOwner', 'repoName'];
  }

  validateContext(context) {
    // Context is already enhanced when called from execute method
    return context.validate(this.getRequiredContextParams());
  }

  /**
   * Execute tech lead analysis workflow
   * @param {Object} context - Enhanced context
   * @returns {Promise<Object>} Tech lead analysis result
   */
  async execute(context) {
    console.log(chalk.blue('🏗️ Starting Tech Lead Analysis...'));

    try {
      // Ensure context has required methods
      const enhancedContext = this.ensureContextMethods(context);
      
      // Validate context
      this.validateContext(enhancedContext);

      await this.logInteraction('tl_analysis_start', 'Tech Lead analysis started', {
        repo: enhancedContext.getRepository(),
        task_type: enhancedContext.taskType || 'general_analysis'
      });

      // Step 1: Analyze repository structure and technology stack
      const repoAnalysis = await this.analyzeRepository(enhancedContext);

      // Step 2: Generate tech lead analysis based on context
      const analysisResult = await this.generateTechLeadAnalysis(enhancedContext, repoAnalysis);

      await this.logInteraction('tl_analysis_complete', 'Tech Lead analysis completed', {
        repo: enhancedContext.getRepository(),
        architecture_decisions: analysisResult.architecture_decisions?.length || 0,
        implementation_plan: analysisResult.implementation_plan ? 1 : 0,
        technical_risks: analysisResult.technical_risks?.length || 0
      });

      // Step 3: Log completion and costs
      await this.logCompletion(enhancedContext);

      console.log(chalk.green('✅ Tech Lead analysis completed'));

      return {
        session_id: enhancedContext.sessionId,
        repository: enhancedContext.getRepository(),
        ...analysisResult,
        completed_at: new Date().toISOString()
      };

    } catch (error) {
      await this.logError(error, {
        repo: context.repoOwner && context.repoName ? `${context.repoOwner}/${context.repoName}` : 'unknown',
        context: context
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive tech lead analysis
   * @param {Object} context - Enhanced context
   * @param {Object} repoAnalysis - Repository analysis results
   * @returns {Promise<Object>} Tech lead analysis
   */
  async generateTechLeadAnalysis(context, repoAnalysis) {
    const systemPrompt = await this.getTechLeadSystemPrompt();
    
    // Build analysis request based on context
    let analysisRequest = `Please analyze the following repository from a technical perspective:\n\n`;
    analysisRequest += `Repository: ${context.getRepository()}\n`;
    analysisRequest += `Repository Structure:\n${repoAnalysis.structure}\n\n`;

    // Add specific analysis context based on the task
    if (context.businessRequirements) {
      analysisRequest += `Business Requirements (from BA Agent):\n${context.businessRequirements}\n\n`;
    }

    if (context.featureDescription) {
      analysisRequest += `Feature Description: ${context.featureDescription}\n\n`;
    }

    if (context.issueNumber) {
      try {
        const issueDetails = await this.getGitHubIssue(context, context.issueNumber);
        analysisRequest += `GitHub Issue #${context.issueNumber}:\n`;
        analysisRequest += `Title: ${issueDetails.title}\n`;
        analysisRequest += `Description: ${issueDetails.body}\n\n`;
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Could not fetch issue details: ${error.message}`));
      }
    }

    analysisRequest += `Please provide a comprehensive technical analysis covering:\n`;
    analysisRequest += `1. Architecture & Design Decisions\n`;
    analysisRequest += `2. Implementation Strategy & Plan\n`;
    analysisRequest += `3. Technical Risks & Mitigation\n`;
    analysisRequest += `4. Technology Stack Recommendations\n`;
    analysisRequest += `5. Performance & Scalability Considerations\n`;
    analysisRequest += `6. Security & Quality Assurance\n`;
    analysisRequest += `7. Development & Deployment Strategy\n\n`;
    analysisRequest += `Format your response as structured JSON.`;

    const response = await this.generateLLMResponse(
      'tech-lead',
      systemPrompt,
      analysisRequest,
      context
    );

    // Parse the structured response
    return this.parseTechLeadResponse(response.content);
  }

  /**
   * Get tech lead system prompt
   * @returns {Promise<string>} System prompt for tech lead
   */
  async getTechLeadSystemPrompt() {
    try {
      const promptPath = path.join(process.cwd(), 'prompts', 'tech-lead.txt');
      return await fs.readFile(promptPath, 'utf8');
    } catch (error) {
      // Fallback prompt if file doesn't exist yet
      return `You are a Tech Lead AI agent in the DevShop system. Your role is to provide technical analysis, architecture decisions, and implementation planning.

## Core Responsibilities

### 1. Technical Architecture Analysis
- Analyze existing codebase structure and patterns
- Evaluate technology stack and framework choices
- Identify architectural strengths and weaknesses
- Recommend architectural improvements and patterns

### 2. Implementation Planning
- Create detailed technical implementation plans
- Break down features into technical tasks and components
- Identify dependencies and integration points
- Estimate technical complexity and effort

### 3. Risk Assessment & Mitigation
- Identify technical risks and challenges
- Assess performance and scalability implications
- Evaluate security considerations
- Plan mitigation strategies for identified risks

### 4. Technology Recommendations
- Recommend appropriate technologies and tools
- Evaluate trade-offs between different technical approaches
- Consider maintainability, scalability, and team expertise
- Align technology choices with project goals

## Response Format

Provide responses in structured JSON format with these sections:
- architecture_decisions: Array of architectural decisions and rationale
- implementation_plan: Detailed technical implementation strategy
- technical_risks: Array of identified risks with mitigation strategies
- technology_recommendations: Recommended technologies and tools
- performance_considerations: Performance and scalability analysis
- security_considerations: Security analysis and recommendations
- development_strategy: Development and deployment approach

Focus on technical aspects while considering business requirements passed from the BA agent.`;
    }
  }

  /**
   * Parse tech lead response into structured format
   * @param {string} responseContent - Raw LLM response
   * @returns {Object} Parsed tech lead analysis
   */
  parseTechLeadResponse(responseContent) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(responseContent);
      
      // Ensure required structure exists
      return {
        architecture_decisions: parsed.architecture_decisions || [],
        implementation_plan: parsed.implementation_plan || 'No implementation plan provided',
        technical_risks: parsed.technical_risks || [],
        technology_recommendations: parsed.technology_recommendations || [],
        performance_considerations: parsed.performance_considerations || 'No performance analysis provided',
        security_considerations: parsed.security_considerations || 'No security analysis provided',
        development_strategy: parsed.development_strategy || 'No development strategy provided',
        summary: parsed.summary || 'Technical analysis completed'
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not parse JSON response, using text analysis'));
      
      // Fallback: try to extract information from text
      return this.extractStructuredDataFromText(responseContent);
    }
  }

  /**
   * Extract structured data from unstructured text response
   * @param {string} text - Unstructured response text
   * @returns {Object} Extracted structured data
   */
  extractStructuredDataFromText(text) {
    const sections = {
      architecture_decisions: [],
      implementation_plan: 'No implementation plan provided',
      technical_risks: [],
      technology_recommendations: [],
      performance_considerations: 'No performance analysis provided',
      security_considerations: 'No security analysis provided',
      development_strategy: 'No development strategy provided',
      summary: text.slice(0, 500) + (text.length > 500 ? '...' : '')
    };

    // Extract sections using pattern matching
    const patterns = {
      architecture: /(?:architecture|design)[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      implementation: /implementation[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      risks: /(?:risk|challenge)[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      technology: /(?:technology|stack|tool)[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      performance: /performance[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      security: /security[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i,
      development: /(?:development|deployment)[\s\S]*?(?=\n(?:[A-Z]|\d\.)|$)/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        const content = match[0].trim();
        switch (key) {
          case 'architecture':
            sections.architecture_decisions = [{ decision: content, rationale: 'Extracted from analysis' }];
            break;
          case 'implementation':
            sections.implementation_plan = content;
            break;
          case 'risks':
            sections.technical_risks = [{ risk: content, mitigation: 'See analysis for details' }];
            break;
          case 'technology':
            sections.technology_recommendations = [content];
            break;
          case 'performance':
            sections.performance_considerations = content;
            break;
          case 'security':
            sections.security_considerations = content;
            break;
          case 'development':
            sections.development_strategy = content;
            break;
        }
      }
    }

    return sections;
  }

  /**
   * Analyze repository from technical perspective
   * @param {Object} context - Enhanced context
   * @param {string} focusArea - Optional focus area (architecture, performance, security)
   * @returns {Promise<Object>} Technical repository analysis
   */
  async analyzeTechnicalRepository(context, focusArea = null) {
    console.log(chalk.blue('🔍 Analyzing repository technical structure...'));

    try {
      // Get base repository analysis
      const baseAnalysis = await this.analyzeRepository(context);

      // Enhance with technical focus
      const systemPrompt = `You are a Tech Lead analyzing a repository structure. Focus on technical architecture, patterns, and implementation details.`;
      
      let analysisRequest = `Analyze this repository structure from a technical perspective:\n\n`;
      analysisRequest += `Repository: ${context.getRepository()}\n`;
      analysisRequest += `Structure:\n${baseAnalysis.structure}\n\n`;

      if (focusArea) {
        analysisRequest += `Focus particularly on: ${focusArea}\n\n`;
      }

      analysisRequest += `Provide analysis covering:\n`;
      analysisRequest += `- Architecture patterns and design decisions\n`;
      analysisRequest += `- Technology stack and framework usage\n`;
      analysisRequest += `- Code organization and structure\n`;
      analysisRequest += `- Potential technical improvements\n`;
      analysisRequest += `- Scalability and maintainability considerations\n`;

      const response = await this.generateLLMResponse(
        'tech-lead',
        systemPrompt,
        analysisRequest,
        context
      );

      return {
        base_analysis: baseAnalysis,
        technical_analysis: response.content,
        focus_area: focusArea,
        analyzed_at: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Technical repository analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate Architectural Decision Record (ADR)
   * @param {Object} context - Enhanced context
   * @param {Object} decision - Decision details
   * @returns {Promise<string>} ADR markdown content
   */
  async generateADR(context, decision) {
    const systemPrompt = `You are a Tech Lead generating an Architectural Decision Record (ADR). Create a clear, structured ADR document.`;

    const adrRequest = `Generate an ADR for the following architectural decision:\n\n`;
    const content = typeof decision === 'string' ? decision : JSON.stringify(decision, null, 2);
    const requestContent = adrRequest + content;

    const response = await this.generateLLMResponse(
      'tech-lead',
      systemPrompt,
      requestContent,
      context
    );

    return response.content;
  }
}