import { describe, test, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';

describe('DocumentService Tool Discovery', () => {
  test('should successfully handle wrapped object with discoverTools', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_ref', description: 'Create a new branch' },
          { name: 'get_ref', description: 'Get reference info' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ object: { sha: 'abc123' } }) // get_ref response
        .mockResolvedValueOnce({ success: true }) // create_ref response
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    // This should now work with discoverTools handling the wrapped object format
    const result = await documentService.createBranch(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch'
    );

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('test-branch');
  });

  test('should find branch tools using capability-based discovery', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'github_get_reference', description: 'Get a git reference' },
          { name: 'github_create_reference', description: 'Create a new git reference' },
          { name: 'other_tool', description: 'Something else' }
        ]
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const { getRefTool, createRefTool } = await documentService.findBranchTools();

    expect(getRefTool).toBeDefined();
    expect(getRefTool.name).toBe('github_get_reference');
    expect(createRefTool).toBeDefined();
    expect(createRefTool.name).toBe('github_create_reference');
  });

  test('should use discovered tools in createBranch method', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'github_get_reference', description: 'Get a git reference' },
          { name: 'github_create_reference', description: 'Create a new git reference' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ object: { sha: 'abc123' } }) // get reference response
        .mockResolvedValueOnce({ success: true }) // create reference response
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createBranch(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch'
    );

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('test-branch');
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'github_get_reference',
      expect.objectContaining({ ref: 'heads/main' })
    );
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'github_create_reference',
      expect.objectContaining({ ref: 'refs/heads/test-branch' })
    );
  });

  test('should find pull request tools using capability-based discovery', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'github_create_pull_request', description: 'Create a pull request' },
          { name: 'github_list_pulls', description: 'List pull requests' },
          { name: 'other_tool', description: 'Something else' }
        ]
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const prTool = await documentService.findPullRequestTools();

    expect(prTool).toBeDefined();
    expect(prTool.name).toBe('github_create_pull_request');
  });

  test('should use discovered tools in createPullRequest method', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'github_create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValueOnce({ 
        html_url: 'https://github.com/test/repo/pull/123', 
        number: 123 
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch',
      'documents/adr/test.md',
      'Add test ADR document'
    );

    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/123');
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'github_create_pull_request',
      expect.objectContaining({
        head: 'test-branch',
        base: 'main',
        title: 'docs: Add test ADR document'
      })
    );
  });

  test('should find file creation tools using capability-based discovery', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'github_create_file', description: 'Create a file in repository' },
          { name: 'github_update_file', description: 'Update existing file' },
          { name: 'other_tool', description: 'Something else' }
        ]
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const fileTool = await documentService.findFileCreationTools();

    expect(fileTool).toBeDefined();
    expect(fileTool.name).toBe('github_create_file');
  });
});