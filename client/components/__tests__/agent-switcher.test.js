import { describe, test, beforeEach, afterEach, expect, jest } from '@jest/globals';

describe('AgentSwitcher Tests', () => {
  let AgentSwitcher;
  let agentSwitcher;
  let mockConversationalAgent;
  let mockTechLeadAgent;
  let mockConversationManager;
  let originalConsole;

  beforeEach(async () => {
    const module = await import('../agent-switcher.js');
    AgentSwitcher = module.AgentSwitcher;

    // Create mock agents
    mockConversationalAgent = {
      getName: jest.fn().mockReturnValue('ba-agent'),
      execute: jest.fn().mockResolvedValue({ response: 'BA response', cost: 0.05 })
    };

    mockTechLeadAgent = {
      getName: jest.fn().mockReturnValue('tl-agent'),
      execute: jest.fn().mockResolvedValue({ response: 'TL response', cost: 0.08 })
    };

    mockConversationManager = {
      recordAgentHandoff: jest.fn().mockResolvedValue()
    };

    agentSwitcher = new AgentSwitcher(
      mockConversationalAgent,
      mockTechLeadAgent,
      mockConversationManager
    );

    // Mock console to avoid test noise
    originalConsole = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsole;
  });

  describe('Initialization', () => {
    test('should initialize with default single-agent mode', () => {
      expect(agentSwitcher.multiAgentMode).toBe(false);
      expect(agentSwitcher.activeAgent).toBe('ba');
      expect(agentSwitcher.verbose).toBe(false);
    });

    test('should initialize with multi-agent mode when enabled', () => {
      const multiSwitcher = new AgentSwitcher(
        mockConversationalAgent,
        mockTechLeadAgent,
        mockConversationManager,
        { multiAgent: true, verbose: true }
      );

      expect(multiSwitcher.multiAgentMode).toBe(true);
      expect(multiSwitcher.activeAgent).toBe('ba');
      expect(multiSwitcher.verbose).toBe(true);
    });

    test('should store agent references', () => {
      expect(agentSwitcher.conversationalAgent).toBe(mockConversationalAgent);
      expect(agentSwitcher.techLeadAgent).toBe(mockTechLeadAgent);
      expect(agentSwitcher.conversationManager).toBe(mockConversationManager);
    });
  });

  describe('State Queries', () => {
    test('should report multi-agent mode status', () => {
      expect(agentSwitcher.isMultiAgentMode()).toBe(false);

      agentSwitcher.multiAgentMode = true;
      expect(agentSwitcher.isMultiAgentMode()).toBe(true);
    });

    test('should return active agent', () => {
      expect(agentSwitcher.getActiveAgent()).toBe('ba');

      agentSwitcher.activeAgent = 'tl';
      expect(agentSwitcher.getActiveAgent()).toBe('tl');
    });

    test('should return current agent instance', () => {
      expect(agentSwitcher.getCurrentAgent()).toBe(mockConversationalAgent);

      agentSwitcher.multiAgentMode = true;
      agentSwitcher.activeAgent = 'tl';
      expect(agentSwitcher.getCurrentAgent()).toBe(mockTechLeadAgent);
    });

    test('should check tech lead availability', () => {
      expect(agentSwitcher.isTechLeadAvailable()).toBe(true);

      agentSwitcher.techLeadAgent = null;
      expect(agentSwitcher.isTechLeadAvailable()).toBe(false);
    });
  });

  describe('Basic Agent Switching', () => {
    beforeEach(() => {
      agentSwitcher.multiAgentMode = true;
    });

    test('should switch to valid agent types', async () => {
      expect(await agentSwitcher.switchAgent('tl')).toBe(true);
      expect(agentSwitcher.activeAgent).toBe('tl');

      expect(await agentSwitcher.switchAgent('ba')).toBe(true);
      expect(agentSwitcher.activeAgent).toBe('ba');
    });

    test('should reject invalid agent types', async () => {
      expect(await agentSwitcher.switchAgent('invalid')).toBe(false);
      expect(agentSwitcher.activeAgent).toBe('ba'); // Unchanged
    });

    test('should not switch in single-agent mode', async () => {
      agentSwitcher.multiAgentMode = false;

      expect(await agentSwitcher.switchAgent('tl')).toBe(false);
      expect(agentSwitcher.activeAgent).toBe('ba');
    });

    test('should log verbose switching', async () => {
      agentSwitcher.verbose = true;

      await agentSwitcher.switchAgent('tl');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔄 Switched from ba to tl'));
    });
  });

  describe('Specialized Agent Switching', () => {
    beforeEach(() => {
      agentSwitcher.multiAgentMode = true;
    });

    test('should switch to tech lead with session recording', async () => {
      const result = await agentSwitcher.switchToTechLead('session-123');

      expect(result).toBe(true);
      expect(agentSwitcher.activeAgent).toBe('tl');
      expect(mockConversationManager.recordAgentHandoff).toHaveBeenCalledWith(
        'session-123',
        'ba',
        'tl',
        'Switched to Tech Lead agent'
      );
    });

    test('should switch to business analyst with session recording', async () => {
      agentSwitcher.activeAgent = 'tl';

      const result = await agentSwitcher.switchToBusinessAnalyst('session-123');

      expect(result).toBe(true);
      expect(agentSwitcher.activeAgent).toBe('ba');
      expect(mockConversationManager.recordAgentHandoff).toHaveBeenCalledWith(
        'session-123',
        'tl',
        'ba',
        'Switched to Business Analyst agent'
      );
    });

    test('should fail to switch to tech lead when not available', async () => {
      agentSwitcher.techLeadAgent = null;

      const result = await agentSwitcher.switchToTechLead('session-123');

      expect(result).toBe(false);
      expect(agentSwitcher.activeAgent).toBe('ba');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Tech Lead agent not available'));
    });

    test('should fail specialized switches in single-agent mode', async () => {
      agentSwitcher.multiAgentMode = false;

      expect(await agentSwitcher.switchToTechLead('session-123')).toBe(false);
      expect(await agentSwitcher.switchToBusinessAnalyst('session-123')).toBe(false);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️ Multi-agent mode is not enabled'));
    });
  });

  describe('Active Agent Switching', () => {
    beforeEach(() => {
      agentSwitcher.multiAgentMode = true;
    });

    test('should toggle from BA to TL', async () => {
      const result = await agentSwitcher.switchActiveAgent('session-123');

      expect(result).toBe('tl');
      expect(agentSwitcher.activeAgent).toBe('tl');
      expect(mockConversationManager.recordAgentHandoff).toHaveBeenCalledWith(
        'session-123',
        'ba',
        'tl',
        'Switched from ba to tl'
      );
    });

    test('should toggle from TL to BA', async () => {
      agentSwitcher.activeAgent = 'tl';

      const result = await agentSwitcher.switchActiveAgent('session-123');

      expect(result).toBe('ba');
      expect(agentSwitcher.activeAgent).toBe('ba');
    });

    test('should fail toggle when tech lead not available', async () => {
      agentSwitcher.techLeadAgent = null;

      const result = await agentSwitcher.switchActiveAgent('session-123');

      expect(result).toBe(null);
      expect(agentSwitcher.activeAgent).toBe('ba');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Tech Lead agent not available'));
    });

    test('should fail toggle in single-agent mode', async () => {
      agentSwitcher.multiAgentMode = false;

      const result = await agentSwitcher.switchActiveAgent('session-123');

      expect(result).toBe(null);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️ Multi-agent mode is not enabled'));
    });
  });

  describe('Intent Detection', () => {
    beforeEach(() => {
      agentSwitcher.multiAgentMode = true;
    });

    test('should detect technical intent', () => {
      const techInputs = [
        'What is the best architecture for this system?',
        'How should we implement the database layer?',
        'Can you help with the API design?',
        'We need to optimize performance',
        'What testing framework should we use?'
      ];

      techInputs.forEach(input => {
        expect(agentSwitcher.detectIntentForAgent(input)).toBe('tl');
      });
    });

    test('should detect business intent', () => {
      const businessInputs = [
        'What are the requirements for this feature?',
        'Can you create user stories for the login?',
        'What should the acceptance criteria be?',
        'How does this workflow function?',
        'What are the business rules for validation?'
      ];

      businessInputs.forEach(input => {
        expect(agentSwitcher.detectIntentForAgent(input)).toBe('ba');
      });
    });

    test('should return null for unclear intent', () => {
      const unclearInputs = [
        'Hello',
        'Can you help me?',
        'What do you think?',
        'Tell me about this project'
      ];

      unclearInputs.forEach(input => {
        expect(agentSwitcher.detectIntentForAgent(input)).toBe(null);
      });
    });

    test('should return null in single-agent mode', () => {
      agentSwitcher.multiAgentMode = false;

      expect(agentSwitcher.detectIntentForAgent('What is the architecture?')).toBe(null);
    });
  });

  describe('Command Parsing', () => {
    test('should parse TL commands', () => {
      expect(agentSwitcher.parseAgentCommand('@tl help with architecture')).toEqual({
        agent: 'tl',
        message: 'help with architecture'
      });

      expect(agentSwitcher.parseAgentCommand('@techLead design review')).toEqual({
        agent: 'tl',
        message: 'design review'
      });

      expect(agentSwitcher.parseAgentCommand('@tl')).toEqual({
        agent: 'tl',
        message: ''
      });
    });

    test('should parse BA commands', () => {
      expect(agentSwitcher.parseAgentCommand('@ba create user stories')).toEqual({
        agent: 'ba',
        message: 'create user stories'
      });

      expect(agentSwitcher.parseAgentCommand('@business requirements')).toEqual({
        agent: 'ba',
        message: 'requirements'
      });

      expect(agentSwitcher.parseAgentCommand('@ba')).toEqual({
        agent: 'ba',
        message: ''
      });
    });

    test('should return null for non-agent commands', () => {
      expect(agentSwitcher.parseAgentCommand('regular message')).toBe(null);
      expect(agentSwitcher.parseAgentCommand('help')).toBe(null);
      expect(agentSwitcher.parseAgentCommand('@invalid command')).toBe(null);
    });

    test('should detect switch commands', () => {
      expect(agentSwitcher.isSwitchCommand('switch')).toBe(true);
      expect(agentSwitcher.isSwitchCommand('SWITCH')).toBe(true);
      expect(agentSwitcher.isSwitchCommand(' switch ')).toBe(true);
      
      expect(agentSwitcher.isSwitchCommand('help')).toBe(false);
      expect(agentSwitcher.isSwitchCommand('switch agent')).toBe(false);
    });
  });

  describe('Display Methods', () => {
    test('should display agent status in multi-agent mode', () => {
      agentSwitcher.multiAgentMode = true;

      agentSwitcher.displayAgentStatus();
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🤖 Multi-Agent Status:'));
      expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('🤖 Business Analyst'));
      expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Available'));
    });

    test('should warn when displaying status in single-agent mode', () => {
      agentSwitcher.displayAgentStatus();
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️ Multi-agent mode is not enabled'));
    });

    test('should show unavailable tech lead', () => {
      agentSwitcher.multiAgentMode = true;
      agentSwitcher.techLeadAgent = null;

      agentSwitcher.displayAgentStatus();
      
      expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Not Available'));
    });
  });

  describe('Agent Info Utilities', () => {
    test('should return correct display names', () => {
      expect(agentSwitcher.getAgentDisplayName('ba')).toBe('Business Analyst');
      expect(agentSwitcher.getAgentDisplayName('tl')).toBe('Tech Lead');
    });

    test('should return correct icons', () => {
      expect(agentSwitcher.getAgentIcon('ba')).toBe('🤖');
      expect(agentSwitcher.getAgentIcon('tl')).toBe('🏗️');
    });

    test('should return formatted agent info', () => {
      const info = agentSwitcher.getAgentInfo('ba');
      expect(info).toEqual({
        type: 'ba',
        name: 'Business Analyst',
        icon: '🤖',
        isActive: true
      });

      agentSwitcher.activeAgent = 'tl';
      const tlInfo = agentSwitcher.getAgentInfo('tl');
      expect(tlInfo.isActive).toBe(true);

      const baInfo = agentSwitcher.getAgentInfo('ba');
      expect(baInfo.isActive).toBe(false);
    });

    test('should use active agent when no type specified', () => {
      agentSwitcher.activeAgent = 'tl';
      const info = agentSwitcher.getAgentInfo();
      
      expect(info.type).toBe('tl');
      expect(info.name).toBe('Tech Lead');
      expect(info.isActive).toBe(true);
    });
  });

  describe('Mode Management', () => {
    test('should enable multi-agent mode', () => {
      const newTechAgent = { getName: () => 'new-tl' };
      
      agentSwitcher.enableMultiAgentMode(newTechAgent);
      
      expect(agentSwitcher.multiAgentMode).toBe(true);
      expect(agentSwitcher.techLeadAgent).toBe(newTechAgent);
    });

    test('should disable multi-agent mode', () => {
      agentSwitcher.multiAgentMode = true;
      agentSwitcher.activeAgent = 'tl';
      
      agentSwitcher.disableMultiAgentMode();
      
      expect(agentSwitcher.multiAgentMode).toBe(false);
      expect(agentSwitcher.activeAgent).toBe('ba');
      expect(agentSwitcher.techLeadAgent).toBe(null);
    });

    test('should reset to default agent', () => {
      agentSwitcher.activeAgent = 'tl';
      
      agentSwitcher.resetToDefault();
      
      expect(agentSwitcher.activeAgent).toBe('ba');
    });
  });

  describe('Help and Commands', () => {
    test('should return multi-agent commands when enabled', () => {
      agentSwitcher.multiAgentMode = true;
      
      const commands = agentSwitcher.getMultiAgentCommands();
      
      expect(commands).toHaveLength(4);
      expect(commands[0]).toEqual({
        command: '@tl [message]',
        description: 'Switch to or invoke Tech Lead agent'
      });
      expect(commands[3]).toEqual({
        command: 'agents',
        description: 'Show multi-agent status'
      });
    });

    test('should return empty commands when disabled', () => {
      const commands = agentSwitcher.getMultiAgentCommands();
      expect(commands).toHaveLength(0);
    });
  });

  describe('Auto-switching Logic', () => {
    beforeEach(() => {
      agentSwitcher.multiAgentMode = true;
    });

    test('should suggest auto-switch when intent differs', () => {
      agentSwitcher.activeAgent = 'ba';
      
      expect(agentSwitcher.shouldAutoSwitch('What is the best architecture?')).toBe('tl');
      
      agentSwitcher.activeAgent = 'tl';
      expect(agentSwitcher.shouldAutoSwitch('What are the requirements?')).toBe('ba');
    });

    test('should not suggest switch when intent matches current', () => {
      agentSwitcher.activeAgent = 'ba';
      
      expect(agentSwitcher.shouldAutoSwitch('What are the user stories?')).toBe(null);
    });

    test('should not suggest switch when intent unclear', () => {
      expect(agentSwitcher.shouldAutoSwitch('Hello there')).toBe(null);
    });

    test('should not suggest switch in single-agent mode', () => {
      agentSwitcher.multiAgentMode = false;
      
      expect(agentSwitcher.shouldAutoSwitch('What is the architecture?')).toBe(null);
    });
  });
});