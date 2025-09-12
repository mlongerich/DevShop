import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('DocumentService File Update SHA Fix (TDD Red Phase)', () => {
  let documentService;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    documentService = new DocumentService(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock GitHub MCP tools - add the missing methods directly to the manager
    mockMCPClientManager.callTool = jest.fn();
    mockMCPClientManager.listTools = jest.fn().mockResolvedValue([
      { name: 'create_branch' },
      { name: 'create_or_update_file' },
      { name: 'create_pull_request' },
      { name: 'get_file_contents' }
    ]);
  });

  describe('File Existence and SHA Detection (TDD Red Phase)', () => {
    test('FAILING: should check if file exists and get SHA before update', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };
      
      // Mock successful file retrieval - ensure it's not an error response
      mockMCPClientManager.callTool.mockResolvedValue({
        content: 'existing file content',
        sha: 'abc123current',
        isError: false  // Explicitly mark as not an error
      });
      
      const result = await documentService.getFileContent(context, 'documents/adr/ADR-001-test.md', 'test-branch');
      
      // NOW SHOULD PASS - method exists and works
      expect(result).toBeDefined();
      expect(result.exists).toBe(true);
      expect(result.sha).toBe('abc123current');
      expect(result.content).toContain('existing file content');
    });

    test('FAILING: should return file not found for non-existent files', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock GitHub API returning 404 for non-existent file
      mockMCPClientManager.callTool.mockResolvedValue({
        isError: true,
        error: 'Not Found'
      });

      // NOW SHOULD PASS - method exists and handles 404
      const result = await documentService.getFileContent(context, 'documents/adr/ADR-999-nonexistent.md', 'test-branch');
      
      expect(result).toBeDefined();
      expect(result.exists).toBe(false);
      expect(result.sha).toBeNull();
      expect(result.content).toBeNull();
    });
  });

  describe('File Update with SHA (TDD Red Phase)', () => {
    test('FAILING: should provide SHA when updating existing files', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock existing file with SHA
      const existingFileSha = 'abc123existing';
      
      // Mock file content retrieval (this will fail because method doesn't exist)
      documentService.getFileContent = jest.fn().mockResolvedValue({
        exists: true,
        sha: existingFileSha,
        content: '# Existing ADR Content'
      });

      // Mock create_or_update_file call - should include SHA for existing file
      mockMCPClientManager.callTool.mockResolvedValue({
        commit: { sha: 'def456new' },
        success: true
      });

      const result = await documentService.createFileInBranch(
        context,
        'test-branch',
        'documents/adr/ADR-001-test.md',
        '# Updated ADR Content',
        'Update existing ADR'
      );

      // THIS SHOULD FAIL - current implementation doesn't check for existing files or provide SHA
      expect(result.success).toBe(true);
      expect(mockMCPClientManager.callTool).toHaveBeenCalledWith('github', 'create_or_update_file', 
        expect.objectContaining({
          sha: existingFileSha // SHA should be provided for existing files
        })
      );
    });

    test('FAILING: should not provide SHA when creating new files', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock non-existent file
      documentService.getFileContent = jest.fn().mockResolvedValue({
        exists: false,
        sha: null,
        content: null
      });

      // Mock create_or_update_file call - should NOT include SHA for new file
      mockMCPClientManager.callTool.mockResolvedValue({
        commit: { sha: 'def456new' },
        success: true
      });

      const result = await documentService.createFileInBranch(
        context,
        'test-branch',
        'documents/adr/ADR-002-new.md',
        '# New ADR Content',
        'Create new ADR'
      );

      // THIS SHOULD FAIL - current implementation doesn't check file existence
      expect(result.success).toBe(true);
      expect(mockMCPClientManager.callTool).toHaveBeenCalledWith('github', 'create_or_update_file', 
        expect.not.objectContaining({
          sha: expect.any(String) // SHA should NOT be provided for new files
        })
      );
    });

    test('FAILING: should handle "sha wasn\'t supplied" error gracefully', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock file content call first (will be called by createFileInBranch)
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          isError: true,
          error: 'Not Found'  // File doesn't exist initially
        })
        // Then mock the create_or_update_file call with SHA error
        .mockResolvedValueOnce({
          isError: true,
          error: 'failed to create/update file: PUT https://api.github.com/repos/test-owner/test-repo/contents/documents/adr/ADR-001-test.md: 422 Invalid request.\n\n"sha" wasn\'t supplied. []'
        });

      const result = await documentService.createFileInBranch(
        context,
        'test-branch',
        'documents/adr/ADR-001-test.md',
        '# Updated Content',
        'Update ADR'
      );

      // NOW SHOULD PASS - enhanced error handling provides helpful message
      expect(result.success).toBe(false);
      expect(result.error).toContain('File may already exist');
      expect(result.error).toContain('SHA required for updates');
    });
  });

  describe('Error Handling and Recovery (TDD Red Phase)', () => {
    test('FAILING: should retry file operation with SHA after initial failure', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock initial failure due to missing SHA
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          isError: true,
          error: '"sha" wasn\'t supplied'
        })
        .mockResolvedValueOnce({
          commit: { sha: 'def456new' },
          success: true
        });

      // Mock file content retrieval for retry
      documentService.getFileContent = jest.fn().mockResolvedValue({
        exists: true,
        sha: 'abc123existing',
        content: 'existing content'
      });

      const result = await documentService.createFileInBranch(
        context,
        'test-branch',
        'documents/adr/ADR-001-test.md',
        '# Updated Content',
        'Update ADR'
      );

      // THIS SHOULD FAIL - no retry logic exists yet
      expect(result.success).toBe(true);
      expect(mockMCPClientManager.callTool).toHaveBeenCalledTimes(2);
      expect(documentService.getFileContent).toHaveBeenCalled();
    });

    test('FAILING: should provide detailed error messages for SHA-related failures', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Mock file content call first, then GitHub MCP error with SHA issue
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          isError: true,
          error: 'Not Found'  // File doesn't exist check
        })
        .mockResolvedValueOnce({
          isError: true,
          error: 'failed to create/update file: PUT https://api.github.com/repos/test-owner/test-repo/contents/file.md: 422 Invalid request.\n\n"sha" wasn\'t supplied. []'
        });

      const result = await documentService.createFileInBranch(
        context,
        'test-branch',
        'documents/adr/ADR-001-test.md',
        '# Content',
        'Update ADR'
      );

      // NOW SHOULD PASS - enhanced error handling provides helpful guidance
      expect(result.success).toBe(false);
      expect(result.error).toContain('File may already exist');
      expect(result.error).toContain('SHA required for updates');
    });
  });

  describe('Integration with Document Generation (TDD Red Phase)', () => {
    test('FAILING: should handle file updates during ADR generation', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const technicalAnalysis = {
        architecture_decisions: [
          { decision: 'Use Jest for testing' }
        ],
        summary: 'Testing framework selection'
      };

      // Mock existing ADR file
      documentService.getFileContent = jest.fn().mockResolvedValue({
        exists: true,
        sha: 'existing123',
        content: '# Existing ADR'
      });

      // Mock branch creation
      documentService.createBranchWithCollisionDetection = jest.fn().mockResolvedValue({
        success: true,
        branchName: 'add-adr-testing-framework'
      });

      // Mock file update with SHA
      documentService.createFileInBranch = jest.fn().mockResolvedValue({
        success: true,
        commitSha: 'new456'
      });

      // Mock PR creation
      documentService.createPullRequest = jest.fn().mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/1'
      });

      const result = await documentService.generateADR(
        context,
        technicalAnalysis,
        'Testing Framework Selection'
      );

      // THIS SHOULD FAIL - current flow doesn't handle file existence properly
      expect(result.success).toBe(true);
      expect(documentService.getFileContent).toHaveBeenCalled();
      expect(documentService.createFileInBranch).toHaveBeenCalledWith(
        context,
        'add-adr-testing-framework',
        expect.stringContaining('ADR-'),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Current Broken Behavior Documentation (Red Phase)', () => {
    test('documents current SHA-not-supplied error', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      // Simulate the exact error scenario that's currently happening
      mockMCPClientManager.callTool.mockResolvedValue({
        isError: true,
        error: 'failed to create/update file: PUT https://api.github.com/repos/test-owner/test-repo/contents/documents/adr/ADR-001-unit-tests-deployment.md: 422 Invalid request.\n\n"sha" wasn\'t supplied. []'
      });

      const result = await documentService.createFileInBranch(
        context,
        'add-unit-tests-deployment-1',
        'documents/adr/ADR-001-unit-tests-deployment.md',
        '# ADR Content',
        'Add ADR'
      );

      // This documents the current broken behavior
      expect(result.success).toBe(false);
      expect(result.error).toContain('"sha" wasn\'t supplied');
      
      // Current implementation has this error - we need to fix it
      expect(mockMCPClientManager.callTool).toHaveBeenCalledWith('github', 'create_or_update_file',
        expect.not.objectContaining({
          sha: expect.any(String)
        })
      );
    });
  });
});