import { describe, test, expect, jest } from '@jest/globals';
import { TLCommand } from '../tl-command.js';

describe('TLCommand DocumentService Config', () => {
  test('should pass config to DocumentService constructor', () => {
    const mockConfig = { github: { token: 'test-token' } };
    const mockConfigService = {
      getConfig: jest.fn().mockReturnValue(mockConfig)
    };
    const mockSessionService = {};
    const mockMcpClientManager = {};
    
    const command = new TLCommand(mockConfigService, mockSessionService, mockMcpClientManager);
    
    // This will fail until DocumentService receives config
    expect(command.documentService.config).toBe(mockConfig);
  });
});