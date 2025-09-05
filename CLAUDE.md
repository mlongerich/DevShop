# Claude Code Integration for DevShop

This file provides context for Claude Code when working on the DevShop project.

## Project Overview
DevShop is a self-improving development shop using MCP (Model Context Protocol) and AI agents. It consists of:

- **BA Agent**: Business analysis and requirements gathering
- **Developer Agent**: Code implementation and feature development
- **MCP Servers**: Modular backend services for GitHub, OpenAI, logging, and state management

## Architecture
- `client/devshop-mcp.js` - Main CLI orchestrator
- `servers/` - MCP server implementations
- `prompts/` - Agent behavior definitions
- `config/` - Configuration templates

## Commands to Remember

### Setup and Testing
```bash
npm run setup     # Initial configuration
npm test         # Test all connections
```

### Development
```bash
npm run ba -- --repo=org/repo "feature description"
npm run dev -- --repo=org/repo --issue=N
npm run logs     # View session logs
```

### Common Operations
- Check if MCP servers are working: `npm test`
- View detailed logs: `npm run logs -- --session=<id>`
- Reset state: `rm -rf logs/*.state.json`

## Key Files to Understand
1. `client/devshop-mcp.js` - Main orchestrator and CLI
2. `servers/github-server.js` - GitHub API operations
3. `servers/openai-server.js` - OpenAI integration with cost tracking
4. `config/default.json` - Configuration template

## When Making Changes
- Test MCP server connections after modifications
- Check cost tracking is working properly
- Verify logging captures all interactions
- Test both BA and Developer agent workflows

This is a self-improving system - DevShop can work on its own codebase!