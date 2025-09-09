# Conversational BA Agent - Quick Reference

## Overview

DevShop v1.1.4 introduces a conversational Business Analyst agent that supports multi-turn conversations for iterative requirements gathering.

## Quick Start

```bash
# Start a new conversation
npm run ba -- --repo=org/repo --conversation "I need help with authentication"

# Continue the conversation  
npm run ba -- --repo=org/repo --session=abc-123 "I want to use OAuth instead"

# Finalize and create GitHub issues
npm run ba -- --repo=org/repo --session=abc-123 --finalize
```

## Key Features

- **Multi-turn Conversations**: Natural back-and-forth dialogue
- **Context Awareness**: BA remembers previous conversation turns  
- **Cost Tracking**: Per-turn and cumulative conversation costs
- **Persistent Sessions**: Resume conversations anytime, sessions never expire
- **Intelligent Finalization**: Creates comprehensive GitHub issues from conversation history
- **Backward Compatibility**: Legacy single-shot mode continues to work

## Conversation States

- **gathering**: Initial requirements collection phase
- **clarifying**: BA asking follow-up questions for clarification
- **proposing**: BA ready to propose specific issues
- **ready_to_finalize**: All requirements gathered, ready for issue creation
- **finalized**: Conversation complete with issues created

## Implementation Details

### Architecture Components

- **ConversationManager**: Manages conversation state and history (`client/services/conversation-manager.js`)
- **ConversationalBAAgent**: Extends BAAgent for multi-turn conversations (`client/agents/conversational-ba-agent.js`)
- **Enhanced ba-command.js**: Routes between conversation and legacy modes
- **Updated CLI Interface**: New conversation flags in `client/devshop-mcp.js`

### State Management

- Conversations stored using existing StateManager infrastructure
- Only user-visible conversation turns stored (not full JSON responses)
- Cost tracking per turn with running totals
- State persistence across sessions

### CLI Integration

The BA command now supports three modes:
- `--conversation <input>`: Start new conversation
- `--session <id>`: Continue existing conversation
- `--finalize`: Complete conversation and create issues

## Backward Compatibility

Legacy single-shot mode remains fully functional:
```bash
npm run ba -- --repo=org/repo "Feature description"
```

All existing DevShop functionality continues to work without changes.