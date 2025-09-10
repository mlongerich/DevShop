import { describe, test, expect, jest } from '@jest/globals';
import { DocumentService } from '../document-service.js';

describe('DocumentService SHA Extraction', () => {
  test('should extract SHA from GitHub API response with object.sha format', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: []
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const githubResponse = {
      object: {
        sha: 'abc123def456'
      }
    };

    const sha = documentService.extractShaFromResponse(githubResponse, 'test context');

    expect(sha).toBe('abc123def456');
  });

  test('should extract SHA from response with direct sha property', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: []
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const githubResponse = {
      sha: 'direct123sha456'
    };

    const sha = documentService.extractShaFromResponse(githubResponse, 'test context');

    expect(sha).toBe('direct123sha456');
  });

  test('should throw descriptive error when no SHA found in response', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: []
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    const githubResponse = {
      someOtherProperty: 'value'
    };

    expect(() => {
      documentService.extractShaFromResponse(githubResponse, 'test context');
    }).toThrow('test context: Could not extract SHA from response');
  });

  test('should handle null response gracefully', async () => {
    const mockMcpClientManager = {
      listTools: jest.fn().mockResolvedValue({
        tools: []
      })
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };

    const documentService = new DocumentService(mockMcpClientManager, mockSessionService, {});

    expect(() => {
      documentService.extractShaFromResponse(null, 'test context');
    }).toThrow('Response is null or undefined');
  });
});