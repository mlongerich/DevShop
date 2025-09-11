import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('DocumentService Branch Detection and ADR Naming (TDD Green Phase)', () => {
  let documentService;
  let mockMCPClientManager;
  let mockSessionService;
  let mockConfig;
  
  beforeEach(() => {
    mockMCPClientManager = createMockMCPClientManager();
    mockSessionService = createMockSessionService();
    mockConfig = { github: { token: 'test-token' } };
    
    documentService = new DocumentService(mockMCPClientManager, mockSessionService, mockConfig);
    
    // Mock GitHub MCP tools
    mockMCPClientManager.callTool = jest.fn();
    documentService.discoverTools = jest.fn().mockResolvedValue([
      { name: 'create_branch' },
      { name: 'create_or_update_file' },
      { name: 'create_pull_request' }
    ]);
  });

  describe('Branch Collision Detection (TDD Green Phase)', () => {
    test('should detect branch collisions and generate alternative names', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Mock GitHub MCP to simulate branch collision (422 Reference already exists)
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          success: false,
          error: 'failed to create branch: POST https://api.github.com/repos/test-owner/test-repo/git/refs: 422 Reference already exists []'
        })
        .mockResolvedValueOnce({
          success: true,
          branchName: 'add-adr-unit-testing-1'
        });

      // Test branch collision detection and incremental naming
      const result = await documentService.createBranchWithCollisionDetection(context, 'add-adr-unit-testing');
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe('add-adr-unit-testing-1');
      expect(mockMCPClientManager.callTool).toHaveBeenCalledTimes(2);
    });

    test('should increment branch numbers on multiple collisions', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Mock multiple branch collisions
      const collisionError = {
        success: false,
        error: 'failed to create branch: POST https://api.github.com/repos/test-owner/test-repo/git/refs: 422 Reference already exists []'
      };

      mockMCPClientManager.callTool
        .mockResolvedValueOnce(collisionError) // add-adr-unit-testing exists
        .mockResolvedValueOnce(collisionError) // add-adr-unit-testing-1 exists
        .mockResolvedValueOnce(collisionError) // add-adr-unit-testing-2 exists
        .mockResolvedValueOnce({
          success: true,
          branchName: 'add-adr-unit-testing-3'
        });

      // Test multiple branch collision handling
      const result = await documentService.createBranchWithCollisionDetection(context, 'add-adr-unit-testing');
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe('add-adr-unit-testing-3');
      expect(mockMCPClientManager.callTool).toHaveBeenCalledTimes(4);
    });

    test('should handle other branch creation errors appropriately', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Mock different error (not collision)
      mockMCPClientManager.callTool.mockResolvedValueOnce({
        success: false,
        error: 'failed to create branch: 403 Forbidden'
      });

      // Test non-collision error handling
      const result = await documentService.createBranchWithCollisionDetection(context, 'add-adr-unit-testing');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('403 Forbidden');
      expect(mockMCPClientManager.callTool).toHaveBeenCalledTimes(1);
    });
  });

  describe('ADR Filename Generation (TDD Green Phase)', () => {
    test('ADR filenames should be under 50 characters and readable', () => {
      const longTitle = 'Great—let\'s gather the requirements to add unit tests. Two quick clarifying questions';
      
      // Current behavior generates 255+ character names
      const currentFileName = documentService.sanitizeFileName(`ADR-${Date.now()}-${longTitle}`);
      expect(currentFileName.length).toBeGreaterThan(100); // Demonstrates current issue
      
      // Test readable filename generation
      const smartFileName = documentService.generateReadableADRName(longTitle);
      expect(smartFileName.length).toBeLessThan(50);
      expect(smartFileName).toMatch(/^ADR-\d{3}-[a-z-]+\.md$/);
      expect(smartFileName).toContain('unit-tests');
      expect(smartFileName).not.toContain('Great');
      expect(smartFileName).not.toContain('gather');
    });

    test('should generate sequential ADR numbers', () => {
      // Test sequential ADR numbering
      const fileName1 = documentService.generateReadableADRName('Unit Testing Framework');
      const fileName2 = documentService.generateReadableADRName('Database Selection');
      
      expect(fileName1).toMatch(/^ADR-001-/);
      expect(fileName2).toMatch(/^ADR-002-/);
    });

    test('should extract meaningful terms from technical titles', () => {
      const testCases = [
        {
          title: 'Add unit tests to the static site',
          expected: 'ADR-001-unit-testing.md'
        },
        {
          title: 'Choose testing framework for JavaScript utilities',
          expected: 'ADR-002-testing-framework.md'
        },
        {
          title: 'Database migration strategy and implementation plan',
          expected: 'ADR-003-database-migration.md'
        }
      ];

      testCases.forEach(({ title, expected }, index) => {
        // Reset counter for predictable numbering
        documentService.resetADRCounter = jest.fn();
        
        const fileName = documentService.generateReadableADRName(title);
        expect(fileName.length).toBeLessThan(50);
        expect(fileName).toMatch(/^ADR-\d{3}-[a-z-]+\.md$/);
        expect(fileName).toContain(expected.split('-')[2]); // Extract key term
      });
    });
  });

  describe('Document Creation Verification (TDD Green Phase)', () => {
    test('should verify document was actually created in repository', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const technicalAnalysis = {
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest with jsdom'
        }]
      };

      // Mock successful branch creation, file creation, and PR creation
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({ success: true, branchName: 'test-branch' }) // Branch creation
        .mockResolvedValueOnce({ success: true, commit: { sha: 'abc123' } }) // File creation with commit SHA
        .mockResolvedValueOnce({ success: true, pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/1' }); // PR creation

      // Mock verification that document exists (for success case)
      documentService.getFileContent = jest.fn().mockResolvedValue('ADR content');

      // Test document creation verification
      const result = await documentService.generateADRWithVerification(
        'Unit Testing Framework',
        technicalAnalysis,
        context
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.commitSha).toBe('abc123');
    });

    test('should detect when document creation actually failed', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const technicalAnalysis = {
        technology_recommendations: [{
          category: 'Testing Framework',
          recommendation: 'Jest with jsdom'
        }]
      };

      // Mock GitHub MCP claiming success but not actually creating file
      mockMCPClientManager.callTool.mockResolvedValue({
        success: true // Lies - file wasn't actually created
      });

      // Mock verification that file doesn't exist
      documentService.verifyDocumentExists = jest.fn().mockResolvedValue(false);

      // Test false positive detection
      const result = await documentService.generateADRWithVerification(
        'Unit Testing Framework',
        technicalAnalysis,
        context
      );

      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('Document creation claimed success but file not found');
    });
  });

  describe('Legacy Behavior Documentation (Green Phase)', () => {
    test('documents current long filename generation', () => {
      const longTitle = 'Great—let\'s gather the requirements to add unit tests. Two quick clarifying questions: 1) Which parts of the repo should be covered by unit tests (e.g., JavaScript utilities under assets/, any React components, other modules)? 2) Do you have a preferred testing framework (e.g., Jest, Mocha) and do you want me to set up a package.json with test scripts and CI (GitHub Actions) support?';
      
      const currentFileName = documentService.sanitizeFileName(`ADR-${Date.now()}-${longTitle}`);
      
      // This demonstrates the current broken behavior
      expect(currentFileName.length).toBeGreaterThan(255);
      expect(currentFileName).toContain('Great-let-s-gather');
      expect(currentFileName).toContain('clarifying-questions');
      expect(currentFileName).toContain('preferred-testing-framework');
    });

    test('documents current branch creation without collision detection', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Mock branch collision
      mockMCPClientManager.callTool.mockResolvedValue({
        success: false,
        error: 'failed to create branch: POST https://api.github.com/repos/test-owner/test-repo/git/refs: 422 Reference already exists []'
      });

      // Current behavior fails completely on collision
      const result = await documentService.createBranch(context, 'add-adr-unit-testing');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('422 Reference already exists');
      // No retry mechanism exists
    });
  });
});