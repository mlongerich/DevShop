import { describe, test, expect } from '@jest/globals';
import { DocumentService } from '../document-service.js';

describe('DocumentService Config Tests', () => {
  test('should accept config parameter in constructor', () => {
    const mockMcpClientManager = {};
    const mockSessionService = {};
    const mockConfig = { github: { token: 'test-token' } };
    
    // This will fail until we add the config parameter
    const service = new DocumentService(mockMcpClientManager, mockSessionService, mockConfig);
    
    expect(service.config).toBe(mockConfig);
  });
});