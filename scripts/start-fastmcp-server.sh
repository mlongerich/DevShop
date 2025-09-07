#!/bin/bash

# Start Containerized FastMCP Server with Security Hardening
# This script creates Docker secrets and launches the FastMCP server container

set -e

echo "🔒 Starting Secure FastMCP Server Container..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

# Function to create Docker secret if it doesn't exist
create_secret() {
    local secret_name=$1
    local env_var=$2
    
    if [ -z "${!env_var}" ]; then
        echo "⚠️  Warning: $env_var not set, creating empty secret"
        echo "" | docker secret create "$secret_name" - 2>/dev/null || true
    else
        echo "🔐 Creating Docker secret: $secret_name"
        echo "${!env_var}" | docker secret create "$secret_name" - 2>/dev/null || {
            echo "ℹ️  Secret $secret_name already exists, updating..."
            docker secret rm "$secret_name" 2>/dev/null || true
            echo "${!env_var}" | docker secret create "$secret_name" -
        }
    fi
}

# Create Docker secrets for API keys
echo "🔐 Setting up Docker secrets for API keys..."
create_secret "openai_api_key" "OPENAI_API_KEY"
create_secret "anthropic_api_key" "ANTHROPIC_API_KEY" 
create_secret "google_api_key" "GOOGLE_API_KEY"

# Stop any existing FastMCP container
echo "🛑 Stopping any existing FastMCP server container..."
docker compose -f docker-compose.fastmcp.yml down 2>/dev/null || true

# Build and start the containerized FastMCP server
echo "🏗️  Building FastMCP server container..."
docker compose -f docker-compose.fastmcp.yml build

echo "🚀 Starting containerized FastMCP server..."
docker compose -f docker-compose.fastmcp.yml up -d

# Wait for container to be healthy
echo "🔍 Waiting for FastMCP server to be healthy..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if docker compose -f docker-compose.fastmcp.yml ps --format json | jq -r '.[0].Health' | grep -q "healthy\|starting"; then
        if docker compose -f docker-compose.fastmcp.yml ps --format json | jq -r '.[0].Health' | grep -q "healthy"; then
            echo "✅ FastMCP Server is running and healthy!"
            break
        fi
        echo "⏳ FastMCP server is starting... ($counter/$timeout)"
    else
        echo "⏳ Waiting for FastMCP server health check... ($counter/$timeout)"
    fi
    
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ FastMCP server failed to become healthy within $timeout seconds"
    echo "📋 Container logs:"
    docker compose -f docker-compose.fastmcp.yml logs --tail=50
    exit 1
fi

# Display status and connection information
echo ""
echo "🎉 FastMCP Server Status:"
echo "   Container: devshop-fastmcp-server"
echo "   Network: devshop-internal (isolated)"
echo "   Security: Read-only filesystem, non-root user, capability dropping"
echo ""
echo "📋 Management commands:"
echo "   View logs: docker compose -f docker-compose.fastmcp.yml logs -f"
echo "   Stop server: docker compose -f docker-compose.fastmcp.yml down"
echo "   Restart server: docker compose -f docker-compose.fastmcp.yml restart"
echo ""
echo "🔒 Security features enabled:"
echo "   ✓ Non-root user (UID 1001)" 
echo "   ✓ Read-only root filesystem"
echo "   ✓ Dropped all capabilities"
echo "   ✓ Resource limits (512MB RAM, 0.5 CPU)"
echo "   ✓ Docker secrets for API keys"
echo "   ✓ No new privileges allowed"
echo "   ✓ Isolated network namespace"