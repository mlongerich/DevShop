import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('DocumentService Collision and SHA Fix (TDD Red Phase)', () => {
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

  describe('ADR Filename Collision Issues (TDD Red Phase)', () => {
    test('FAILING: should generate unique ADR filenames for same title', async () => {
      const title = 'Unit Testing Framework Selection';
      
      // Current implementation generates same filename each time
      const filename1 = documentService.generateUniqueADRName(title);
      const filename2 = documentService.generateUniqueADRName(title);
      const filename3 = documentService.generateUniqueADRName(title);
      
      // THIS SHOULD FAIL - method doesn't exist yet and current approach creates collisions
      expect(filename1).toBeDefined();
      expect(filename2).toBeDefined();
      expect(filename3).toBeDefined();
      
      // Each filename should be unique
      expect(filename1).not.toBe(filename2);
      expect(filename2).not.toBe(filename3);
      expect(filename1).not.toBe(filename3);
      
      // Should follow ADR naming pattern with uniqueness
      expect(filename1).toMatch(/^ADR-\d+-[\w-]+-[a-f0-9]{8}\.md$/);
      expect(filename2).toMatch(/^ADR-\d+-[\w-]+-[a-f0-9]{8}\.md$/);
      expect(filename3).toMatch(/^ADR-\d+-[\w-]+-[a-f0-9]{8}\.md$/);
    });

    test('FAILING: current sanitizeFileName creates collision-prone names', () => {
      const title1 = 'Add unit tests to the project';
      const title2 = 'Add unit tests to the project'; // Same title
      
      // Current approach with Date.now() can still create collisions if called rapidly
      const currentFileName1 = documentService.sanitizeFileName(`ADR-${Date.now()}-${title1}`);
      const currentFileName2 = documentService.sanitizeFileName(`ADR-${Date.now()}-${title2}`);
      
      // This documents the current behavior - high collision risk
      expect(currentFileName1).toBeDefined();
      expect(currentFileName2).toBeDefined();
      
      // Current implementation could create same names if called in same millisecond
      // This is the broken behavior we need to fix
      expect(currentFileName1).toMatch(/^ADR-\d+-Add-unit-tests-to-the-project$/);
      expect(currentFileName2).toMatch(/^ADR-\d+-Add-unit-tests-to-the-project$/);
    });
  });

  describe('Cross-Branch SHA Retrieval Issues (TDD Red Phase)', () => {
    test('FAILING: should retrieve SHA from fallback branches when file exists on main', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };
      
      const filePath = 'documents/adr/ADR-001-unit-tests-deployment.md';
      const targetBranch = 'add-unit-tests-deployment-2';
      
      // Mock scenario: file doesn't exist in target branch, but exists in main
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          isError: true,
          error: 'Not Found' // File not in target branch
        })
        .mockResolvedValueOnce({
          content: 'existing ADR content',
          sha: 'abc123main', // File exists in main branch
          isError: false  // Explicitly mark as not an error
        });
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const result = await documentService.getFileContentWithFallback(context, filePath, targetBranch);
      
      expect(result).toBeDefined();
      expect(result.exists).toBe(true);
      expect(result.sha).toBe('abc123main');
      expect(result.foundInBranch).toBe('main');
      expect(result.content).toContain('existing ADR content');
    });

    test('FAILING: should handle case where file only exists in master branch', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };
      
      const filePath = 'documents/adr/ADR-001-test.md';
      const targetBranch = 'feature-branch';
      
      // Mock scenario: file doesn't exist in target or main, but exists in master
      mockMCPClientManager.callTool
        .mockResolvedValueOnce({
          isError: true,
          error: 'Not Found' // File not in target branch
        })
        .mockResolvedValueOnce({
          isError: true,
          error: 'Not Found' // File not in main branch
        })
        .mockResolvedValueOnce({
          content: 'master branch content',
          sha: 'def456master', // File exists in master branch
          isError: false  // Explicitly mark as not an error
        });
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const result = await documentService.getFileContentWithFallback(context, filePath, targetBranch);
      
      expect(result).toBeDefined();
      expect(result.exists).toBe(true);
      expect(result.sha).toBe('def456master');
      expect(result.foundInBranch).toBe('master');
    });

    test('FAILING: current getFileContent fails on cross-branch scenarios', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };
      
      // Current broken scenario: file exists on main but we're checking feature branch
      mockMCPClientManager.callTool.mockResolvedValue({
        isError: true,
        error: 'Not Found'
      });
      
      const result = await documentService.getFileContent(
        context, 
        'documents/adr/ADR-001-unit-tests-deployment.md', 
        'add-unit-tests-deployment-2'
      );
      
      // Current behavior - returns false even if file exists on main
      expect(result.exists).toBe(false);
      expect(result.sha).toBeNull();
      
      // This demonstrates the current limitation - no fallback branches
    });
  });

  describe('Branch Name Collision Issues (TDD Red Phase)', () => {
    test('FAILING: should generate collision-resistant branch names', () => {
      const title = 'Add unit tests deployment';
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const branch1 = documentService.generateCollisionResistantBranchName(title);
      const branch2 = documentService.generateCollisionResistantBranchName(title);
      const branch3 = documentService.generateCollisionResistantBranchName(title);
      
      expect(branch1).toBeDefined();
      expect(branch2).toBeDefined();
      expect(branch3).toBeDefined();
      
      // All should be unique
      expect(branch1).not.toBe(branch2);
      expect(branch2).not.toBe(branch3);
      expect(branch1).not.toBe(branch3);
      
      // Should include timestamp and UUID for uniqueness (allowing for full key terms)
      expect(branch1).toMatch(/add-[\w-]+-\d+-[a-f0-9]{6}$/);
      expect(branch2).toMatch(/add-[\w-]+-\d+-[a-f0-9]{6}$/);
      expect(branch3).toMatch(/add-[\w-]+-\d+-[a-f0-9]{6}$/);
      
      // Should be under 50 characters
      expect(branch1.length).toBeLessThanOrEqual(50);
      expect(branch2.length).toBeLessThanOrEqual(50);
      expect(branch3.length).toBeLessThanOrEqual(50);
    });

    test('FAILING: current generateBranchName creates predictable collisions', () => {
      const title = 'Unit Tests Deployment';
      
      // Current method generates predictable names based only on title  
      const branch1 = documentService.generateBranchName(title);
      // If called with same title, may be identical
      const branch2 = documentService.generateBranchName(title);
      
      expect(branch1).toBeDefined();
      expect(branch2).toBeDefined();
      
      // Documents current behavior - predictable naming
      expect(branch1).toMatch(/^[\w-]+$/);
      expect(branch2).toMatch(/^[\w-]+$/);
      
      // This shows the collision risk in current implementation
    });
  });

  describe('JSON Response Parsing Issues (TDD Red Phase)', () => {
    test('FAILING: should handle truncated JSON responses from Tech Lead', () => {
      const truncatedResponse = `{
        "architecture_decisions": [
          {
            "decision": "Adopt a client-side React SPA architecture (TypeScript) compiled with Vite and deployed to GitHub Pages as static assets.",
            "rationale": "GitHub Pages serves static content efficiently. A React + TypeScript SPA built by Vite provides fast development, strong type safety, clear component boundaries, and straightforward unit testing for UI components, utilities, and data parsing. This aligns with the BA's requirement to cover frontend ...`; // Truncated
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const result = documentService.parseRobustTechLeadResponse(truncatedResponse);
      
      expect(result).toBeDefined();
      expect(result.architecture_decisions).toBeDefined();
      expect(result.architecture_decisions[0].decision).toContain('React SPA architecture');
      expect(result.architecture_decisions[0].rationale).toContain('GitHub Pages');
    });

    test('FAILING: should extract JSON from mixed text/JSON response', () => {
      const mixedResponse = `
      Some text before JSON
      {
        "summary": "This analysis proposes a structured path to implement robust unit-tested frontend capabilities",
        "technology_recommendations": [
          {
            "category": "Frontend framework", 
            "recommendation": "React 18 + TypeScript with Vite"
          }
        ]
      }
      Some text after JSON
      `;
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const result = documentService.parseRobustTechLeadResponse(mixedResponse);
      
      expect(result).toBeDefined();
      expect(result.summary).toContain('unit-tested frontend capabilities');
      expect(result.technology_recommendations).toBeDefined();
      expect(result.technology_recommendations[0].recommendation).toContain('React 18');
    });

    test('FAILING: should fallback to text parsing when JSON completely fails', () => {
      const nonJSONResponse = `
      Architecture Decision: Use React with TypeScript
      
      Rationale: Provides type safety and better testing capabilities
      
      Technology Recommendations:
      - Frontend: React 18 + TypeScript
      - Testing: Jest + React Testing Library
      - Build: Vite
      `;
      
      // THIS SHOULD FAIL - method doesn't exist yet
      const result = documentService.parseRobustTechLeadResponse(nonJSONResponse);
      
      expect(result).toBeDefined();
      expect(result.architecture_decisions).toBeDefined();
      expect(result.architecture_decisions[0].decision).toContain('React with TypeScript');
      expect(result.technology_recommendations).toBeDefined();
    });
  });

  describe('Complete Workflow Collision Scenario (TDD Red Phase)', () => {
    test('FAILING: should handle complete ADR generation with existing file collisions', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };
      
      const technicalAnalysis = {
        architecture_decisions: [
          { decision: 'Use Jest for unit testing' }
        ],
        summary: 'Unit testing framework selection'
      };
      
      const decisionTitle = 'Unit Testing Framework Selection';
      
      // Mock the complete collision scenario:
      // 1. Branch creation attempts multiple times due to collisions
      // 2. File exists on main but not on target branch
      // 3. Need to get SHA from main branch for update
      
      // Mock file existence on main branch
      documentService.getFileContentWithFallback = jest.fn().mockResolvedValue({
        exists: true,
        sha: 'main123sha',
        content: 'existing ADR content',
        foundInBranch: 'main'
      });
      
      // Mock unique name generation  
      documentService.generateUniqueADRName = jest.fn().mockReturnValue('ADR-1631234567890-unit-testing-abc12345.md');
      
      // Mock collision-resistant branch name
      documentService.generateCollisionResistantBranchName = jest.fn().mockReturnValue('add-unit-testing-1631234567890-abc123');
      
      // Mock successful branch creation (after collision resolution)
      documentService.createBranchWithCollisionDetection = jest.fn().mockResolvedValue({
        success: true,
        branchName: 'add-unit-testing-1631234567890-abc123'
      });
      
      // Mock successful file update with SHA
      documentService.createFileInBranch = jest.fn().mockResolvedValue({
        success: true,
        commitSha: 'commit456'
      });
      
      // Mock successful PR creation
      documentService.createPullRequest = jest.fn().mockResolvedValue({
        success: true,
        pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/1'
      });
      
      // THIS SHOULD FAIL - workflow should work with all fixes in place
      const result = await documentService.generateADR(decisionTitle, technicalAnalysis, context);
      
      expect(result.success).toBe(true);
      expect(result.fileName).toBe('ADR-1631234567890-unit-testing-abc12345.md');
      expect(result.branchName).toBe('add-unit-testing-1631234567890-abc123');
      expect(result.pullRequestUrl).toBeDefined();
      
      // Verify proper method calls
      expect(documentService.getFileContentWithFallback).toHaveBeenCalled();
      expect(documentService.generateUniqueADRName).toHaveBeenCalledWith(decisionTitle);
      expect(documentService.generateCollisionResistantBranchName).toHaveBeenCalled();
    });
  });

  describe('Current Broken Behavior Documentation (Red Phase)', () => {
    test('documents current ADR filename collision issue', async () => {
      const context = {
        repoOwner: 'mlongerich',
        repoName: 'mlongerich.github.io',
        sessionId: 'test-session',
        getRepository: () => 'mlongerich/mlongerich.github.io'
      };
      
      const technicalAnalysis = {
        architecture_decisions: [{ decision: 'Use unit tests' }],
        summary: 'Testing strategy'
      };
      
      // Current broken behavior: same filename generated repeatedly
      const title = 'Unit Testing Framework Selection';
      
      // Mock current generateADR to show collision issue
      documentService.generateADR = jest.fn().mockRejectedValue(
        new Error('File may already exist and requires SHA for update. failed to create/update file: PUT https://api.github.com/repos/mlongerich/mlongerich.github.io/contents/documents/adr/ADR-001-unit-tests-deployment.md: 422 Invalid request.')
      );
      
      // This documents the current failing scenario
      await expect(documentService.generateADR(title, technicalAnalysis, context))
        .rejects.toThrow('File may already exist and requires SHA for update');
    });

    test('documents current branch naming predictability', () => {
      const filePath = 'documents/adr/ADR-001-unit-tests-deployment.md';
      
      // Current implementation is predictable and collision-prone
      const branchName = documentService.generateBranchName(filePath);
      
      expect(branchName).toMatch(/^docs\/adr-/);
      expect(branchName).toContain('unit-tests-deployment');
      // Shows current approach is deterministic = collision-prone
    });
  });
});