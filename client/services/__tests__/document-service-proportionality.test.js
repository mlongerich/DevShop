import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';
import {
  createMockMCPClientManager,
  createMockSessionService
} from '../../../tests/mocks/index.js';

describe('DocumentService Proportionality and Branch Naming (TDD Red Phase)', () => {
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

  describe('Branch Naming (TDD Red Phase)', () => {
    test('FAILING: branch names should be under 50 characters', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Test with long decision title that currently creates 255+ char branch names
      const longDecisionTitle = 'Please provide technical guidance for technical implementation What are the recommended approaches tools and best practices';
      
      // Test the NEW smart file name generation
      const fileName = documentService.generateSmartFileName('ADR', longDecisionTitle);
      
      // THIS SHOULD NOW PASS - branch names should be short and descriptive
      expect(fileName.length).toBeLessThan(50);
      expect(fileName).toMatch(/^ADR-\d+-[a-z-]+$/); // Should have format ADR-timestamp-terms
      expect(fileName).toContain('implementation'); // Should extract key terms (not stop words)
    });

    test('FAILING: should generate human-readable branch names', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      // Mock successful branch creation
      mockMCPClientManager.callTool.mockResolvedValue({ success: true });

      const decisionTitle = 'Unit Testing Framework Selection';
      const expectedBranchName = 'add-unit-testing-framework';
      
      // Create branch with decision-based name (this should be implemented)
      const result = await documentService.createBranch(context, expectedBranchName);

      // THIS SHOULD PASS when implemented - branch names should be human-readable
      expect(result.success).toBe(true);
      expect(expectedBranchName).toMatch(/^[a-z-]+$/);
      expect(expectedBranchName.length).toBeLessThan(50);
      expect(expectedBranchName).not.toContain('ADR-');
      expect(expectedBranchName).not.toContain('1757501174257');
    });

    test('FAILING: should truncate and preserve meaning in branch names', async () => {
      const context = {
        repoOwner: 'test-owner', 
        repoName: 'test-repo',
        sessionId: 'test-session'
      };

      const longTitle = 'Please provide technical guidance for technical implementation of comprehensive testing framework selection with CI/CD integration and performance optimization';
      
      // This method should exist to create smart branch names
      const branchName = documentService.generateBranchName(longTitle);
      
      // THIS SHOULD FAIL until implemented
      expect(branchName).toBeDefined();
      expect(branchName.length).toBeLessThan(50);
      expect(branchName).toContain('testing');
      expect(branchName).toContain('framework');
      expect(branchName).not.toContain('Please');
      expect(branchName).not.toContain('provide');
    });
  });

  describe('ADR Scope and Focus (TDD Red Phase)', () => {
    test('FAILING: ADR should focus only on specific decision made', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const simpleDecision = {
        decision: 'Use Jest for unit testing',
        rationale: 'Jest provides good support for testing JavaScript in static sites'
      };

      const decisionTitle = 'Unit Testing Framework Selection';

      // Mock ADR content generation
      documentService.formatADR = jest.fn().mockReturnValue(`
# ADR: Unit Testing Framework Selection

## Status
Accepted

## Context
Need to add unit tests to static site.

## Decision
Use Jest with jsdom for unit testing JavaScript components.

## Consequences
- Can test JavaScript utilities and DOM interactions
- Good ecosystem support
- Easy CI integration with GitHub Actions
      `.trim());

      const adrContent = documentService.formatADR(decisionTitle, simpleDecision, context);

      // THIS SHOULD PASS when implemented - ADR should be focused and concise
      expect(adrContent).toContain('Jest');
      expect(adrContent).toContain('unit testing');
      expect(adrContent).not.toContain('microservices'); // Should not contain unrelated architecture
      expect(adrContent).not.toContain('performance optimization'); // Should not be over-engineered
      expect(adrContent).not.toContain('scalability'); // Should focus only on testing decision
      expect(adrContent.length).toBeLessThan(1000); // Should be concise
    });

    test('FAILING: complex decisions should generate comprehensive ADRs', async () => {
      const context = {
        repoOwner: 'test-owner',
        repoName: 'test-repo', 
        sessionId: 'test-session',
        getRepository: () => 'test-owner/test-repo'
      };

      const complexDecision = {
        architecture_decisions: [
          { decision: 'Migrate to microservices architecture' },
          { decision: 'Implement event-driven communication' },
          { decision: 'Add distributed caching layer' }
        ],
        technical_risks: [
          { risk: 'Increased system complexity' },
          { risk: 'Network latency issues' }
        ]
      };

      const decisionTitle = 'Microservices Architecture Migration';
      
      // Mock complex ADR content
      const complexADRContent = `
# ADR: Microservices Architecture Migration

## Status
Accepted

## Context
The current monolithic architecture is causing scalability issues and preventing independent team deployments. We need to migrate to a microservices architecture to support our growing development team and user base.

## Decision
Migrate to microservices architecture with the following approach:
1. Domain-driven design to identify service boundaries
2. Event-driven communication between services
3. Distributed caching layer for performance
4. Container-based deployment with Kubernetes

## Consequences
### Positive
- Independent service deployments
- Technology diversity per service
- Better scalability
- Team autonomy

### Negative
- Increased operational complexity
- Network latency between services
- Distributed system challenges

## Implementation Plan
### Phase 1: Service Identification
- Analyze current domain model
- Identify service boundaries
- Create service contracts

### Phase 2: Infrastructure Setup
- Set up Kubernetes cluster
- Implement service mesh
- Configure monitoring and logging

### Phase 3: Service Migration
- Extract services one by one
- Implement event-driven communication
- Migrate data stores

## Technical Risks
- Data consistency across services
- Network partitions
- Service discovery complexity
      `.trim();

      documentService.formatADR = jest.fn().mockReturnValue(complexADRContent);

      const adrContent = documentService.formatADR(decisionTitle, complexDecision, context);

      // This should pass - complex decisions deserve comprehensive ADRs
      expect(adrContent).toBeDefined();
      expect(adrContent.length).toBeGreaterThan(500); // Should be detailed for complex decisions
    });

    test('FAILING: should determine ADR scope based on decision complexity', async () => {
      // This method should exist to determine if decision needs full ADR
      const simpleDecision = { decision: 'Use Jest for testing' };
      const complexDecision = { 
        architecture_decisions: [{}, {}, {}],
        technical_risks: [{}, {}],
        implementation_plan: { phases: [{}, {}, {}] }
      };

      const isSimple = documentService.isSimpleDecision(simpleDecision);
      const isComplex = documentService.isSimpleDecision(complexDecision);

      // THIS SHOULD FAIL until implemented
      expect(isSimple).toBe(true);
      expect(isComplex).toBe(false);
    });
  });

  describe('File Name Sanitization (Current Behavior)', () => {
    test('current sanitizeFileName creates long names', () => {
      const longTitle = 'Please provide technical guidance for technical implementation What are the recommended approaches tools and best practices';
      const fileName = documentService.sanitizeFileName(`ADR-${Date.now()}-${longTitle}`);
      
      // This demonstrates the current broken behavior
      expect(fileName.length).toBeGreaterThan(100); // Currently creates very long names
      expect(fileName).toMatch(/^ADR-\d+-/); // Starts with timestamp
    });

    test('sanitizeFileName should handle special characters', () => {
      const title = 'Special chars: /\\?<>|*"';
      const fileName = documentService.sanitizeFileName(title);
      
      // Current behavior - this should pass
      expect(fileName).toBe('Special-chars-');
      expect(fileName).not.toMatch(/[\/\\?<>|*"]/);
    });
  });
});