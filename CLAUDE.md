# Claude Code Integration for DevShop 1.1

This file provides context for Claude Code when working on the DevShop project.

## Project Overview

DevShop 1.1 is a completely refactored self-improving development shop using MCP (Model Context Protocol) and AI agents with modern service architecture. It features:

- **Service Layer Architecture**: Clean separation of concerns with dedicated services
- **Command Pattern Implementation**: Modular CLI commands with consistent interfaces
- **Agent Abstraction Layer**: Extensible AI agents with base class inheritance
- **Design Patterns**: Strategy, Factory, Command, and Decorator patterns throughout
- **Multi-Provider LLM Support**: OpenAI, Anthropic, Google with smart model selection

## Architecture (v1.1)

### Service Layer

- `client/services/config-service.js` - Configuration management and environment variable resolution
- `client/services/session-service.js` - Session lifecycle management and logging coordination
- `client/services/mcp-client-manager.js` - MCP client factory and connection management
- `client/services/test-service.js` - System testing and validation orchestration
- `client/services/conversation-manager.js` - Conversational state and history management

### Command Layer (Command Pattern)

- `client/commands/base-command.js` - Abstract base command with common functionality
- `client/commands/ba-command.js` - Business analyst workflow command (both single-shot and conversational)
- `client/commands/dev-command.js` - Developer workflow command
- `client/commands/test-command.js` - System testing and diagnostics command
- `client/commands/logs-command.js` - Log viewing and management command
- `client/commands/setup-command.js` - Initial setup and configuration command

### Agent Layer (Abstract Base Classes)

- `client/agents/base-agent.js` - Abstract base agent with common interfaces
- `client/agents/ba-agent.js` - Business analyst agent implementation (single-shot mode)
- `client/agents/conversational-ba-agent.js` - Conversational BA agent for multi-turn requirements gathering
- `client/agents/developer-agent.js` - Developer agent implementation

### Provider Layer (Strategy Pattern)
- `servers/providers/base-provider.js` - Abstract provider interface
- `servers/providers/openai-provider.js` - OpenAI GPT implementation
- `servers/providers/anthropic-provider.js` - Anthropic Claude implementation
- `servers/providers/google-provider.js` - Google Gemini implementation
- `servers/providers/provider-factory.js` - Factory for provider creation
- `servers/providers/provider-manager.js` - Provider lifecycle management

### Server Architecture
- `servers/fastmcp-litellm-server.js` - FastMCP LiteLLM server (production, 282 lines)
- `servers/decorators/` - Usage tracking decorator pattern
- `servers/config/` - Centralized configuration management

## Commands to Remember

### Setup and Testing

```bash
npm run setup          # Initial configuration with setup wizard
npm run setup --force  # Force overwrite existing configuration
npm test               # Test all connections and functionality
npm test --full        # Comprehensive system check
npm test --connections # Test only MCP server connections
npm test --apis        # Test only API integrations
npm run status         # Quick system health check
```

### Development Workflows

```bash
# Business Analyst workflows - Single-shot mode (legacy)
npm run ba -- --repo=org/repo "feature description"
npm run ba -- --repo=org/repo --verbose "detailed analysis request"

# Business Analyst workflows - Conversational mode
npm run ba -- --repo=org/repo --conversation "I need help adding a login system"
npm run ba -- --repo=org/repo --session=abc-123 "I want to use OAuth instead"
npm run ba -- --repo=org/repo --session=abc-123 --finalize

# Developer workflows
npm run dev -- --repo=org/repo --issue=N
npm run dev -- --repo=org/repo --issue=N --branch=feature-branch
npm run dev -- --repo=org/repo --issue=N --dry-run
npm run dev -- --repo=org/repo --session=def-456 --verbose
```

### Log Management

```bash
npm run logs --list              # List all sessions
npm run logs --session=<id>     # View specific session
npm run logs --session=<id> --verbose  # Detailed session view
npm run logs --session=<id> --export   # Export session logs
npm run logs --limit=50         # Show recent activity
npm run logs --errors           # Show only error logs
```

### System Management

```bash
npm run status                   # System health overview
DEBUG=1 npm run test --verbose   # Debug mode testing
npm run github-server           # Start GitHub MCP server
npm run github-server:stop      # Stop GitHub MCP server
```

### Container Security Management

```bash
npm run fastmcp:container       # Start secure FastMCP container
npm run fastmcp:container:stop  # Stop containerized FastMCP server
npm run fastmcp:container:logs  # Monitor container logs
npm run test:security           # Test container security configuration
```

## Conversational BA Agent (New in v1.1.4)

DevShop now supports multi-turn conversations with the Business Analyst agent for iterative requirements gathering.

### Conversation Workflow

```bash
# Start a new conversation
npm run ba -- --repo=org/repo --conversation "I need help adding authentication"

# Continue the conversation with follow-up questions
npm run ba -- --repo=org/repo --session=abc-123 "I want to use OAuth with Google"

# Finalize conversation and create GitHub issues
npm run ba -- --repo=org/repo --session=abc-123 --finalize
```

### Key Features

- **Multi-turn Conversations**: Iterative requirements gathering with context awareness
- **Cost Tracking**: Per-turn and cumulative conversation costs displayed
- **Persistent Sessions**: Conversations don't expire and can be resumed anytime
- **Automatic Issue Creation**: Finalize conversations to generate comprehensive GitHub issues
- **Backward Compatibility**: Legacy single-shot mode continues to work unchanged

### Conversation States

- **gathering**: Initial requirements collection phase
- **clarifying**: BA asking follow-up questions for clarification
- **proposing**: BA ready to propose specific issues
- **ready_to_finalize**: All requirements gathered, ready for issue creation
- **finalized**: Conversation complete with issues created

## Model Configuration

### Environment Variable Priority System
DevShop 1.1 now implements centralized model configuration with environment variable priority through the BaseAgent class:

**Priority Order**: Environment Variables → Config Files → Default Fallback

### Configuring Models via .env
```bash
# Override default models for specific agents
OPENAI_BA_MODEL=gpt-5-nano           # Business Analyst agent model
OPENAI_DEV_MODEL=gpt-5-nano          # Developer agent model

# These override settings in config/default.json
```

### Supported Model Examples
```bash
# OpenAI Models
OPENAI_BA_MODEL=gpt-5-nano
OPENAI_BA_MODEL=gpt-4o
OPENAI_BA_MODEL=gpt-4o-mini

# Anthropic Models (use config/default.json for these)
# config/default.json: "ba": "claude-3.5-sonnet"
# config/default.json: "developer": "claude-3-haiku"
```

### Model Compatibility Features
- **Temperature Handling**: gpt-5-nano models automatically skip temperature parameter (unsupported)
- **Automatic Selection**: All agents use BaseAgent.getModelForAgent() for consistent model selection
- **Future-Proof**: New agents automatically inherit proper model configuration

### Testing Model Configuration
```bash
# Verify your model is being used (check output for "model": "your-model-name")
npm run ba -- --repo=your-org/repo --verbose "test request"
```

## Key Files to Understand

### Main Orchestrator
1. `client/devshop-mcp.js` - **Main CLI orchestrator (v1.1)** - Clean service-oriented architecture

### Core Services
2. `client/services/config-service.js` - Configuration loading, validation, and environment resolution
3. `client/services/session-service.js` - Session management with logging and state coordination
4. `client/services/mcp-client-manager.js` - Factory for MCP clients with connection management
5. `client/services/test-service.js` - Comprehensive system testing and validation

### Command Implementation
6. `client/commands/base-command.js` - Base class with common command functionality
7. `client/commands/ba-command.js` - Business analyst workflow with requirements analysis
8. `client/commands/dev-command.js` - Developer workflow with code implementation

### Agent Framework

9. `client/agents/base-agent.js` - Abstract base for all AI agents
10. `client/agents/ba-agent.js` - Business analyst agent with GitHub integration
11. `client/agents/conversational-ba-agent.js` - Conversational BA agent for multi-turn requirements gathering
12. `client/agents/developer-agent.js` - Developer agent with code generation

### MCP Client Layer

13. `client/clients/fastmcp-direct-client.js` - **FastMCP client** - Enhanced session management
14. `client/clients/github-direct-client.js` - Direct GitHub MCP client (bypasses SDK issues)

### Provider Architecture

15. `servers/providers/provider-factory.js` - Strategy pattern for LLM provider creation
16. `servers/fastmcp-litellm-server.js` - **FastMCP server** - Modern FastMCP implementation

### Utilities and Configuration

17. `utils/logger.js` - File-based logging utility functions
18. `utils/state-manager.js` - JSON file-based state management
19. `config/default.json` - Configuration template with multi-provider settings
20. `config/fastmcp.json` - **FastMCP configuration (recommended)** - Enhanced session features

### Container Security Files

21. `servers/Dockerfile.fastmcp` - **Security-hardened FastMCP container** - Multi-stage build with security
22. `docker-compose.fastmcp.yml` - **Container orchestration** - Security policies and resource limits
23. `scripts/start-fastmcp-server.sh` - **Secure container startup** - Docker secrets and validation
24. `test-container-security.js` - **Security test suite** - Container security validation
25. `CONTAINER_SECURITY_GUIDE.md` - **Security documentation** - Complete containerization guide

## Design Patterns Applied

### Strategy Pattern

- **LLM Providers**: Pluggable provider implementations (OpenAI, Anthropic, Google)
- **Model Selection**: Agent-specific optimal model selection
- **Cost Optimization**: Provider switching based on cost/performance

### Factory Pattern

- **Provider Creation**: `ProviderFactory` creates appropriate provider instances
- **MCP Client Creation**: `MCPClientManager` creates and manages client connections
- **Command Instantiation**: Orchestrator creates command instances

### Command Pattern

- **CLI Operations**: Each CLI command is a separate class with `execute()` method
- **Server Tools**: Server operations implemented as command classes
- **Undo/Redo Ready**: Command structure supports future undo functionality

### Decorator Pattern

- **Usage Tracking**: `UsageTrackingDecorator` wraps provider calls
- **Cost Monitoring**: Transparent cost tracking across all LLM operations
- **Performance Metrics**: Request/response timing decoration

### Abstract Base Classes

- **Consistent Interfaces**: `BaseCommand`, `BaseAgent`, `BaseProvider`
- **Shared Functionality**: Common error handling and logging
- **Extension Points**: Easy to add new commands, agents, providers

### Dependency Injection

- **Service Composition**: Services injected into commands and agents
- **Testability**: Easy mocking and testing of individual components
- **Loose Coupling**: Components depend on interfaces, not implementations

## When Making Changes

### Adding New Components

- **Commands**: Extend `BaseCommand`, implement `execute()`, add to orchestrator
- **Agents**: Extend `BaseAgent`, implement `execute()`, create corresponding command
- **Providers**: Extend `BaseProvider`, implement provider API, add to factory

### Testing Guidelines

- **Unit Tests**: Test individual services and commands in isolation
- **Integration Tests**: Test command workflows end-to-end
- **Provider Tests**: Test each LLM provider integration
- **System Tests**: Run `npm test --full` after changes
- **Container Security Tests**: Run `npm run test:security` to validate container hardening
- **FastMCP Tests**: Use `npm run test:fastmcp:quick` for FastMCP validation

### Code Quality

- **Follow Patterns**: Use existing design patterns consistently
- **Error Handling**: Use service layer error handling and logging
- **Documentation**: Update this file and README.md for architectural changes
- **Separation of Concerns**: Keep services, commands, and agents focused

### Debugging and Diagnostics

- **System Status**: Use `npm run status` for quick health check
- **Comprehensive Testing**: Use `npm test --full --verbose` for detailed diagnostics
- **Session Debugging**: Use `npm run logs --session=<id> --verbose` for workflow analysis
- **Component Testing**: Test individual services with `npm test --connections` or `npm test --apis`

## Architecture Benefits

### Maintainability
- **Reduced Complexity**: Main orchestrator reduced from 724 to ~200 lines
- **Single Responsibility**: Each component has a clear, focused purpose
- **Clear Dependencies**: Explicit service injection and interfaces

### Testability
- **Isolated Components**: Each service/command can be tested independently
- **Mock-Friendly**: Dependency injection enables easy mocking
- **Comprehensive Coverage**: Multiple test modes for different scenarios

### Extensibility
- **Plugin Architecture**: Easy to add new commands, agents, providers
- **Configuration Driven**: New models and providers via configuration
- **Pattern Consistency**: New components follow established patterns

### Reliability
- **Error Boundaries**: Comprehensive error handling at each layer
- **Graceful Degradation**: System continues working if individual components fail
- **Health Monitoring**: Built-in diagnostics and status reporting

## Recent Improvements

### v1.1.4 - Conversational BA Agent

- **Multi-turn Conversations**: Complete conversation system for iterative requirements gathering
- **Conversation State Management**: Persistent conversation sessions with state tracking
- **Cost Tracking**: Per-turn and cumulative conversation cost monitoring
- **Automatic Issue Creation**: Finalize conversations to generate comprehensive GitHub issues
- **Backward Compatibility**: Legacy single-shot mode preserved alongside new conversation features

### v1.1.3 - Response Formatting Enhancement

- **Clean Output Display**: LLM responses now show formatted markdown instead of raw JSON
- **Escape Sequence Processing**: Automatic conversion of `\\n` → newlines, `\\\"` → quotes
- **FastMCP Response Parsing**: Fixed nested JSON structure parsing for proper content extraction
- **GitHub Issue Formatting**: Issues now contain clean markdown instead of escaped JSON

### GitHub Repository Integration
- **Enhanced Parameter Fallbacks**: Comprehensive parameter sets for different GitHub MCP tool types
- **Improved Tool Discovery**: Dynamic GitHub tool discovery with 8+ fallback parameter combinations
- **Repository Access Fix**: Resolved "missing path parameter" errors with smart parameter handling
- **Success/Failure Logging**: Better visibility into GitHub tool execution status

### Model Configuration System
- **Environment Variable Priority**: `.env` settings now properly override config file values
- **Centralized Model Selection**: `getModelForAgent()` method for consistent model assignment
- **Temperature Compatibility**: Smart temperature handling for models that don't support it (gpt-5-nano)
- **Multi-Provider Support**: Seamless switching between OpenAI, Anthropic, and Google models

### Code Quality Improvements
- **Stale Code Removal**: Cleaned up outdated TODO comments and unused parameters
- **Dynamic Tool Discovery**: Replaced hardcoded MCP tool calls with flexible discovery system
- **Professional Issue Generation**: Removed DevShop footers from generated GitHub issues
- **Enhanced Error Handling**: Better error messages with troubleshooting guidance

## Development Workflow

### Local Development
1. **Make Changes**: Edit services, commands, agents, or providers
2. **Test Components**: `npm test --connections` or `npm test --apis`
3. **Test Integration**: `npm test --full`
4. **Test Workflows**: `npm run ba --dry-run` or `npm run dev --dry-run`
5. **Check Status**: `npm run status` for overall health

### Self-Improvement Workflow
DevShop 1.1 can work on its own codebase:
```bash
# Analyze improvement opportunities
npm run ba -- --repo=your-org/devshop "Add web dashboard for monitoring"

# Implement the improvement
npm run dev -- --repo=your-org/devshop --issue=1

# Monitor the process
npm run logs --session=<session-id> --verbose
```

This is a self-improving system - DevShop 1.1 can enhance its own architecture using the clean patterns established!