import { describe, test, expect, jest } from '@jest/globals';
import { BaseCommand } from '../base-command.js';

describe('BaseCommand Context Preparation', () => {
  test('prepareRepositoryContext should include getRepository method', () => {
    const mockConfigService = { getConfig: () => ({}) };
    const mockSessionService = { logInteraction: jest.fn() };
    const mockMcpClientManager = {};
    
    const baseCommand = new BaseCommand(mockConfigService, mockSessionService, mockMcpClientManager);
    
    const options = { repo: 'owner/repo-name', verbose: true };
    const sessionId = 'test-session';
    
    const context = baseCommand.prepareRepositoryContext(options, sessionId);
    
    // The DocumentService expects getRepository() method to exist
    expect(context.getRepository).toBeDefined();
    expect(typeof context.getRepository).toBe('function');
    expect(context.getRepository()).toBe('owner/repo-name');
  });
});