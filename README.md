# DevShop 🚀

**Self-improving development shop using MCP (Model Context Protocol) and AI agents**

DevShop is a weekend MVP implementation that creates a development environment where AI agents can analyze requirements, generate code, and continuously improve themselves. It uses a modular MCP architecture with specialized agents for different development tasks.

## 🎯 What Does DevShop Do?

- **BA Agent**: Analyzes user requirements and creates detailed GitHub issues
- **Developer Agent**: Reads GitHub issues and implements features with clean code  
- **Self-Improvement**: Can work on its own codebase to add new capabilities
- **Full Observability**: Logs all agent interactions, costs, and decisions
- **Cost Controls**: Built-in budgets and limits to prevent runaway spending

## 🏗️ Architecture

DevShop uses a modular MCP (Model Context Protocol) architecture:

```
devshop/
├── client/
│   ├── devshop-mcp.js          # Main CLI orchestrator
│   ├── setup.js                # Setup wizard
│   ├── github-direct-client.js # Direct client for GitHub MCP server
│   └── litellm-direct-client.js # Direct client for LiteLLM MCP server
├── servers/
│   └── litellm-server.js       # LiteLLM MCP server with cost tracking
├── utils/
│   ├── logger.js               # Logging utility functions
│   └── state-manager.js        # State management utility functions
├── scripts/
│   └── start-github-server.sh  # Official GitHub MCP server startup
├── prompts/
│   ├── ba.txt                  # Business Analyst agent prompt
│   └── developer.txt           # Developer agent prompt
├── config/
│   └── default.json            # Configuration template
└── logs/                       # Generated logs and state
```

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
node client/devshop-mcp.js ba --repo=myorg/myapp "Add real-time notifications"

# Create requirements for a bug fix  
node client/devshop-mcp.js ba --repo=myorg/myapp "Fix memory leak in background processing"

# Analyze existing codebase for improvements
node client/devshop-mcp.js ba --repo=myorg/myapp "Optimize database queries for better performance"
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
node client/devshop-mcp.js dev --repo=myorg/myapp --issue=42

# Work on a bug fix
node client/devshop-mcp.js dev --repo=myorg/myapp --issue=15
```

The Developer Agent will:
- Read the GitHub issue and requirements
- Analyze existing codebase patterns
- Generate appropriate code following project conventions
- Create/update necessary files
- Commit changes with descriptive messages

### Self-Improvement Workflow

DevShop can improve itself! Try this workflow:

1. **Create improvement requirements:**
   ```bash
   node client/devshop-mcp.js ba --repo=your-org/devshop "Add web dashboard for monitoring agent sessions"
   ```

2. **Let DevShop implement its own improvement:**
   ```bash
   node client/devshop-mcp.js dev --repo=your-org/devshop --issue=1
   ```

3. **Review and iterate:**
   ```bash
   node client/devshop-mcp.js logs --session=<session-id>
   ```

## 🐙 GitHub MCP Server Integration

DevShop uses the **official GitHub MCP server** (maintained by GitHub) instead of a custom implementation. This provides:

- ✅ **Official GitHub support** - maintained by GitHub team
- ✅ **Comprehensive GitHub API coverage** - more operations than custom server
- ✅ **Regular updates** - stays current with GitHub API changes
- ✅ **Better reliability** - tested by GitHub and community

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

### Requirements

- **Docker is required** for the official GitHub MCP server
- **No fallback server** - DevShop uses only the official GitHub MCP server
- All 90+ GitHub operations are available through the official server

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Required
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here

# Optional
GITHUB_ORG=your-default-org
OPENAI_BA_MODEL=gpt-4o-mini
OPENAI_DEV_MODEL=gpt-4o-mini
MAX_COST_PER_SESSION=5.00
MAX_TOKENS_PER_SESSION=10000
```

### Configuration File (config/default.json)

```json
{
  "models": {
    "ba": "gpt-4o-mini",
    "developer": "gpt-4o-mini"
  },
  "cost_controls": {
    "max_tokens_per_session": 10000,
    "max_cost_per_session": 5.00
  }
}
```

## 📊 Cost Tracking

DevShop includes built-in cost controls:

- **Token Limits**: Prevent excessive token usage
- **Cost Budgets**: Set maximum spend per session  
- **Usage Tracking**: Monitor costs across all agents
- **Automatic Cutoffs**: Stop execution when limits are reached

View current usage:
```bash
node client/devshop-mcp.js logs --session=<session-id>
```

## 🔍 Logging and Observability

Every agent interaction is logged for analysis:

- **Interaction Logs**: All agent conversations
- **Tool Usage**: MCP tool calls and results  
- **Cost Tracking**: Token usage and costs
- **Session Summaries**: High-level session overview

```bash
# List all sessions
npm run logs

# View specific session
npm run logs -- --session=abc-123-def

# Monitor real-time (coming soon!)
npm run monitor
```

## 🛠️ Advanced Usage

### Custom Agent Prompts

Modify agent behavior by editing prompt files:

- `prompts/ba.txt` - Business Analyst behavior
- `prompts/developer.txt` - Developer behavior

### MCP Server Development

Local MCP servers and utilities can be extended:

- `client/github-direct-client.js` - Direct client for GitHub MCP server (read-only)
- `client/litellm-direct-client.js` - Direct client for LiteLLM MCP server
- `servers/litellm-server.js` - Add new models or providers
- `utils/logger.js` - Add new logging functionality
- `utils/state-manager.js` - Add new state management features

### Multi-Repository Workflow

DevShop can work across multiple repositories:

```bash
# Analyze one repo
npm run ba -- --repo=org/frontend "Add user dashboard"

# Implement in another repo  
npm run ba -- --repo=org/backend "Add user API endpoints"

# Cross-repository coordination (advanced)
npm run ba -- --repo=org/frontend "Integrate with user API from backend repo"
```

## 🐛 Troubleshooting

### Common Issues

**"MCP server connection failed"**
- Check that all MCP servers are executable: `chmod +x servers/*.js`
- Ensure Node.js modules are installed: `npm install`

**"GitHub token invalid"**  
- Verify token has `repo`, `issues`, and `pull_requests` permissions
- Check token isn't expired

**"OpenAI API error"**
- Verify API key is correct and has credits
- Check rate limits haven't been exceeded

**"Cost limits exceeded"**
- Review budget settings in config/default.json
- Check current usage: `npm run logs`

### Debug Mode

Enable verbose logging:
```bash
DEBUG=1 node client/devshop-mcp.js ba --repo=org/repo "feature description"
```

### Reset Session State

Clear stuck sessions:
```bash
rm -rf logs/*.state.json
rm -rf logs/session-*.json
```

## 📈 Roadmap

DevShop is designed to bootstrap itself. Planned improvements:

- [ ] **Web Dashboard**: Real-time monitoring and control
- [ ] **Multi-Agent Coordination**: Agents that work together
- [ ] **Code Review Agent**: Automated code quality checks  
- [ ] **Testing Agent**: Automated test generation
- [ ] **Documentation Agent**: Auto-generated docs
- [ ] **Performance Agent**: Code optimization
- [ ] **Security Agent**: Security analysis and fixes

## 🤝 Contributing

DevShop improves itself! The best way to contribute:

1. **Use DevShop to improve DevShop:**
   ```bash
   npm run ba -- --repo=your-org/devshop "Add feature X"
   npm run dev -- --repo=your-org/devshop --issue=N
   ```

2. **Submit issues for new capabilities**
3. **Review and test agent-generated code**
4. **Improve agent prompts and configuration**

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Uses OpenAI GPT models for agent intelligence
- GitHub API for repository operations
- Inspired by the vision of self-improving development tools

---

**Ready to let AI agents improve your development workflow? Start with `npm run setup` and let DevShop build itself!**