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

  test('should not include DevShop footer in PR description', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValue({
        success: true,
        pull_request: {
          number: 123,
          html_url: 'https://github.com/test/repo/pull/123'
        }
      })
    };

    const mockSessionService = { logDir: '/tmp/test' };
    const service = new DocumentService(mockMcpClientManager, mockSessionService);
    
    const context = { repoOwner: 'test', repoName: 'repo', sessionId: 'test-session' };
    
    // Test the createPullRequest method directly
    await service.createPullRequest(context, 'feature-branch', 'docs/adr/test.md', 'Add ADR');
    
    // Check that the PR body doesn't contain DevShop footer
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith('github', 'create_pull_request', 
      expect.objectContaining({
        body: expect.not.stringContaining('Generated by DevShop AI Assistant')
      })
    );
    expect(mockMcpClientManager.callTool).toHaveBeenCalledWith('github', 'create_pull_request', 
      expect.objectContaining({
        body: expect.not.stringContaining('*Generated by DevShop AI Assistant*')
      })
    );
  });

  test('should not include auto-generation footer in ADR content', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Test technical analysis',
      architecture_decisions: [
        {
          decision: 'Use microservices',
          rationale: 'Better scalability',
          impact: 'Positive'
        }
      ],
      implementation_plan: 'Test implementation plan'
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'test-session'
    };
    
    const adrContent = service.formatADR('Test Decision', mockAnalysis, context);
    
    // Should not contain auto-generation footer
    expect(adrContent).not.toContain('This ADR was generated automatically');
    expect(adrContent).not.toContain('*This ADR was generated automatically and should be reviewed by the technical team.*');
  });

  test('should generate clean and professional ADR content', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Technical analysis for implementing user authentication system',
      architecture_decisions: [
        {
          decision: 'Use OAuth 2.0 with JWT tokens',
          rationale: 'Industry standard with good security practices',
          impact: 'Improved security and user experience'
        }
      ],
      implementation_plan: {
        overview: 'Implement authentication in 3 phases',
        critical_path: 'Database setup -> Auth service -> Frontend integration'
      },
      technology_recommendations: [
        {
          category: 'Authentication Library',
          recommendation: 'Auth0 SDK',
          rationale: 'Well-maintained and secure'
        }
      ]
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'test-session'
    };
    
    const adrContent = service.formatADR('User Authentication System', mockAnalysis, context);
    
    // Should contain clean, structured content
    expect(adrContent).toContain('# Architectural Decision Record: User Authentication System');
    expect(adrContent).toContain('## Architecture Decisions');
    expect(adrContent).toContain('### Use OAuth 2.0 with JWT tokens');
    expect(adrContent).toContain('**Rationale:** Industry standard with good security practices');
    expect(adrContent).toContain('## Technology Recommendations');
    expect(adrContent).toContain('### Authentication Library');
    
    // Should not contain any automated footers or unprofessional content
    expect(adrContent).not.toContain('Generated by DevShop');
    expect(adrContent).not.toContain('automatically');
    
    // Should have a clean, professional ending
    expect(adrContent).toMatch(/---\s*$/);
  });

  test('should not include session ID in ADR header', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Test analysis',
      architecture_decisions: [{ decision: 'Test decision', rationale: 'Test rationale' }]
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'test-session-12345'
    };
    
    const adrContent = service.formatADR('Test Decision', mockAnalysis, context);
    
    // Should not contain session ID in header
    expect(adrContent).not.toContain('**Session:** test-session-12345');
    expect(adrContent).not.toContain('**Session:**');
  });

  test('should not include technical analysis session footer in ADR', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Test analysis',
      architecture_decisions: [{ decision: 'Test decision', rationale: 'Test rationale' }]
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'session-abc-123'
    };
    
    const adrContent = service.formatADR('Test Decision', mockAnalysis, context);
    
    // Should not contain technical analysis session footer
    expect(adrContent).not.toContain('Technical Analysis Session: session-abc-123');
    expect(adrContent).not.toContain('Technical Analysis Session:');
  });

  test('should not include session ID in BDR header', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Business analysis summary',
      business_requirements: [{ requirement: 'Test requirement', priority: 'High' }]
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'bdr-session-456'
    };
    
    const bdrContent = service.formatBDR('Business Decision', mockAnalysis, context);
    
    // Should not contain session ID in header
    expect(bdrContent).not.toContain('**Session:** bdr-session-456');
    expect(bdrContent).not.toContain('**Session:**');
  });

  test('should not include business analysis session footer in BDR', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Business analysis summary',
      business_requirements: [{ requirement: 'Test requirement', priority: 'High' }]
    };
    
    const context = {
      getRepository: () => 'test/repo',
      sessionId: 'business-session-789'
    };
    
    const bdrContent = service.formatBDR('Business Decision', mockAnalysis, context);
    
    // Should not contain business analysis session footer
    expect(bdrContent).not.toContain('Business Analysis Session: business-session-789');
    expect(bdrContent).not.toContain('Business Analysis Session:');
  });

  test('should generate completely clean ADR with no session references', () => {
    const service = new DocumentService({}, {});
    
    const mockAnalysis = {
      summary: 'Professional technical analysis',
      architecture_decisions: [
        {
          decision: 'Use clean architecture patterns',
          rationale: 'Better maintainability and testability',
          impact: 'Positive long-term impact'
        }
      ]
    };
    
    const context = {
      getRepository: () => 'professional/project',
      sessionId: 'should-not-appear-anywhere'
    };
    
    const adrContent = service.formatADR('Professional Architecture Decision', mockAnalysis, context);
    
    // Should be completely clean of any session references
    expect(adrContent).not.toContain('should-not-appear-anywhere');
    expect(adrContent).not.toContain('Session:');
    expect(adrContent).not.toContain('Technical Analysis Session');
    expect(adrContent).not.toContain('Business Analysis Session');
    
    // Should still contain essential professional information
    expect(adrContent).toContain('# Architectural Decision Record: Professional Architecture Decision');
    expect(adrContent).toContain('**Repository:** professional/project');
    expect(adrContent).toContain('**Status:** Proposed');
    expect(adrContent).toContain('## Architecture Decisions');
    expect(adrContent).toContain('### Use clean architecture patterns');
  });

  test('should handle GitHub MCP content array response format gracefully', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValue({
        // This is the actual response format causing the issue
        content: [
          {
            type: 'text',
            text: 'Pull request created successfully at https://github.com/test/repo/pull/456'
          }
        ]
      })
    };

    const mockSessionService = { logDir: '/tmp/test' };
    const service = new DocumentService(mockMcpClientManager, mockSessionService);
    
    const context = { repoOwner: 'test', repoName: 'repo', sessionId: 'test-session' };
    const result = await service.createPullRequest(context, 'feature-branch', 'docs/test.md', 'Add test');
    
    // Should still return success (maintained working behavior)
    expect(result.success).toBe(true);
    
    // UPDATED: Now extracts URL from content array (improvement made)
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/456');
    expect(result.pullRequestNumber).toBe(456);
  });

  test('should maintain backward compatibility with existing PR response format', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValue({
        success: true,
        pull_request: {
          number: 123,
          html_url: 'https://github.com/test/repo/pull/123'
        }
      })
    };

    const mockSessionService = { logDir: '/tmp/test' };
    const service = new DocumentService(mockMcpClientManager, mockSessionService);
    
    const context = { repoOwner: 'test', repoName: 'repo', sessionId: 'test-session' };
    const result = await service.createPullRequest(context, 'feature-branch', 'docs/test.md', 'Add test');
    
    // Should work perfectly with existing format
    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/123');
    expect(result.pullRequestNumber).toBe(123);
  });

  test('should return success even when GitHub MCP response is missing URL data', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValue({
        // Response with no URL data - should still succeed
        success: true,
        message: 'PR created but URL not provided'
      })
    };

    const mockSessionService = { logDir: '/tmp/test' };
    const service = new DocumentService(mockMcpClientManager, mockSessionService);
    
    const context = { repoOwner: 'test', repoName: 'repo', sessionId: 'test-session' };
    const result = await service.createPullRequest(context, 'feature-branch', 'docs/test.md', 'Add test');
    
    // Key requirement: should still return success (don't break working behavior)
    expect(result.success).toBe(true);
    expect(result.pullRequestUrl).toBeUndefined();
    expect(result.pullRequestNumber).toBeUndefined();
  });

  test('should extract PR URL from GitHub MCP content array response', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_pull_request', description: 'Create a pull request' }
        ]
      }),
      callTool: jest.fn().mockResolvedValue({
        // This represents the enhanced parsing we want to support
        content: [
          {
            type: 'text',
            text: 'Pull request created successfully at https://github.com/test/repo/pull/789'
          }
        ]
      })
    };

    const mockSessionService = { logDir: '/tmp/test' };
    const service = new DocumentService(mockMcpClientManager, mockSessionService);
    
    const context = { repoOwner: 'test', repoName: 'repo', sessionId: 'test-session' };
    const result = await service.createPullRequest(context, 'feature-branch', 'docs/test.md', 'Add test');
    
    // Should still succeed
    expect(result.success).toBe(true);
    
    // NEW: Should extract URL from content text
    expect(result.pullRequestUrl).toBe('https://github.com/test/repo/pull/789');
    expect(result.pullRequestNumber).toBe(789);
  });
});