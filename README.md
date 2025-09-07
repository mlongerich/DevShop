# DevShop 1.1 🚀

**Self-improving development shop using MCP (Model Context Protocol) and AI agents**

DevShop 1.1 is a completely refactored implementation featuring modern service architecture with design patterns. AI agents can analyze requirements, generate code, and continuously improve themselves using a clean, maintainable codebase built with Strategy, Factory, Command, and Decorator patterns.

## 🎯 What Does DevShop Do?

- **BA Agent**: Analyzes user requirements and creates detailed GitHub issues
- **Developer Agent**: Reads GitHub issues and implements features with clean code
- **Self-Improvement**: Can work on its own codebase to add new capabilities
- **Full Observability**: Logs all agent interactions, costs, and decisions
- **Cost Controls**: Built-in budgets and limits to prevent runaway spending
- **Modern Architecture**: Clean service layer with proper separation of concerns

## 🏗️ Architecture (v1.1)

DevShop 1.1 uses a modern service-oriented architecture with design patterns:

```
devshop/
├── client/
│   ├── devshop-mcp.js              # Main CLI orchestrator (v1.1)
│   ├── services/                   # Service Layer
│   │   ├── config-service.js       # Configuration management
│   │   ├── session-service.js      # Session lifecycle management
│   │   ├── mcp-client-manager.js   # MCP client factory & management
│   │   └── test-service.js         # System testing & validation
│   ├── commands/                   # Command Pattern Implementation
│   │   ├── base-command.js         # Abstract base command
│   │   ├── ba-command.js           # Business analyst workflow
│   │   ├── dev-command.js          # Developer workflow
│   │   ├── test-command.js         # System testing
│   │   ├── logs-command.js         # Log management
│   │   └── setup-command.js        # Initial setup
│   ├── agents/                     # Agent Abstraction Layer
│   │   ├── base-agent.js           # Abstract base agent
│   │   ├── ba-agent.js             # Business analyst agent
│   │   └── developer-agent.js      # Developer agent
│   ├── clients/                    # Direct MCP Clients
│   │   ├── github-direct-client.js # GitHub MCP integration
│   │   └── fastmcp-direct-client.js # FastMCP client
│   └── setup.js                    # Legacy setup (maintained for compatibility)
├── servers/
│   ├── fastmcp-litellm-server.js # FastMCP LiteLLM server
│   ├── providers/                  # Strategy Pattern for LLM Providers
│   │   ├── base-provider.js        # Abstract provider interface
│   │   ├── openai-provider.js      # OpenAI implementation
│   │   ├── anthropic-provider.js   # Anthropic Claude implementation
│   │   ├── google-provider.js      # Google Gemini implementation
│   │   ├── provider-factory.js     # Factory pattern for providers
│   │   └── provider-manager.js     # Provider lifecycle management
│   ├── commands/                   # Command Pattern for Server Operations
│   │   ├── chat-completion-command.js # LLM chat completions (legacy)
│   │   ├── usage-command.js        # Usage tracking (legacy)
│   │   └── limits-command.js       # Budget limit checks (legacy)
│   ├── decorators/                 # Decorator Pattern
│   │   └── usage-tracking-decorator.js # Usage tracking decorator
│   └── config/                     # Configuration Management
│       └── model-pricing-config.js # Centralized pricing data
├── utils/
│   ├── logger.js                   # Logging utility functions
│   └── state-manager.js            # State management utility functions
├── scripts/
│   └── start-github-server.sh      # Official GitHub MCP server startup
├── prompts/
│   ├── ba.txt                      # Business Analyst agent prompt
│   └── developer.txt               # Developer agent prompt
├── config/
│   └── default.json                # Configuration template
└── logs/                           # Generated logs and state
```

### 🎨 Design Patterns Used

- **Strategy Pattern**: Pluggable LLM providers (OpenAI, Anthropic, Google)
- **Factory Pattern**: Provider creation and MCP client instantiation
- **Command Pattern**: CLI operations and server tool execution
- **Decorator Pattern**: Usage tracking and cost monitoring
- **Abstract Base Classes**: Consistent interfaces for agents and commands
- **Dependency Injection**: Clean service composition throughout

### 🔄 Architecture Benefits

- **Maintainability**: Reduced main orchestrator from 724 to ~200 lines
- **FastMCP Integration**: 20% code reduction with FastMCP framework (262→208 lines)
- **Testability**: Each component can be tested in isolation
- **Extensibility**: Easy to add new commands, agents, or providers
- **Modularity**: Clean separation of concerns across layers
- **Reliability**: Comprehensive error handling and logging
- **Enhanced Session Management**: Per-client session tracking with FastMCP

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker (for official GitHub MCP server)
- GitHub Personal Access Token ([create one](https://github.com/settings/personal-access-tokens/new))
- OpenAI API Key ([get one](https://platform.openai.com/api-keys))

### Installation

1. **Clone and setup:**
   ```bash
   git clone <your-repo-url> devshop
   cd devshop
   npm run setup
   ```

2. **Follow the setup wizard** to configure GitHub token, OpenAI key, and preferences.

3. **Start the official GitHub MCP server:**
   ```bash
   npm run github-server
   ```

4. **Test your installation:**
   ```bash
   npm test
   ```

5. **Test FastMCP integration:**
   ```bash
   npm run test:fastmcp:quick
   ```

6. **Start containerized FastMCP server (recommended for security):**
   ```bash
   npm run fastmcp:container
   ```

7. **Check system status:**
   ```bash
   npm run status
   ```

### First Run

1. **Try the BA Agent** (creates requirements and GitHub issues):
   ```bash
   npm run ba -- --repo=your-org/your-repo "Add user authentication system"
   ```

2. **Try the Developer Agent** (implements features from issues):
   ```bash
   npm run dev -- --repo=your-org/your-repo --issue=1
   ```

3. **View logs:**
   ```bash
   npm run logs
   ```

## 📋 Usage Examples

### Business Analyst Agent

The BA Agent analyzes your requests and creates detailed requirements:

```bash
# Analyze a feature request
npm run ba -- --repo=myorg/myapp "Add real-time notifications"

# Create requirements for a bug fix
npm run ba -- --repo=myorg/myapp "Fix memory leak in background processing"

# Analyze existing codebase for improvements
npm run ba -- --repo=myorg/myapp "Optimize database queries for better performance"
```

**New v1.1 Options:**
```bash
# Resume an existing session
npm run ba -- --repo=myorg/myapp --session=abc-123-def "Continue analysis"

# Verbose output with detailed information
npm run ba -- --repo=myorg/myapp --verbose "Add user dashboard"
```

The BA Agent will:
- Analyze your existing codebase structure
- Ask clarifying questions if needed
- Create a detailed GitHub issue with requirements
- Include acceptance criteria and technical considerations

### Developer Agent

The Developer Agent reads GitHub issues and implements the features:

```bash
# Implement a specific issue
npm run dev -- --repo=myorg/myapp --issue=42

# Work on a feature branch
npm run dev -- --repo=myorg/myapp --issue=15 --branch=feature/user-auth

# Dry run mode (analyze without making changes)
npm run dev -- --repo=myorg/myapp --issue=42 --dry-run

# Resume existing development session
npm run dev -- --repo=myorg/myapp --session=def-456-ghi --verbose
```

The Developer Agent will:
- Read the GitHub issue and requirements
- Analyze existing codebase patterns
- Generate appropriate code following project conventions
- Create/update necessary files
- Commit changes with descriptive messages

### System Management

```bash
# Check overall system health
npm run status

# Run comprehensive system tests
npm run test --full

# Test FastMCP integration
npm run test:fastmcp

# Test only connections
npm run test --connections

# Test only API integrations
npm run test --apis

# View all sessions
npm run logs --list

# View specific session with detailed output
npm run logs --session=abc-123 --verbose

# Export session logs
npm run logs --session=abc-123 --export
```

### Self-Improvement Workflow

DevShop 1.1 can improve itself with the new architecture:

1. **Create improvement requirements:**
   ```bash
   npm run ba -- --repo=your-org/devshop "Add web dashboard for monitoring agent sessions"
   ```

2. **Let DevShop implement its own improvement:**
   ```bash
   npm run dev -- --repo=your-org/devshop --issue=1
   ```

3. **Review and iterate:**
   ```bash
   npm run logs --session=<session-id> --verbose
   npm run status
   ```

## 🐙 GitHub MCP Server Integration

DevShop uses the **official GitHub MCP server** (maintained by GitHub) with our refactored client architecture:

- ✅ **Official GitHub support** - maintained by GitHub team
- ✅ **Comprehensive GitHub API coverage** - 90+ operations
- ✅ **Refactored integration** - clean client wrapper with error handling
- ✅ **Better reliability** - tested architecture with proper separation

### Docker Setup (Recommended)

The official GitHub MCP server runs in Docker:

```bash
# Start the server (pulls image automatically)
npm run github-server

# Stop the server
npm run github-server:stop

# View server logs
docker logs devshop-github-server
```

### Manual Docker Setup

If you prefer manual control:

```bash
# Pull the image
docker pull ghcr.io/github/github-mcp-server:latest

# Run the server
docker run -d \
  --name devshop-github-server \
  -p 3000:3000 \
  -e GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_TOKEN" \
  ghcr.io/github/github-mcp-server:latest
```

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Required
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here

# Optional - Multi-Provider Support
ANTHROPIC_API_KEY=sk-ant-your_key_here
GOOGLE_API_KEY=AIza_your_key_here

# Optional - Defaults
GITHUB_ORG=your-default-org
MAX_COST_PER_SESSION=5.00
MAX_TOKENS_PER_SESSION=10000
```

### Configuration File (config/default.json)

```json
{
  "models": {
    "ba": "claude-3.5-sonnet",
    "developer": "gpt-5"
  },
  "mcp_servers": {
    "github": {
      "type": "docker",
      "enabled": true
    },
    "litellm": {
      "type": "local",
      "enabled": true
    }
  },
  "cost_controls": {
    "max_tokens_per_session": 10000,
    "max_cost_per_session": 5.00
  }
}
```

## 📊 Cost Tracking & Multi-Provider Support

DevShop 1.1 includes enhanced cost controls with multi-provider support:

- **Multi-Provider LLM Support**: OpenAI, Anthropic, Google
- **Smart Model Selection**: Optimal model for each agent type
- **Enhanced Cost Tracking**: Per-session and per-agent monitoring
- **Budget Controls**: Automatic cutoffs when limits are reached
- **Usage Analytics**: Detailed cost breakdowns

**Provider Configuration:**
```bash
# OpenAI (default)
export OPENAI_API_KEY=sk-...

# Anthropic Claude (recommended for BA Agent)
export ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini (cost-effective option)
export GOOGLE_API_KEY=AIza...
```

**Monitor Usage:**
```bash
# Check current usage
npm run logs --session=<session-id>

# System status with cost info
npm run status

# Detailed system health check
npm run test --full --verbose
```

## 🔒 Container Security (Enhanced)

DevShop 1.1 implements comprehensive container security for all MCP servers:

### Security-Hardened Containers
- **Process Isolation**: All MCP servers run in isolated containers
- **Non-Root Execution**: Processes run as dedicated non-root users (UID 1001)
- **Read-Only Filesystems**: Immutable runtime environments prevent tampering
- **Dropped Capabilities**: Linux capabilities reduced to absolute minimum
- **Docker Secrets**: API keys managed through encrypted Docker secrets
- **Resource Limits**: CPU/memory limits prevent resource exhaustion

### Container Management
```bash
# Start secure FastMCP container
npm run fastmcp:container

# Monitor container security status
npm run fastmcp:container:logs

# Stop containerized services
npm run fastmcp:container:stop
```

### Security Verification
```bash
# Test container security configuration
npm run test:security

# Verify FastMCP container status
docker inspect devshop-fastmcp-server --format='{{.Config.User}}'

# Check security policies
docker inspect devshop-fastmcp-server --format='{{.HostConfig.ReadonlyRootfs}}'
```

**Features:**
- **Automatic Security Checks**: Container security automatically verified on startup
- **Real-time Monitoring**: Health checks and security status monitoring  
- **Security Documentation**: See `CONTAINER_SECURITY_GUIDE.md` for full details

## 🔍 Logging and Observability (Enhanced)

Every agent interaction is logged with comprehensive observability:

- **Structured Logging**: JSON-formatted logs with metadata
- **Session Management**: Complete session lifecycle tracking
- **Cost Analytics**: Token usage and costs per interaction
- **Error Tracking**: Comprehensive error logging and context
- **Performance Metrics**: Response times and system health

```bash
# List all sessions with status
npm run logs --list

# View specific session with full detail
npm run logs --session=abc-123-def --verbose

# Filter logs by type
npm run logs --session=abc-123-def --filter=error

# Export session for analysis
npm run logs --session=abc-123-def --export

# Show only recent activity
npm run logs --limit=50
```

## 🛠️ Advanced Usage

### Adding New Commands

With the new Command pattern, adding commands is straightforward:

1. Create new command class extending `BaseCommand`
2. Implement `execute()` method
3. Add to orchestrator command registry
4. Update package.json scripts

### Adding New Agents

The Agent abstraction makes it easy to add specialized agents:

1. Create new agent class extending `BaseAgent`
2. Implement agent-specific `execute()` logic
3. Create corresponding command class
4. Configure agent-specific prompts

### Adding New LLM Providers

The Strategy pattern makes provider extension simple:

1. Create new provider class extending `BaseProvider`
2. Implement provider-specific API calls
3. Add to `ProviderFactory`
4. Update configuration schema

### Custom Agent Prompts

Modify agent behavior by editing prompt files:

- `prompts/ba.txt` - Business Analyst behavior
- `prompts/developer.txt` - Developer behavior

### Multi-Repository Workflow

DevShop 1.1 supports enhanced multi-repository operations:

```bash
# Analyze multiple repositories
npm run ba -- --repo=org/frontend "Add user dashboard"
npm run ba -- --repo=org/backend "Add user API endpoints"
npm run ba -- --repo=org/mobile "Add mobile user interface"

# Coordinate cross-repository development
npm run dev -- --repo=org/frontend --issue=1 --verbose
npm run dev -- --repo=org/backend --issue=2 --verbose
```

## 🐛 Troubleshooting

### Common Issues

**"MCP server connection failed"**
- Check system status: `npm run status`
- Test connections: `npm test --connections`
- Verify Docker is running for GitHub server

**"GitHub token invalid"**
- Verify token has `repo`, `issues`, and `pull_requests` permissions
- Check token hasn't expired: `npm run test --apis`

**"OpenAI/Anthropic/Google API error"**
- Verify API keys are correct: `npm run status`
- Check rate limits haven't been exceeded
- Test specific provider: `npm run test --apis --verbose`

**"Cost limits exceeded"**
- Review budget settings: `npm run status`
- Check current usage: `npm run logs --errors`
- Adjust limits in config/default.json

### Debug Mode

Enable comprehensive debugging:
```bash
# Debug specific command
DEBUG=1 npm run ba -- --repo=org/repo --verbose "feature description"

# Debug with connection testing
DEBUG=1 npm run test --full --verbose

# Check detailed system status
npm run status --verbose
```

### Reset Session State

Clear problematic sessions:
```bash
# Remove all session state
rm -rf logs/*.state.json

# Remove specific session logs
rm -rf logs/session-<session-id>*.json

# Clean start
npm run setup --force
```

## 📈 Roadmap (v2.x)

DevShop 1.1's clean architecture enables rapid feature development:

### Immediate (v2.1)
- [ ] **Enhanced Web Dashboard**: Real-time monitoring with React
- [ ] **Advanced Cost Analytics**: Detailed usage breakdowns
- [ ] **Session Management UI**: Visual session browser

### Near-term (v2.2-2.3)
- [ ] **Multi-Agent Coordination**: Agents that work together
- [ ] **Code Review Agent**: Automated code quality analysis
- [ ] **Testing Agent**: Automated test generation and execution
- [ ] **Performance Agent**: Code optimization recommendations

### Medium-term (v2.4-2.5)
- [ ] **Documentation Agent**: Auto-generated comprehensive docs
- [ ] **Security Agent**: Security analysis and vulnerability fixes
- [ ] **Deployment Agent**: Automated deployment and rollback
- [ ] **Monitoring Agent**: Production system monitoring

### Architecture Evolution
- [ ] **Plugin System**: Third-party agent and provider plugins
- [ ] **Distributed Agents**: Multi-machine agent coordination
- [ ] **Advanced Observability**: APM integration and metrics
- [ ] **ML-Enhanced Decisions**: Learning from past sessions

## 🤝 Contributing

DevShop 1.1's architecture makes contributions much easier:

### For Developers
1. **Use DevShop to improve DevShop:**
   ```bash
   npm run ba -- --repo=your-org/devshop "Add feature X"
   npm run dev -- --repo=your-org/devshop --issue=N
   ```

2. **Architecture Guidelines:**
   - Follow existing design patterns (Strategy, Command, etc.)
   - Maintain clean separation of concerns
   - Add comprehensive tests for new components
   - Update documentation for API changes

3. **Adding New Components:**
   - Services: Add to `/client/services/`
   - Commands: Add to `/client/commands/`
   - Agents: Add to `/client/agents/`
   - Providers: Add to `/servers/providers/`

### For Users
1. **Submit enhancement requests** as GitHub issues
2. **Test agent-generated code** and provide feedback
3. **Share usage patterns** and configuration optimizations
4. **Contribute prompt improvements** for better agent behavior

## 🔄 Migration from v1.x

Upgrading from DevShop 1.x to 1.1:

1. **Automatic Migration**: Existing configs and logs are compatible
2. **New Commands**: Use new CLI structure (`npm run status`, enhanced options)
3. **Enhanced Features**: Leverage new multi-provider support and better logging
4. **Performance**: Experience significantly improved reliability and speed

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Multi-provider LLM support (OpenAI, Anthropic, Google)
- GitHub API for repository operations
- Inspired by modern software architecture patterns
- Community feedback driving continuous improvement

---

**Ready to experience AI agents with clean architecture? Start with `npm run setup` and let DevShop 1.1 build itself!**

*DevShop 1.1 - Where AI meets software engineering best practices* ✨