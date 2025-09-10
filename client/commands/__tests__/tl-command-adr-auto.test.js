import { describe, test, expect, jest } from '@jest/globals';
import { TLCommand } from '../tl-command.js';

describe('TLCommand Auto ADR Generation', () => {
  test('should auto-generate ADR when multiAgent option is true', async () => {
    const mockConfig = { github: { token: 'test-token' } };
    const mockConfigService = {
      getConfig: jest.fn().mockReturnValue(mockConfig)
    };
    const mockSessionService = {
      createSession: jest.fn().mockReturnValue('test-session'),
      logInteraction: jest.fn()
    };
    const mockMcpClientManager = {};
    
    const command = new TLCommand(mockConfigService, mockSessionService, mockMcpClientManager);
    
    // Mock the generateADR method to track if it gets called
    command.generateADR = jest.fn().mockResolvedValue({ success: true });
    
    // Mock other methods to avoid full execution
    command.validateOptions = jest.fn();
    command.createOrResumeSession = jest.fn().mockResolvedValue('test-session');
    command.prepareRepositoryContext = jest.fn().mockReturnValue({
      repoOwner: 'test',
      repoName: 'repo'
    });
    command.executeAgent = jest.fn().mockResolvedValue({
      architecture_decisions: ['Use microservices'],
      content: 'Technical analysis complete'
    });
    
    const options = {
      repo: 'test/repo',
      description: 'Add authentication',
      multiAgent: true  // This should trigger auto ADR generation
    };
    
    try {
      await command.handleStandaloneTechAnalysis(options);
    } catch (error) {
      // Ignore execution errors, we only care about generateADR being called
    }
    
    // This will fail until we implement auto-ADR generation for multiAgent mode
    expect(command.generateADR).toHaveBeenCalled();
  });
  
  test('should auto-generate ADR in collaboration mode when technical analysis is complete', async () => {
    const mockConfig = { github: { token: 'test-token' } };
    const mockConfigService = {
      getConfig: jest.fn().mockReturnValue(mockConfig)
    };
    const mockSessionService = {};
    const mockMcpClientManager = {};
    
    const command = new TLCommand(mockConfigService, mockSessionService, mockMcpClientManager);
    
    // Mock generateADR to track calls
    command.generateADR = jest.fn().mockResolvedValue({ success: true });
    
    // Mock other methods
    command.communicationService = {
      collaborateWithBA: jest.fn().mockResolvedValue({
        completed: true,
        finalAnalysis: { decisions: ['Use microservices'] }
      })
    };
    command.prepareRepositoryContext = jest.fn().mockReturnValue({});
    
    const options = {
      collaborate: true,
      session: 'test-session'
    };
    
    try {
      await command.handleMultiAgentCollaboration(options);
    } catch (error) {
      // Ignore execution errors
    }
    
    // This will fail until collaboration mode auto-generates ADRs
    expect(command.generateADR).toHaveBeenCalled();
  });
});