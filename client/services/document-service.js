import chalk from 'chalk';
import path from 'path';
import { BaseAgent } from '../agents/base-agent.js';

/**
 * Document Service
 * Manages Business Decision Records (BDR) and Architectural Decision Records (ADR)
 * Handles generation, storage in target repositories, and RAG for existing decisions
 */
export class DocumentService extends BaseAgent {
  constructor(mcpClientManager, sessionService, config = null) {
    super(mcpClientManager, sessionService, config);
    this.config = config;
  }

  /**
   * Generate Business Decision Record (BDR) from BA agent analysis
   * @param {Object} context - Enhanced context
   * @param {Object} businessAnalysis - BA agent analysis result
   * @param {string} decisionTitle - Title of the business decision
   * @returns {Promise<Object>} BDR generation result
   */
  async generateBDR(context, businessAnalysis, decisionTitle) {
    console.log(chalk.blue('📄 Generating Business Decision Record...'));

    try {
      const bdrContent = this.formatBDR(decisionTitle, businessAnalysis, context);
      
      const fileName = this.sanitizeFileName(`BDR-${Date.now()}-${decisionTitle}`);
      const filePath = `documents/bdr/${fileName}.md`;

      // Store in target repository
      const result = await this.storeDocumentInRepository(
        context, 
        filePath, 
        bdrContent, 
        `Add Business Decision Record: ${decisionTitle}`
      );

      await this.sessionService?.logInteraction('bdr_generated', 
        `BDR generated: ${decisionTitle}`, {
          fileName,
          filePath,
          repository: context.getRepository(),
          success: result.success
        });

      return {
        success: result.success,
        fileName,
        filePath,
        content: bdrContent,
        repository: context.getRepository(),
        type: 'BDR',
        title: decisionTitle,
        createdAt: new Date().toISOString(),
        error: result.error
      };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to generate BDR: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate Architectural Decision Record (ADR) from TL agent analysis
   * @param {Object} context - Enhanced context
   * @param {Object} technicalAnalysis - TL agent analysis result
   * @param {string} decisionTitle - Title of the architectural decision
   * @returns {Promise<Object>} ADR generation result
   */
  async generateADR(context, technicalAnalysis, decisionTitle) {
    console.log(chalk.blue('🏗️ Generating Architectural Decision Record...'));

    try {
      const adrContent = this.formatADR(decisionTitle, technicalAnalysis, context);
      
      const fileName = this.sanitizeFileName(`ADR-${Date.now()}-${decisionTitle}`);
      const filePath = `documents/adr/${fileName}.md`;

      // Store in target repository
      const result = await this.storeDocumentInRepository(
        context, 
        filePath, 
        adrContent, 
        `Add Architectural Decision Record: ${decisionTitle}`
      );

      await this.sessionService?.logInteraction('adr_generated', 
        `ADR generated: ${decisionTitle}`, {
          fileName,
          filePath,
          repository: context.getRepository(),
          success: result.success
        });

      return {
        success: result.success,
        fileName,
        filePath,
        content: adrContent,
        repository: context.getRepository(),
        type: 'ADR',
        title: decisionTitle,
        createdAt: new Date().toISOString(),
        error: result.error
      };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to generate ADR: ${error.message}`));
      throw error;
    }
  }

  /**
   * Store document in target repository using GitHub MCP tools
   * @param {Object} context - Enhanced context
   * @param {string} filePath - Path in repository
   * @param {string} content - Document content
   * @param {string} commitMessage - Commit message
   * @returns {Promise<Object>} Storage result
   */
  async storeDocumentInRepository(context, filePath, content, commitMessage) {
    try {
      console.log(chalk.blue('🔄 Creating Pull Request for document...'));
      
      // Create a feature branch for the document
      const branchName = this.generateBranchName(filePath);
      const prResult = await this.createDocumentPullRequest(
        context,
        branchName,
        filePath,
        content,
        commitMessage
      );

      if (prResult.success) {
        console.log(chalk.green(`✅ Document PR created: ${prResult.pullRequestUrl}`));
        return {
          success: true,
          filePath,
          commitMessage,
          branchName,
          pullRequestUrl: prResult.pullRequestUrl,
          pullRequestNumber: prResult.pullRequestNumber,
          method: 'pull-request'
        };
      } else {
        // Fallback to direct commit if PR creation fails
        console.log(chalk.yellow('⚠️ PR creation failed, falling back to direct commit...'));
        return await this.createDirectCommit(context, filePath, content, commitMessage);
      }

    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not store document in repository: ${error.message}`));
      return {
        success: false,
        error: error.message,
        filePath,
        content
      };
    }
  }

  /**
   * Create a Pull Request for document storage
   * @param {Object} context - Repository context
   * @param {string} branchName - Feature branch name
   * @param {string} filePath - File path in repository
   * @param {string} content - File content
   * @param {string} commitMessage - Commit message
   * @returns {Promise<Object>} PR creation result
   */
  async createDocumentPullRequest(context, branchName, filePath, content, commitMessage) {
    try {
      const tools = await this.discoverTools('github');
      
      // Step 1: Create a new branch
      const branchResult = await this.createBranch(context, branchName);
      if (!branchResult.success) {
        throw new Error(`Failed to create branch: ${branchResult.error}`);
      }

      // Step 2: Create file in the branch
      const fileResult = await this.createFileInBranch(
        context, branchName, filePath, content, commitMessage
      );
      if (!fileResult.success) {
        throw new Error(`Failed to create file: ${fileResult.error}`);
      }

      // Step 3: Create Pull Request
      const prResult = await this.createPullRequest(
        context, branchName, filePath, commitMessage
      );
      
      return prResult;

    } catch (error) {
      console.log(chalk.yellow(`PR creation error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Find tools for branch operations (get/create refs)
   */
  async findBranchTools() {
    try {
      const getRefTool = await this.findBestToolForCapability('github', ['get_reference', 'get']);
      const createRefTool = await this.findBestToolForCapability('github', ['create_reference', 'create']);
      
      return { getRefTool, createRefTool };
    } catch (error) {
      return { getRefTool: null, createRefTool: null };
    }
  }

  /**
   * Find tools for pull request operations
   */
  async findPullRequestTools() {
    return await this.findBestToolForCapability('github', ['pull_request', 'pull', 'create']);
  }

  /**
   * Extract SHA from GitHub API response
   */
  extractShaFromResponse(response, context) {
    // Handle null/undefined response
    if (!response) {
      throw new Error(`${context}: Response is null or undefined`);
    }
    
    // Try object.sha first (standard format)
    if (response.object?.sha) {
      return response.object.sha;
    }
    
    // Try direct sha property
    if (response.sha) {
      return response.sha;
    }
    
    // If no SHA found, provide detailed error with response structure
    const responseStructure = JSON.stringify(response, null, 2).substring(0, 500);
    throw new Error(
      `${context}: Could not extract SHA from response. ` +
      `Expected 'object.sha', 'sha', 'target.sha', or 'data.sha' property. ` +
      `Response structure: ${responseStructure}${responseStructure.length >= 500 ? '...' : ''}`
    );
  }

  /**
   * Create a new branch from main
   * @param {Object} context - Repository context
   * @param {string} branchName - New branch name
   * @returns {Promise<Object>} Branch creation result
   */
  async createBranch(context, branchName) {
    try {
      // Try to find GitHub MCP create_branch tool first
      const allTools = await this.discoverTools('github');
      const createBranchTool = allTools.find(tool => tool.name === 'create_branch');
      
      if (createBranchTool) {
        // Use helper method to try main/master branches with smart fallback
        const attemptBranchCreation = async (baseBranch) => {
          const branchArgs = {
            owner: context.repoOwner,
            repo: context.repoName,
            branch: branchName,
            from_branch: baseBranch
          };
          return await this.mcpClientManager.callTool('github', 'create_branch', branchArgs);
        };

        const errorChecks = {
          shouldFallback: (errorMessage) => 
            errorMessage.includes('404 Not Found') && errorMessage.includes('heads/main')
        };

        const result = await this.tryBaseBranches('branch creation', attemptBranchCreation, errorChecks);
        
        if (result.success !== false) {
          return { success: true, branchName };
        }
        
        return result; // Return error result
      }

      // Fallback to old approach if create_branch tool not available
      const { getRefTool, createRefTool } = await this.findBranchTools();

      if (!getRefTool || !createRefTool) {
        throw new Error('No branch creation tools available');
      }

      // Use smart branch detection for fallback approach too
      const fallbackOperation = async (baseBranch) => {
        // Get base branch SHA first
        const refArgs = {
          owner: context.repoOwner,
          repo: context.repoName,
          ref: `heads/${baseBranch}`
        };

        const baseRef = await this.mcpClientManager.callTool('github', getRefTool.name, refArgs);
        const baseSha = this.extractShaFromResponse(baseRef, `Get ${baseBranch} branch reference for ${context.repoOwner}/${context.repoName}`);

        // Create new branch
        const createArgs = {
          owner: context.repoOwner,
          repo: context.repoName,
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        };

        await this.mcpClientManager.callTool('github', createRefTool.name, createArgs);
        
        return { success: true, branchName, sha: baseSha };
      };

      const errorChecks = {
        shouldFallback: (errorMessage) => {
          return errorMessage.includes('not found') || errorMessage.includes('does not exist') || errorMessage.includes('404');
        }
      };

      return await this.tryBaseBranches('fallback branch creation', fallbackOperation, errorChecks);

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create file in specific branch
   * @param {Object} context - Repository context
   * @param {string} branchName - Branch name
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @param {string} commitMessage - Commit message
   * @returns {Promise<Object>} File creation result
   */
  async createFileInBranch(context, branchName, filePath, content, commitMessage) {
    try {
      // Try to find GitHub MCP create_or_update_file tool first
      const allTools = await this.discoverTools('github');
      const createFileTool = allTools.find(tool => tool.name === 'create_or_update_file');
      
      if (createFileTool) {
        // Use GitHub MCP create_or_update_file tool directly
        const fileArgs = {
          owner: context.repoOwner,
          repo: context.repoName,
          path: filePath,
          content: content, // GitHub MCP expects plain text, not base64
          message: commitMessage || `Add ADR: ${filePath}`,
          branch: branchName
        };

        const result = await this.mcpClientManager.callTool('github', 'create_or_update_file', fileArgs);
        
        // Check for GitHub MCP error response
        if (result.isError) {
          const errorMessage = this.extractErrorMessage(result);
          console.error(chalk.red(`❌ GitHub MCP file creation failed: ${errorMessage}`));
          return { success: false, error: errorMessage };
        }
        
        return { success: true, result };
      }

      // Fallback to old approach if create_or_update_file tool not available
      const fileTools = await this.findFileCreationTools();
      
      if (!fileTools) {
        throw new Error('No file creation tools available');
      }

      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        branch: branchName // Create in feature branch
      };

      const result = await this.mcpClientManager.callTool('github', fileTools.name, args);
      
      return { success: true, result };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Pull Request for the branch
   * @param {Object} context - Repository context  
   * @param {string} branchName - Feature branch name
   * @param {string} filePath - File path for PR description
   * @param {string} commitMessage - Original commit message
   * @returns {Promise<Object>} PR creation result
   */
  async createPullRequest(context, branchName, filePath, commitMessage) {
    try {
      // Try to find GitHub MCP create_pull_request tool first
      const allTools = await this.discoverTools('github');
      const createPrTool = allTools.find(tool => tool.name === 'create_pull_request');
      
      if (createPrTool) {
        const docType = filePath.includes('/adr/') || filePath.includes('adr-') ? 'ADR' : 'BDR';
        const title = `docs: ${commitMessage}`;
        const body = `## ${docType} Documentation

${commitMessage}

### File Added
- \`${filePath}\`

### Review Notes
- This ${docType} document captures important decisions made during development
- Please review the content for accuracy and completeness
- Merge when approved to include in project documentation`;

        // Use helper method to try main/master base branches with smart fallback
        const attemptPRCreation = async (baseBranch) => {
          const prArgs = {
            owner: context.repoOwner,
            repo: context.repoName,
            title,
            head: branchName,
            base: baseBranch,
            body
          };
          return await this.mcpClientManager.callTool('github', 'create_pull_request', prArgs);
        };

        const errorChecks = {
          shouldFallback: (errorMessage) => 
            errorMessage.includes('422 Validation Failed') && errorMessage.includes('Field:base Code:invalid')
        };

        const prResult = await this.tryBaseBranches('pull request creation', attemptPRCreation, errorChecks);
        
        if (prResult.success !== false) {
          // Success - handle nested GitHub MCP response structure
          let pullRequestUrl = prResult.pull_request?.html_url || prResult.html_url;
          let pullRequestNumber = prResult.pull_request?.number || prResult.number;
          
          // Enhanced: Try to extract URL from content array if not found in standard locations
          if (!pullRequestUrl && prResult.content && Array.isArray(prResult.content)) {
            for (const contentItem of prResult.content) {
              if (contentItem.type === 'text' && contentItem.text) {
                // Look for GitHub PR URL pattern in the text
                const urlMatch = contentItem.text.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
                if (urlMatch) {
                  pullRequestUrl = urlMatch[0];
                  pullRequestNumber = parseInt(urlMatch[1], 10);
                  break;
                }
              }
            }
          }
          
          if (!pullRequestUrl) {
            console.log(chalk.yellow('⚠️ GitHub MCP response missing pull request URL'), { prResult });
          }
          
          return {
            success: true,
            pullRequestUrl,
            pullRequestNumber
          };
        }
        
        return prResult; // Return error result
      }

      // Fallback to old approach if create_pull_request tool not available
      const prTool = await this.findPullRequestTools();

      if (!prTool) {
        throw new Error('No PR creation tools available');
      }

      const docType = filePath.includes('/adr/') ? 'ADR' : 'BDR';
      const title = `docs: ${commitMessage}`;
      const body = `## ${docType} Documentation

${commitMessage}

### File Added
- \`${filePath}\`

### Review Notes
- This ${docType} document captures important decisions made during development
- Please review the content for accuracy and completeness
- Merge when approved to include in project documentation`;

      // Use smart branch detection for fallback PR creation too
      const fallbackPROperation = async (baseBranch) => {
        const prArgs = {
          owner: context.repoOwner,
          repo: context.repoName,
          title,
          head: branchName,
          base: baseBranch,
          body
        };

        const prResult = await this.mcpClientManager.callTool('github', prTool.name, prArgs);
        
        return {
          success: true,
          pullRequestUrl: prResult.html_url,
          pullRequestNumber: prResult.number
        };
      };

      const errorChecks = {
        shouldFallback: (errorMessage) => {
          return errorMessage.includes('422') && errorMessage.includes('invalid');
        }
      };

      return await this.tryBaseBranches('fallback PR creation', fallbackPROperation, errorChecks);

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fallback: Create direct commit to main branch
   * @param {Object} context - Repository context
   * @param {string} filePath - File path
   * @param {string} content - File content  
   * @param {string} commitMessage - Commit message
   * @returns {Promise<Object>} Direct commit result
   */
  async createDirectCommit(context, filePath, content, commitMessage) {
    try {
      const fileTools = await this.findFileCreationTools();
      
      if (!fileTools) {
        return {
          success: false,
          error: 'No GitHub file creation tools available',
          content: content
        };
      }

      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        branch: 'main'
      };

      const result = await this.mcpClientManager.callTool('github', fileTools.name, args);
      
      console.log(chalk.green(`✅ Document committed directly to main: ${filePath}`));
      
      return {
        success: true,
        filePath,
        commitMessage,
        result,
        method: 'direct-commit'
      };

    } catch (error) {
      return { success: false, error: error.message, filePath, content };
    }
  }

  /**
   * Generate a branch name for document storage
   * @param {string} filePath - File path
   * @returns {string} Branch name
   */
  generateBranchName(filePath) {
    const timestamp = Date.now();
    const docType = filePath.includes('/adr/') ? 'adr' : 'bdr';
    const sanitized = filePath
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    
    return `docs/${docType}-${sanitized}-${timestamp}`;
  }

  /**
   * Retrieve existing BDRs and ADRs from repository for RAG
   * @param {Object} context - Enhanced context
   * @param {string} documentType - 'bdr', 'adr', or 'all'
   * @returns {Promise<Array>} Array of existing documents
   */
  async getExistingDocuments(context, documentType = 'all') {
    console.log(chalk.blue(`📚 Retrieving existing ${documentType.toUpperCase()} documents...`));

    try {
      const documents = [];
      const paths = [];

      // Determine paths to search
      if (documentType === 'bdr' || documentType === 'all') {
        paths.push('documents/bdr');
      }
      if (documentType === 'adr' || documentType === 'all') {
        paths.push('documents/adr');
      }

      // Retrieve documents from each path
      for (const docPath of paths) {
        try {
          const pathDocs = await this.getDocumentsFromPath(context, docPath);
          documents.push(...pathDocs);
        } catch (error) {
          console.log(chalk.gray(`No documents found in ${docPath}: ${error.message}`));
        }
      }

      console.log(chalk.green(`📚 Retrieved ${documents.length} existing documents`));

      return documents;

    } catch (error) {
      console.log(chalk.yellow(`⚠️ Error retrieving documents: ${error.message}`));
      return [];
    }
  }

  /**
   * Search existing documents for relevant decisions (RAG functionality)
   * @param {Object} context - Enhanced context
   * @param {string} query - Search query or keywords
   * @param {string} documentType - 'bdr', 'adr', or 'all'
   * @returns {Promise<Array>} Array of relevant documents
   */
  async searchDocuments(context, query, documentType = 'all') {
    console.log(chalk.blue(`🔍 Searching documents for: "${query}"`));

    try {
      const allDocuments = await this.getExistingDocuments(context, documentType);
      
      if (allDocuments.length === 0) {
        return [];
      }

      // Simple text-based search (could be enhanced with proper RAG/embedding search)
      const queryTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
      
      const relevantDocuments = allDocuments.filter(doc => {
        const searchableText = `${doc.title} ${doc.content}`.toLowerCase();
        return queryTerms.some(term => searchableText.includes(term));
      }).map(doc => ({
        ...doc,
        relevanceScore: this.calculateRelevanceScore(doc, queryTerms)
      })).sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(chalk.green(`🔍 Found ${relevantDocuments.length} relevant documents`));

      return relevantDocuments;

    } catch (error) {
      console.log(chalk.yellow(`⚠️ Error searching documents: ${error.message}`));
      return [];
    }
  }

  /**
   * Generate document summary for agent context
   * @param {Array} documents - Array of documents
   * @param {number} maxLength - Maximum summary length
   * @returns {string} Summary of documents for agent context
   */
  generateDocumentSummary(documents, maxLength = 2000) {
    if (!documents || documents.length === 0) {
      return 'No relevant existing documents found.';
    }

    let summary = `Found ${documents.length} relevant existing documents:\n\n`;
    
    for (const doc of documents.slice(0, 5)) { // Limit to top 5 documents
      const docSummary = `${doc.type}: ${doc.title}\n`;
      const contentPreview = doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '');
      
      if (summary.length + docSummary.length + contentPreview.length < maxLength) {
        summary += docSummary + contentPreview + '\n\n';
      } else {
        summary += '... (additional documents available)\n';
        break;
      }
    }

    return summary;
  }

  /**
   * Format Business Decision Record (BDR) content
   * @param {string} title - Decision title
   * @param {Object} businessAnalysis - BA agent analysis
   * @param {Object} context - Context information
   * @returns {string} Formatted BDR markdown
   */
  formatBDR(title, businessAnalysis, context) {
    const date = new Date().toISOString().split('T')[0];
    
    return `# Business Decision Record: ${title}

**Date:** ${date}
**Repository:** ${context.getRepository()}
**Status:** Proposed

## Context

${businessAnalysis.summary || 'Business analysis summary'}

## Business Requirements

${Array.isArray(businessAnalysis.requirements) ? 
  businessAnalysis.requirements.map(req => `- ${req}`).join('\n') :
  'Requirements not specified in structured format'}

## Acceptance Criteria

${Array.isArray(businessAnalysis.acceptance_criteria) ?
  businessAnalysis.acceptance_criteria.map(criteria => `- [ ] ${criteria}`).join('\n') :
  'Acceptance criteria not specified in structured format'}

## Business Impact

${businessAnalysis.business_impact || 'Business impact analysis not provided'}

## Stakeholders

${Array.isArray(businessAnalysis.stakeholders) ?
  businessAnalysis.stakeholders.map(stakeholder => `- ${stakeholder}`).join('\n') :
  'Stakeholders not identified'}

## Success Metrics

${Array.isArray(businessAnalysis.success_metrics) ?
  businessAnalysis.success_metrics.map(metric => `- ${metric}`).join('\n') :
  'Success metrics not defined'}

## Business Risks

${Array.isArray(businessAnalysis.risks) ?
  businessAnalysis.risks.map(risk => `- **Risk:** ${risk.risk}\n  **Mitigation:** ${risk.mitigation}`).join('\n') :
  'Business risks not identified'}

## Decision

${businessAnalysis.recommendation || 'Business recommendation not provided'}

## Consequences

### Positive
- Implementation of requested business functionality
- Achievement of business objectives

### Negative
- Resource allocation required
- Potential opportunity cost

---`;
  }

  /**
   * Format Architectural Decision Record (ADR) content
   * @param {string} title - Decision title
   * @param {Object} technicalAnalysis - TL agent analysis
   * @param {Object} context - Context information
   * @returns {string} Formatted ADR markdown
   */
  formatADR(title, technicalAnalysis, context) {
    const date = new Date().toISOString().split('T')[0];
    
    return `# Architectural Decision Record: ${title}

**Date:** ${date}
**Repository:** ${context.getRepository()}
**Status:** Proposed

## Context

${technicalAnalysis.summary || 'Technical analysis summary'}

## Architecture Decisions

${Array.isArray(technicalAnalysis.architecture_decisions) ?
  technicalAnalysis.architecture_decisions.map(decision => 
    `### ${decision.decision}\n\n**Rationale:** ${decision.rationale}\n\n**Impact:** ${decision.impact || 'Not specified'}\n\n**Risks:** ${decision.risks || 'Not specified'}`
  ).join('\n\n') :
  'Architecture decisions not specified in structured format'}

## Implementation Plan

${typeof technicalAnalysis.implementation_plan === 'object' ?
  `### Overview\n${technicalAnalysis.implementation_plan.overview || 'Not provided'}\n\n### Critical Path\n${technicalAnalysis.implementation_plan.critical_path || 'Not provided'}` :
  technicalAnalysis.implementation_plan || 'Implementation plan not provided'}

## Technology Recommendations

${Array.isArray(technicalAnalysis.technology_recommendations) ?
  technicalAnalysis.technology_recommendations.map(tech =>
    `### ${tech.category}\n**Recommendation:** ${tech.recommendation}\n**Rationale:** ${tech.rationale}`
  ).join('\n\n') :
  'Technology recommendations not provided'}

## Technical Risks

${Array.isArray(technicalAnalysis.technical_risks) ?
  technicalAnalysis.technical_risks.map(risk =>
    `### ${risk.risk}\n**Probability:** ${risk.probability}\n**Impact:** ${risk.impact}\n**Mitigation:** ${risk.mitigation}`
  ).join('\n\n') :
  'Technical risks not identified'}

## Performance Considerations

${typeof technicalAnalysis.performance_considerations === 'object' ?
  `**Scalability:** ${technicalAnalysis.performance_considerations.scalability}\n\n**Performance Targets:** ${technicalAnalysis.performance_considerations.performance_targets}\n\n**Optimization Strategies:** ${technicalAnalysis.performance_considerations.optimization_strategies}` :
  technicalAnalysis.performance_considerations || 'Performance considerations not provided'}

## Security Considerations

${typeof technicalAnalysis.security_considerations === 'object' ?
  `**Threat Model:** ${technicalAnalysis.security_considerations.threat_model}\n\n**Security Controls:** ${technicalAnalysis.security_considerations.security_controls}\n\n**Compliance:** ${technicalAnalysis.security_considerations.compliance}` :
  technicalAnalysis.security_considerations || 'Security considerations not provided'}

## Development Strategy

${typeof technicalAnalysis.development_strategy === 'object' ?
  `**Methodology:** ${technicalAnalysis.development_strategy.methodology}\n\n**Testing Strategy:** ${technicalAnalysis.development_strategy.testing_strategy}\n\n**Deployment Strategy:** ${technicalAnalysis.development_strategy.deployment_strategy}` :
  technicalAnalysis.development_strategy || 'Development strategy not provided'}

## Alternatives Considered

${technicalAnalysis.alternatives_considered || 'Alternative approaches not documented'}

## Decision

This architectural approach is recommended based on the technical analysis above.

## Consequences

### Positive
- Technical implementation aligned with business requirements
- Scalable and maintainable solution

### Negative
- Technical complexity and implementation effort
- Potential technical debt if not properly maintained

---`;
  }

  /**
   * Get documents from a specific repository path
   * @param {Object} context - Enhanced context
   * @param {string} path - Repository path
   * @returns {Promise<Array>} Array of documents
   */
  async getDocumentsFromPath(context, path) {
    try {
      // Find tools for listing repository contents
      const listTools = await this.findContentListingTools();
      
      if (!listTools) {
        throw new Error('No content listing tools found');
      }

      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        path: path
      };

      // Add token if available
      if (this.config?.github?.token) {
        args.token = this.config.github.token;
      }

      const result = await this.mcpClientManager.callTool('github', listTools.name, args);
      
      // Parse the result and get individual files
      const files = this.parseContentListingResult(result);
      const documents = [];

      for (const file of files) {
        if (file.name.endsWith('.md')) {
          try {
            const fileContent = await this.getFileContent(context, file.path);
            const docType = path.includes('bdr') ? 'BDR' : 'ADR';
            
            documents.push({
              type: docType,
              title: this.extractTitleFromMarkdown(fileContent) || file.name,
              fileName: file.name,
              path: file.path,
              content: fileContent,
              lastModified: file.last_modified || new Date().toISOString()
            });
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Could not read file ${file.path}: ${error.message}`));
          }
        }
      }

      return documents;

    } catch (error) {
      throw new Error(`Failed to get documents from ${path}: ${error.message}`);
    }
  }

  /**
   * Find tools for file creation in GitHub
   * @returns {Promise<Object|null>} Best tool for file creation
   */
  async findFileCreationTools() {
    return await this.findBestToolForCapability('github', ['file', 'create', 'content']);
  }

  /**
   * Find tools for listing repository contents
   * @returns {Promise<Object|null>} Best tool for content listing
   */
  async findContentListingTools() {
    try {
      const tools = await this.discoverTools('github');
      const listingTools = tools.filter(tool => 
        tool.name.toLowerCase().includes('list') ||
        tool.name.toLowerCase().includes('contents') ||
        tool.name.toLowerCase().includes('tree')
      );

      return listingTools.length > 0 ? listingTools[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get file content from repository
   * @param {Object} context - Enhanced context
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} File content
   */
  async getFileContent(context, filePath) {
    try {
      const contentTools = await this.findContentRetrievalTools();
      
      if (!contentTools) {
        throw new Error('No content retrieval tools found');
      }

      const args = {
        owner: context.repoOwner,
        repo: context.repoName,
        path: filePath
      };

      const result = await this.mcpClientManager.callTool('github', contentTools.name, args);
      
      // Parse result and decode base64 content if needed
      return this.parseFileContentResult(result);

    } catch (error) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  /**
   * Find tools for retrieving file content
   * @returns {Promise<Object|null>} Best tool for content retrieval
   */
  async findContentRetrievalTools() {
    try {
      const tools = await this.discoverTools('github');
      const contentTools = tools.filter(tool => 
        tool.name.toLowerCase().includes('get') &&
        (tool.name.toLowerCase().includes('content') || tool.name.toLowerCase().includes('file'))
      );

      return contentTools.length > 0 ? contentTools[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Utility functions for parsing and formatting
   */

  sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
  }

  parseContentListingResult(result) {
    // This would need to be adapted based on actual GitHub MCP response format
    if (result && result.content && Array.isArray(result.content)) {
      return result.content.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        last_modified: item.last_modified
      }));
    }
    return [];
  }

  parseFileContentResult(result) {
    // This would need to be adapted based on actual GitHub MCP response format
    if (result && result.content) {
      // If content is base64 encoded
      if (result.encoding === 'base64') {
        return Buffer.from(result.content, 'base64').toString('utf8');
      }
      return result.content;
    }
    return '';
  }

  extractTitleFromMarkdown(content) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1] : null;
  }

  calculateRelevanceScore(document, queryTerms) {
    const searchableText = `${document.title} ${document.content}`.toLowerCase();
    let score = 0;
    
    queryTerms.forEach(term => {
      const termCount = (searchableText.match(new RegExp(term, 'g')) || []).length;
      score += termCount;
      
      // Bonus for title matches
      if (document.title.toLowerCase().includes(term)) {
        score += 5;
      }
    });
    
    return score;
  }

  /**
   * Try multiple base branches with smart fallback logic
   * @param {string} operation - Operation name for logging ('branch creation' or 'pull request creation')
   * @param {Function} attemptFn - Function that attempts the operation with a base branch
   * @param {Object} errorChecks - Object with error detection functions
   * @returns {Promise<Object>} Operation result
   */
  async tryBaseBranches(operation, attemptFn, errorChecks) {
    const baseBranches = ['main', 'master'];
    
    for (const baseBranch of baseBranches) {
      try {
        const result = await attemptFn(baseBranch);
        
        // Check for GitHub MCP error response
        if (result.isError) {
          const errorMessage = this.extractErrorMessage(result);
          
          // Check if this is a fallback-eligible error for main branch
          if (baseBranch === 'main' && errorChecks.shouldFallback(errorMessage)) {
            console.log(chalk.yellow(`⚠️ Main branch issue for ${operation}, trying master branch...`));
            continue; // Try next branch (master)
          }
          
          // For other errors or if master also failed, return error
          console.error(chalk.red(`❌ GitHub MCP ${operation} failed: ${errorMessage}`));
          return { success: false, error: errorMessage };
        }
        
        // Success - return result
        return result;
      } catch (error) {
        // If it's the last branch or unexpected error, throw
        if (baseBranch === 'master' || !errorChecks.shouldFallback(error.message || '')) {
          throw error;
        }
        console.log(chalk.yellow(`⚠️ Main branch error for ${operation}, trying master branch...`));
        continue;
      }
    }
    
    // If we get here, all branches failed
    return { success: false, error: `Failed to complete ${operation} with any base branch` };
  }

  /**
   * Extract error message from GitHub MCP error response
   * @param {Object} errorResponse - Error response with content array and isError flag
   * @returns {string} Extracted error message
   */
  extractErrorMessage(errorResponse) {
    try {
      if (errorResponse.content && Array.isArray(errorResponse.content)) {
        // Extract messages from content array - handle multiple formats
        const messages = errorResponse.content
          .map(item => {
            // Handle {type: "text", text: "..."} format  
            if (item.type === 'text' && item.text) {
              return item.text;
            }
            // Handle {message: "..."} format
            if (item.message) {
              return item.message;
            }
            // Handle {error: "..."} format
            if (item.error) {
              return item.error;
            }
            // Fallback to JSON string
            return JSON.stringify(item);
          })
          .filter(msg => msg && msg !== '{}');
        
        if (messages.length > 0) {
          return messages.join('; ');
        }
      }
      
      // Fallback to generic error message
      return 'GitHub MCP operation failed';
    } catch (error) {
      console.error(chalk.red(`Error extracting error message:`, error));
      return 'GitHub MCP operation failed (unable to parse error details)';
    }
  }
}