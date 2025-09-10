import { describe, test, expect, jest } from '@jest/globals';
import { BACommand } from '../ba-command.js';

describe('BACommand Interactive Mode Initial Input', () => {
  test('should pass initial input to interactive mode when provided', async () => {
    const mockConfig = { github: { token: 'test-token' } };
    const mockConfigService = {
      getConfig: jest.fn().mockReturnValue(mockConfig)
    };
    const mockSessionService = {
      logInteraction: jest.fn()
    };
    const mockMcpClientManager = {};
    
    const command = new BACommand(mockConfigService, mockSessionService, mockMcpClientManager);
    
    // Mock the handleInteractiveMode method to capture what options it receives
    command.handleInteractiveMode = jest.fn().mockResolvedValue({ success: true });
    
    const options = {
      repo: 'test/repo',
      interactive: true,
      multiAgent: true,
      description: 'i want to add unit tests' // This should be passed from CLI input
    };
    
    await command.execute(options);
    
    // Verify that handleInteractiveMode was called with the description
    expect(command.handleInteractiveMode).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'i want to add unit tests'
      })
    );
  });
});