import chalk from 'chalk';
import path from 'path';
import crypto from 'crypto';
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
    // Initialize ADR counter for sequential numbering
    this.adrCounter = 0;
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
        `Add Business Decision Record: ${decisionTitle}`,
        decisionTitle
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
      
      const fileName = this.generateUniqueADRName(decisionTitle);
      const filePath = `documents/adr/${fileName}`;

      // Store in target repository
      const result = await this.storeDocumentInRepository(
        context, 
        filePath, 
        adrContent, 
        `Add Architectural Decision Record: ${decisionTitle}`,
        decisionTitle
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
        commitSha: result.commitSha,
        pullRequestUrl: result.pullRequestUrl,
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
  async storeDocumentInRepository(context, filePath, content, commitMessage, decisionTitle = null) {
    try {
      console.log(chalk.blue('🔄 Creating Pull Request for document...'));
      
      // Create a feature branch for the document using collision-resistant naming
      const branchName = decisionTitle 
        ? this.generateCollisionResistantBranchName(decisionTitle)
        : this.generateBranchName(filePath);
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
          commitSha: prResult.commitSha,
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
      
      // Step 1: Create a new branch with collision detection
      const branchResult = await this.createBranchWithCollisionDetection(context, branchName);
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
      
      // Include commit SHA from file creation in the final result
      return {
        ...prResult,
        commitSha: fileResult.commitSha
      };

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
   * Create branch with collision detection and automatic incremental naming
   * @param {Object} context - Repository context
   * @param {string} baseBranchName - Base branch name to try
   * @returns {Promise<Object>} Branch creation result with final branch name
   */
  async createBranchWithCollisionDetection(context, baseBranchName) {
    let attemptNumber = 0;
    let currentBranchName = baseBranchName;
    const maxAttempts = 10; // Prevent infinite loops

    while (attemptNumber < maxAttempts) {
      try {
        const result = await this.createBranch(context, currentBranchName);
        
        if (result.success) {
          return {
            success: true,
            branchName: currentBranchName,
            attempts: attemptNumber + 1
          };
        }

        // Check if this is a branch collision (422 Reference already exists)
        if (result.error && result.error.includes('422 Reference already exists')) {
          attemptNumber++;
          currentBranchName = `${baseBranchName}-${attemptNumber}`;
          console.log(chalk.yellow(`⚠️ Branch '${baseBranchName}${attemptNumber === 1 ? '' : `-${attemptNumber - 1}`}' exists, trying '${currentBranchName}'`));
          continue; // Try again with incremented name
        }

        // If it's not a collision error, return the original error
        return result;

      } catch (error) {
        // Check if the error message indicates a collision
        if (error.message && error.message.includes('422 Reference already exists')) {
          attemptNumber++;
          currentBranchName = `${baseBranchName}-${attemptNumber}`;
          console.log(chalk.yellow(`⚠️ Branch collision detected, trying '${currentBranchName}'`));
          continue;
        }

        // If it's not a collision error, return the error
        return {
          success: false,
          error: error.message,
          branchName: currentBranchName
        };
      }
    }

    // If we've exceeded max attempts, return failure
    return {
      success: false,
      error: `Failed to create branch after ${maxAttempts} attempts. Too many collisions.`,
      branchName: currentBranchName,
      attempts: attemptNumber
    };
  }

  /**
   * Get file content and SHA if file exists
   * @param {Object} context - Repository context  
   * @param {string} filePath - File path to check
   * @param {string} branchName - Branch name to check in
   * @returns {Promise<Object>} File existence result with SHA
   */
  async getFileContent(context, filePath, branchName) {
    try {
      const allTools = await this.discoverTools('github');
      const getFileTool = allTools.find(tool => tool.name === 'get_file_contents');
      
      if (!getFileTool) {
        return { exists: false, sha: null, content: null, error: 'No get_file_contents tool available' };
      }

      const fileArgs = {
        owner: context.repoOwner,
        repo: context.repoName,
        path: filePath,
        ref: branchName
      };

      const result = await this.mcpClientManager.callTool('github', 'get_file_contents', fileArgs);
      
      // Check for GitHub MCP error response (file not found)
      if (result.isError || result.error) {
        const errorMessage = this.extractErrorMessage(result);
        
        // File not found is expected for new files
        if (errorMessage.includes('Not Found') || errorMessage.includes('404')) {
          return { exists: false, sha: null, content: null };
        }
        
        // Other errors should be reported
        return { exists: false, sha: null, content: null, error: errorMessage };
      }

      // Extract content and SHA from successful response
      const content = result.content || result.data?.content || '';
      const sha = result.sha || result.data?.sha || '';
      
      return {
        exists: true,
        sha: sha,
        content: content
      };

    } catch (error) {
      // File not found or other errors
      if (error.message && (error.message.includes('404') || error.message.includes('Not Found'))) {
        return { exists: false, sha: null, content: null };
      }
      
      return { exists: false, sha: null, content: null, error: error.message };
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
        // Check if file already exists and get SHA if needed (with fallback to main/master)
        const existingFile = await this.getFileContentWithFallback(context, filePath, branchName);
        
        // Use GitHub MCP create_or_update_file tool directly
        const fileArgs = {
          owner: context.repoOwner,
          repo: context.repoName,
          path: filePath,
          content: content, // GitHub MCP expects plain text, not base64
          message: commitMessage || `Add ADR: ${filePath}`,
          branch: branchName
        };

        // Add SHA only if file exists (required for updates)
        if (existingFile.exists && existingFile.sha) {
          fileArgs.sha = existingFile.sha;
        }

        const result = await this.mcpClientManager.callTool('github', 'create_or_update_file', fileArgs);
        
        // Check for GitHub MCP error response
        if (result.isError) {
          const errorMessage = this.extractErrorMessage(result);
          
          // Check if it's the "sha wasn't supplied" error and provide helpful message
          if (errorMessage.includes('"sha" wasn\'t supplied') || errorMessage.includes('sha wasn\'t supplied')) {
            const enhancedError = `File may already exist and requires SHA for update. ${errorMessage}. SHA required for updates to existing files.`;
            console.error(chalk.red(`❌ GitHub MCP file creation failed: ${enhancedError}`));
            return { success: false, error: enhancedError };
          }
          
          console.error(chalk.red(`❌ GitHub MCP file creation failed: ${errorMessage}`));
          return { success: false, error: errorMessage };
        }
        
        return { success: true, result, commitSha: result.commit?.sha };
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
        commitSha: result.commit?.sha,
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

  /**
   * Utility functions for parsing and formatting
   */

  sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
  }

  /**
   * Generate unique ADR filename to avoid collisions
   * @param {string} title - Decision title
   * @returns {string} Unique ADR filename
   */
  generateUniqueADRName(title) {
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 8);
    const sanitizedTitle = this.extractKeyTerms(title).slice(0, 2).join('-');
    return `ADR-${timestamp}-${sanitizedTitle}-${uuid}.md`;
  }

  /**
   * Generate collision-resistant branch name with timestamp and UUID
   * @param {string} title - Decision title or description
   * @returns {string} Unique branch name
   */
  generateCollisionResistantBranchName(title) {
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 6);
    const action = this.inferBranchAction(title);
    const terms = this.extractKeyTerms(title).slice(0, 2).join('-');
    return `${action}-${terms}-${timestamp}-${uuid}`.substring(0, 50);
  }

  /**
   * Get file content with fallback to main/master branches
   * @param {Object} context - Repository context  
   * @param {string} filePath - File path to check
   * @param {string} targetBranch - Primary branch to check
   * @returns {Promise<Object>} File existence result with SHA and source branch
   */
  async getFileContentWithFallback(context, filePath, targetBranch) {
    // Try target branch first
    let result = await this.getFileContent(context, filePath, targetBranch);
    if (result.exists) {
      return { ...result, foundInBranch: targetBranch };
    }
    
    // Fallback to main/master branches
    for (const baseBranch of ['main', 'master']) {
      result = await this.getFileContent(context, filePath, baseBranch);
      if (result.exists) {
        return { ...result, foundInBranch: baseBranch };
      }
    }
    
    return { exists: false, sha: null, content: null, foundInBranch: null };
  }

  /**
   * Parse Tech Lead response with robust error handling
   * @param {string} response - Raw Tech Lead response
   * @returns {Object} Parsed technical analysis
   */
  parseRobustTechLeadResponse(response) {
    try {
      // Try direct JSON parsing first
      return JSON.parse(response);
    } catch (error) {
      // Extract JSON from text content using regex
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (nestedError) {
          // JSON is malformed, fall back to text parsing
        }
      }
      
      // Fallback to structured text parsing
      return this.parseTextResponse(response);
    }
  }

  /**
   * Parse text-based Tech Lead response when JSON fails
   * @param {string} response - Text response
   * @returns {Object} Structured analysis object
   */
  parseTextResponse(response) {
    const result = {
      architecture_decisions: [],
      technology_recommendations: [],
      summary: 'Parsed from text response'
    };

    // Extract architecture decisions
    const decisionMatch = response.match(/(?:Architecture Decision|Decision):\s*([^\n]+)/i);
    if (decisionMatch) {
      result.architecture_decisions.push({
        decision: decisionMatch[1].trim(),
        rationale: this.extractRationale(response)
      });
    }

    // Extract technology recommendations
    const techRecommendations = this.extractTechRecommendations(response);
    if (techRecommendations.length > 0) {
      result.technology_recommendations = techRecommendations;
    }

    // Extract summary from first paragraph
    const summaryMatch = response.match(/^([^\n]{50,200})/m);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    return result;
  }

  /**
   * Extract rationale from text response
   * @param {string} text - Response text
   * @returns {string} Extracted rationale
   */
  extractRationale(text) {
    const rationaleMatch = text.match(/(?:Rationale|Because|Since):\s*([^\n]+)/i);
    return rationaleMatch ? rationaleMatch[1].trim() : 'No rationale provided';
  }

  /**
   * Extract technology recommendations from text
   * @param {string} text - Response text
   * @returns {Array} Technology recommendations
   */
  extractTechRecommendations(text) {
    const recommendations = [];
    const techLines = text.match(/(?:Technology|Tech|Frontend|Testing|Build):\s*([^\n]+)/gi) || [];
    
    techLines.forEach(line => {
      const match = line.match(/([^:]+):\s*(.+)/);
      if (match) {
        recommendations.push({
          category: match[1].trim(),
          recommendation: match[2].trim()
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Determine if a decision is complex enough to warrant an ADR
   * @param {Object} decision - Technical analysis or decision object
   * @returns {boolean} Whether to create ADR
   */
  shouldCreateADR(decision) {
    if (!decision) return false;

    // Complex decisions that merit ADRs
    const complexityIndicators = [
      decision.architecture_decisions?.length > 1,
      decision.technical_risks?.length > 2,
      decision.implementation_plan?.phases?.length > 2,
      JSON.stringify(decision).length > 1000,
      decision.performance_considerations && decision.performance_considerations !== 'No performance analysis provided',
      decision.security_considerations && decision.security_considerations !== 'No security analysis provided'
    ];

    const complexityScore = complexityIndicators.filter(Boolean).length;
    return complexityScore >= 2; // Require at least 2 complexity indicators
  }

  /**
   * Determine if a decision is simple (helper for testing)
   * @param {Object} decision - Decision object
   * @returns {boolean} Whether decision is simple
   */
  isSimpleDecision(decision) {
    return !this.shouldCreateADR(decision);
  }

  /**
   * Generate smart, short file names
   * @param {string} prefix - File prefix (BDR, ADR)
   * @param {string} title - Decision title
   * @returns {string} Smart file name
   */
  generateSmartFileName(prefix, title) {
    // Extract key terms from title
    const keyTerms = this.extractKeyTerms(title);
    const shortTitle = keyTerms.slice(0, 4).join('-'); // Max 4 key terms
    
    // Create short, descriptive name
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits only
    return `${prefix}-${timestamp}-${shortTitle}`.substring(0, 45); // Max 45 chars
  }

  /**
   * Generate human-readable branch names
   * @param {string} title - Decision or action title
   * @returns {string} Human-readable branch name
   */
  generateBranchName(title) {
    // Extract key terms and create branch name
    const keyTerms = this.extractKeyTerms(title);
    const branchAction = this.inferBranchAction(title);
    
    // Combine action with key terms
    const branchName = `${branchAction}-${keyTerms.slice(0, 3).join('-')}`.substring(0, 45);
    return branchName.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Extract key technical terms from title
   * @param {string} title - Title to analyze
   * @returns {Array<string>} Key terms
   */
  extractKeyTerms(title) {
    const lowerTitle = title.toLowerCase();
    
    // Common technical keywords to prioritize
    const technicalKeywords = [
      'testing', 'unit-tests', 'jest', 'vitest', 'framework',
      'database', 'postgres', 'mysql', 'mongodb',
      'auth', 'authentication', 'oauth',
      'api', 'rest', 'graphql',
      'performance', 'optimization', 'cache',
      'security', 'deployment', 'ci-cd',
      'react', 'vue', 'angular', 'node',
      'docker', 'kubernetes', 'aws'
    ];
    
    // Find technical keywords in title
    const foundKeywords = technicalKeywords.filter(keyword => 
      lowerTitle.includes(keyword.replace('-', ' ')) || lowerTitle.includes(keyword)
    );
    
    // If technical keywords found, use them
    if (foundKeywords.length > 0) {
      return foundKeywords.slice(0, 4);
    }
    
    // Otherwise, extract meaningful words
    const words = lowerTitle
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.isStopWord(word))
      .slice(0, 4);
    
    return words.map(word => word.replace(/s$/, '')); // Remove plural
  }

  /**
   * Infer branch action from title
   * @param {string} title - Title to analyze
   * @returns {string} Branch action
   */
  inferBranchAction(title) {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('add') || lowerTitle.includes('implement') || lowerTitle.includes('create')) {
      return 'add';
    } else if (lowerTitle.includes('fix') || lowerTitle.includes('resolve') || lowerTitle.includes('debug')) {
      return 'fix';
    } else if (lowerTitle.includes('update') || lowerTitle.includes('improve') || lowerTitle.includes('enhance')) {
      return 'update';
    } else if (lowerTitle.includes('remove') || lowerTitle.includes('delete')) {
      return 'remove';
    } else if (lowerTitle.includes('refactor') || lowerTitle.includes('restructure')) {
      return 'refactor';
    } else {
      return 'add'; // Default action
    }
  }

  /**
   * Determine if a decision is simple (doesn't need full ADR)
   * @param {Object} decision - Decision object to analyze
   * @returns {boolean} Whether decision is simple
   */
  isSimpleDecision(decision) {
    // Count complexity indicators
    const architectureDecisions = decision.architecture_decisions?.length || 0;
    const technicalRisks = decision.technical_risks?.length || 0;
    const implementationPhases = decision.implementation_plan?.phases?.length || 0;
    
    // Simple if it's a single decision without complex structures
    return architectureDecisions <= 1 && technicalRisks === 0 && implementationPhases <= 1;
  }

  /**
   * Determine if decision warrants ADR creation
   * @param {Object} decision - Decision object to analyze
   * @returns {boolean} Whether to create ADR
   */
  shouldCreateADR(decision) {
    return !this.isSimpleDecision(decision);
  }

  /**
   * Check if word is a stop word
   * @param {string} word - Word to check
   * @returns {boolean} Whether word is a stop word
   */
  isStopWord(word) {
    const stopWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'had', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
      'what', 'which', 'should', 'would', 'could', 'provide', 'technical', 'guidance', 'recommended', 'approaches', 'tools', 'best', 'practices'
    ];
    return stopWords.includes(word.toLowerCase());
  }

  /**
   * Generate readable ADR filename with sequential numbering
   * @param {string} title - ADR title
   * @returns {string} Readable ADR filename under 50 characters
   */
  generateReadableADRName(title) {
    // Increment counter for sequential numbering
    this.adrCounter++;
    const adrNumber = String(this.adrCounter).padStart(3, '0'); // ADR-001, ADR-002, etc.

    // Extract key terms from title (prioritize technical terms)
    const keyTerms = this.extractKeyTerms(title);
    
    // Create readable suffix by joining key terms
    const readableSuffix = keyTerms.slice(0, 2).join('-'); // Max 2 key terms to keep it short
    
    // Generate filename: ADR-XXX-key-terms.md
    const fileName = `ADR-${adrNumber}-${readableSuffix}.md`;
    
    // Ensure it's under 50 characters by truncating if necessary
    if (fileName.length > 50) {
      const maxSuffixLength = 50 - 12; // 50 - "ADR-001-.md".length
      const truncatedSuffix = readableSuffix.substring(0, maxSuffixLength);
      return `ADR-${adrNumber}-${truncatedSuffix}.md`;
    }
    
    return fileName;
  }

  /**
   * Reset ADR counter (primarily for testing)
   */
  resetADRCounter() {
    this.adrCounter = 0;
  }

  /**
   * Generate ADR with verification that document was actually created
   * @param {string} decisionTitle - Title of the decision
   * @param {Object} technicalAnalysis - Tech Lead analysis result
   * @param {Object} context - Enhanced context
   * @returns {Promise<Object>} ADR generation result with verification
   */
  async generateADRWithVerification(decisionTitle, technicalAnalysis, context) {
    try {
      // First, generate the ADR normally
      const adrResult = await this.generateADR(context, technicalAnalysis, decisionTitle);
      
      if (!adrResult.success) {
        return {
          success: false,
          verified: false,
          error: adrResult.error,
          filePath: adrResult.filePath
        };
      }

      // Now verify the document actually exists
      const documentExists = await this.verifyDocumentExists(context, adrResult.filePath);
      
      if (!documentExists) {
        return {
          success: false,
          verified: false,
          error: 'Document creation claimed success but file not found in repository',
          filePath: adrResult.filePath,
          commitSha: adrResult.commitSha
        };
      }

      // Document was successfully created and verified
      return {
        success: true,
        verified: true,
        filePath: adrResult.filePath,
        fileName: adrResult.fileName,
        commitSha: adrResult.commitSha,
        pullRequestUrl: adrResult.pullRequestUrl,
        content: adrResult.content
      };

    } catch (error) {
      return {
        success: false,
        verified: false,
        error: error.message,
        filePath: null
      };
    }
  }

  /**
   * Verify that a document actually exists in the repository
   * @param {Object} context - Repository context
   * @param {string} filePath - Path to verify
   * @returns {Promise<boolean>} Whether document exists
   */
  async verifyDocumentExists(context, filePath) {
    try {
      // Try to get the file content to verify it exists
      const content = await this.getFileContent(context, filePath);
      return content !== null && content !== undefined;
    } catch (error) {
      // If we get an error, the file likely doesn't exist
      console.log(chalk.yellow(`⚠️ Document verification failed: ${error.message}`));
      return false;
    }
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