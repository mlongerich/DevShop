#!/bin/bash

# Start GitHub MCP Server using Docker
# This script pulls the official GitHub MCP server and runs it locally

set -e

echo "🚀 Starting Official GitHub MCP Server..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN environment variable is not set"
    echo "   Please add your GitHub token to .env file or export it:"
    echo "   export GITHUB_TOKEN=ghp_your_token_here"
    exit 1
fi

# Pull the latest GitHub MCP server image
echo "📦 Pulling latest GitHub MCP server image..."
docker pull ghcr.io/github/github-mcp-server:latest

# Stop any existing container
echo "🛑 Stopping any existing GitHub MCP server container..."
docker stop devshop-github-server 2>/dev/null || true
docker rm devshop-github-server 2>/dev/null || true

# Start the GitHub MCP server
echo "🏃 Starting GitHub MCP server container..."
docker run -d \
  --name devshop-github-server \
  -p 3000:3000 \
  -e GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_TOKEN" \
  ghcr.io/github/github-mcp-server:latest

echo "✅ GitHub MCP Server is running!"
echo "   Container: devshop-github-server"
echo "   Port: 3000"
echo ""
echo "To stop the server:"
echo "   docker stop devshop-github-server"
echo ""
echo "To view logs:"
echo "   docker logs devshop-github-server"