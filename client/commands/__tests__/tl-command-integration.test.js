import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { TLCommand } from '../tl-command.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('TL Command Integration with New Document Service Methods', () => {
  let tlCommand;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfigService;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfigService = {
      getConfig: () => ({ github: { token: 'test-token' } })
    };
    
    tlCommand = new TLCommand(mockConfigService, mockSessionService, mockMCPClientManager);
    
    // Mock the document service methods
    tlCommand.documentService.discoverTools = jest.fn().mockResolvedValue([
      { name: 'create_branch' },
      { name: 'create_or_update_file' },
      { name: 'create_pull_request' }
    ]);
    
    // Mock the MCP client manager callTool method
    mockMCPClientManager.callTool = jest.fn();
  });

  describe('ADR Generation Integration', () => {
    test('should use generateADRWithVerification in production workflow', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const analysisResult = {
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest with jsdom'
        }],
        summary: 'Test analysis completed'
      };

      // Mock successful branch creation, file creation, and PR creation
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({ success: true, branchName: 'test-branch' }) // Branch creation
        .mockResolvedValueOnce({ success: true, commit: { sha: 'abc123' } }) // File creation
        .mockResolvedValueOnce({ success: true, pullRequestUrl: 'https://github.com/test/repo/pull/1' }); // PR creation

      // Mock verification success
      tlCommand.documentService.getFileContent = jest.fn().mockResolvedValue('ADR content');

      // Execute ADR generation
      const result = await tlCommand.generateADR(context, analysisResult, 'Unit Testing Framework');

      // Verify that verification was attempted and successful
      expect(result.verified).toBe(true);
      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileName.length).toBeLessThan(50); // Readable filename
      expect(result.fileName).toMatch(/^ADR-\d{3}-[a-z-]+\.md$/); // New format
      expect(result.commitSha).toBe('abc123');
    });

    test('should detect verification failures in production workflow', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const analysisResult = {
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest with jsdom'
        }]
      };

      // Mock successful creation but failed verification
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({ success: true, branchName: 'test-branch' })
        .mockResolvedValueOnce({ success: true, commit: { sha: 'abc123' } })
        .mockResolvedValueOnce({ success: true, pullRequestUrl: 'https://github.com/test/repo/pull/1' });

      // Mock verification failure
      tlCommand.documentService.getFileContent = jest.fn().mockRejectedValue(new Error('File not found'));

      // Execute ADR generation
      const result = await tlCommand.generateADR(context, analysisResult, 'Unit Testing Framework');

      // Verify that verification failure was detected
      expect(result.verified).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Document creation claimed success but file not found');
    });

    test('should use collision detection for branch creation', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const analysisResult = {
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest'
        }]
      };

      // Mock branch collision then success with incremented name
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({ 
          success: false, 
          error: 'failed to create branch: POST https://api.github.com/repos/test-owner/test-repo/git/refs: 422 Reference already exists []' 
        }) // First branch collision
        .mockResolvedValueOnce({ success: true, branchName: 'documents-adr-1' }) // Successful incremented branch
        .mockResolvedValueOnce({ success: true, commit: { sha: 'abc123' } }) // File creation
        .mockResolvedValueOnce({ success: true, pullRequestUrl: 'https://github.com/test/repo/pull/1' }); // PR creation

      // Mock verification success
      tlCommand.documentService.getFileContent = jest.fn().mockResolvedValue('ADR content');

      // Execute ADR generation
      const result = await tlCommand.generateADR(context, analysisResult, 'Unit Testing Framework');

      // Verify that branch collision was handled
      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(mockMCPClientManager.callTool).toHaveBeenCalledTimes(4); // 2 branch attempts + file + PR
    });
  });
});