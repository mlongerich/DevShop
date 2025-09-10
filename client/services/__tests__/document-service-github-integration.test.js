import { describe, test, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';

describe('DocumentService GitHub MCP Integration', () => {
  test('should call GitHub MCP create_branch tool directly instead of generic ref tools', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' },
          { name: 'some_other_tool', description: 'Other tool' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ success: true, branch: { name: 'test-branch' } })
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
    
    // Verify it called create_branch tool directly with correct GitHub MCP parameters
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'create_branch',
      {
        owner: 'test',
        repo: 'repo', 
        branch: 'test-branch',
        from_branch: 'main'
      }
    );
    
    // Should NOT call generic ref tools
    expect(mockMcpClientManager.callTool).not.toHaveBeenCalledWith(
      'github',
      expect.stringMatching(/ref|reference/),
      expect.any(Object)
    );
  });

  test('should call GitHub MCP create_or_update_file tool directly instead of generic file tools', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' },
          { name: 'some_other_tool', description: 'Other tool' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ success: true, content: { sha: 'abc123' } })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createFileInBranch(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch',
      'docs/adr-001.md',
      'ADR content here'
    );

    expect(result.success).toBe(true);
    
    // Verify it called create_or_update_file tool directly with correct GitHub MCP parameters
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'create_or_update_file',
      {
        owner: 'test',
        repo: 'repo',
        path: 'docs/adr-001.md',
        content: 'ADR content here',
        message: 'Add ADR: docs/adr-001.md',
        branch: 'test-branch'
      }
    );
    
    // Should NOT call generic file tools (but should call the specific GitHub MCP tool)
    expect(mockMcpClientManager.callTool).not.toHaveBeenCalledWith(
      'github',
      expect.stringMatching(/^(?!create_or_update_file$)(.*file.*|.*blob.*|.*content.*)$/),
      expect.any(Object)
    );
  });

  test('should call GitHub MCP create_pull_request tool directly instead of generic PR tools', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' },
          { name: 'some_other_tool', description: 'Other tool' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ success: true, pull_request: { number: 123, html_url: 'https://github.com/test/repo/pull/123' } })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch',
      'docs/adr-001.md',
      'Add ADR for user authentication system'
    );

    expect(result.success).toBe(true);
    
    // Verify it called create_pull_request tool directly with correct GitHub MCP parameters
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith(
      'github',
      'create_pull_request',
      {
        owner: 'test',
        repo: 'repo',
        title: 'docs: Add ADR for user authentication system',
        head: 'test-branch',
        base: 'main',
        body: expect.stringContaining('## ADR Documentation\n\nAdd ADR for user authentication system\n\n### File Added\n- `docs/adr-001.md`')
      }
    );
    
    // Should NOT call generic PR tools
    expect(mockMcpClientManager.callTool).not.toHaveBeenCalledWith(
      'github',
      expect.stringMatching(/^(?!create_pull_request$)(.*pull.*|.*pr.*|.*merge.*)$/),
      expect.any(Object)
    );
  });

  test('should handle nested GitHub MCP response structure for pull request creation', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' },
          { name: 'some_other_tool', description: 'Other tool' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ 
          success: true, 
          pull_request: { 
            number: 456, 
            html_url: 'https://github.com/test/repo/pull/456' 
          } 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'feature-branch',
      'docs/adr-002.md',
      'Add authentication system ADR'
    );

    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/456');
    expect(result.pullRequestNumber).toBe(456);
  });

  test('should handle GitHub MCP error responses for branch creation', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ 
          content: [{ message: 'Repository not found or access denied' }], 
          isError: true 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createBranch(
      { repoOwner: 'test', repoName: 'nonexistent-repo' },
      'test-branch'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Repository not found or access denied');
  });

  test('should handle GitHub MCP error responses for pull request creation', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ 
          content: [{ message: 'Branch does not exist' }], 
          isError: true 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'nonexistent-branch',
      'docs/adr-003.md',
      'Add test ADR'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Branch does not exist');
  });

  test('should handle GitHub MCP error responses for file creation', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        .mockResolvedValueOnce({ 
          content: [{ message: 'File path contains invalid characters' }], 
          isError: true 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createFileInBranch(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch',
      'docs/invalid<>file.md',
      'Test content',
      'Add test file'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('File path contains invalid characters');
  });

  test('should handle GitHub MCP error responses with text/type structure', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        // First call (main branch) - fails with non-404 error
        .mockResolvedValueOnce({ 
          content: [{ 
            type: 'text', 
            text: 'Repository access denied: insufficient permissions for test/repo' 
          }], 
          isError: true 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createBranch(
      { repoOwner: 'test', repoName: 'repo' },
      'test-branch'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Repository access denied');
    expect(result.error).toContain('insufficient permissions');
  });

  test('should try master branch when main branch fails with 404', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        // First call (main branch) - fails
        .mockResolvedValueOnce({ 
          content: [{ 
            type: 'text', 
            text: 'failed to get reference: GET https://api.github.com/repos/test/repo/git/ref/heads/main: 404 Not Found []' 
          }], 
          isError: true 
        })
        // Second call (master branch) - succeeds
        .mockResolvedValueOnce({ 
          success: true, 
          branch: { name: 'test-branch' } 
        })
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
    
    // Verify it tried main first, then master
    expect(mockMcpClientManager.callTool).toHaveBeenCalledTimes(2);
    expect(mockMcpClientManager.callTool).toHaveBeenNthCalledWith(1, 'github', 'create_branch', {
      owner: 'test',
      repo: 'repo',
      branch: 'test-branch',
      from_branch: 'main'
    });
    expect(mockMcpClientManager.callTool).toHaveBeenNthCalledWith(2, 'github', 'create_branch', {
      owner: 'test',
      repo: 'repo', 
      branch: 'test-branch',
      from_branch: 'master'
    });
  });

  test('should handle 422 validation error for PR creation with invalid base branch', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        // First call (main base) - fails with 422 invalid base 
        .mockResolvedValueOnce({ 
          content: [{ 
            type: 'text', 
            text: 'failed to create pull request: POST https://api.github.com/repos/test/repo/pulls: 422 Validation Failed [{Resource:PullRequest Field:base Code:invalid Message:}]' 
          }], 
          isError: true 
        })
        // Second call (master base) - also fails with 422 (both branches invalid)
        .mockResolvedValueOnce({ 
          content: [{ 
            type: 'text', 
            text: 'failed to create pull request: POST https://api.github.com/repos/test/repo/pulls: 422 Validation Failed [{Resource:PullRequest Field:base Code:invalid Message:}]' 
          }], 
          isError: true 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'feature-branch',
      'docs/adr-004.md',
      'Add new ADR'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('422 Validation Failed');
    expect(result.error).toContain('Field:base Code:invalid');
  });

  test('should try master base branch when main base fails with 422 invalid base', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_branch', description: 'Create a new branch' },
          { name: 'create_or_update_file', description: 'Create or update a file' },
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn()
        // First call (main base) - fails with 422 invalid base
        .mockResolvedValueOnce({ 
          content: [{ 
            type: 'text', 
            text: 'failed to create pull request: POST https://api.github.com/repos/test/repo/pulls: 422 Validation Failed [{Resource:PullRequest Field:base Code:invalid Message:}]' 
          }], 
          isError: true 
        })
        // Second call (master base) - succeeds
        .mockResolvedValueOnce({ 
          success: true, 
          pull_request: { 
            number: 789, 
            html_url: 'https://github.com/test/repo/pull/789' 
          } 
        })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const result = await documentService.createPullRequest(
      { repoOwner: 'test', repoName: 'repo' },
      'feature-branch', 
      'docs/adr-005.md',
      'Add master base ADR'
    );

    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/789');
    
    // Verify it tried main base first, then master base
    expect(mockMcpClientManager.callTool).toHaveBeenCalledTimes(2);
    expect(mockMcpClientManager.callTool).toHaveBeenNthCalledWith(1, 'github', 'create_pull_request', {
      owner: 'test',
      repo: 'repo',
      title: 'docs: Add master base ADR',
      head: 'feature-branch',
      base: 'main',
      body: expect.any(String)
    });
    expect(mockMcpClientManager.callTool).toHaveBeenNthCalledWith(2, 'github', 'create_pull_request', {
      owner: 'test',
      repo: 'repo',
      title: 'docs: Add master base ADR',
      head: 'feature-branch', 
      base: 'master',
      body: expect.any(String)
    });
  });
});