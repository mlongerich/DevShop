#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class GitHubMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'github-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.octokit = null;
    this.setupToolHandlers();
  }

  initializeOctokit(token) {
    if (!this.octokit) {
      this.octokit = new Octokit({
        auth: token,
      });
    }
    return this.octokit;
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'github_clone_repo',
            description: 'Clone or pull a GitHub repository to local filesystem',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                token: { type: 'string', description: 'GitHub token' },
                target_dir: { type: 'string', description: 'Target directory (optional)' }
              },
              required: ['owner', 'repo', 'token']
            }
          },
          {
            name: 'github_list_files',
            description: 'List files in a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                path: { type: 'string', description: 'Path within repository (optional)' },
                token: { type: 'string', description: 'GitHub token' }
              },
              required: ['owner', 'repo', 'token']
            }
          },
          {
            name: 'github_read_file',
            description: 'Read contents of a file from repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                path: { type: 'string', description: 'File path' },
                token: { type: 'string', description: 'GitHub token' }
              },
              required: ['owner', 'repo', 'path', 'token']
            }
          },
          {
            name: 'github_create_file',
            description: 'Create or update a file in repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'File content' },
                message: { type: 'string', description: 'Commit message' },
                token: { type: 'string', description: 'GitHub token' },
                branch: { type: 'string', description: 'Branch name (optional, defaults to main)' }
              },
              required: ['owner', 'repo', 'path', 'content', 'message', 'token']
            }
          },
          {
            name: 'github_create_issue',
            description: 'Create a new issue in repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue body' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels (optional)' },
                token: { type: 'string', description: 'GitHub token' }
              },
              required: ['owner', 'repo', 'title', 'body', 'token']
            }
          },
          {
            name: 'github_get_issue',
            description: 'Get details of a specific issue',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                issue_number: { type: 'number', description: 'Issue number' },
                token: { type: 'string', description: 'GitHub token' }
              },
              required: ['owner', 'repo', 'issue_number', 'token']
            }
          },
          {
            name: 'github_list_issues',
            description: 'List issues in repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                state: { type: 'string', description: 'Issue state (open/closed/all)', default: 'open' },
                labels: { type: 'string', description: 'Comma-separated list of labels' },
                token: { type: 'string', description: 'GitHub token' }
              },
              required: ['owner', 'repo', 'token']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'github_clone_repo':
            return await this.cloneRepo(args);
          case 'github_list_files':
            return await this.listFiles(args);
          case 'github_read_file':
            return await this.readFile(args);
          case 'github_create_file':
            return await this.createFile(args);
          case 'github_create_issue':
            return await this.createIssue(args);
          case 'github_get_issue':
            return await this.getIssue(args);
          case 'github_list_issues':
            return await this.listIssues(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async cloneRepo(args) {
    const { owner, repo, token, target_dir } = args;
    const targetPath = target_dir || path.join(os.tmpdir(), `${owner}-${repo}`);
    
    try {
      // Use git clone with token authentication
      const cloneUrl = `https://${token}@github.com/${owner}/${repo}.git`;
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync(`git clone ${cloneUrl} "${targetPath}"`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Repository ${owner}/${repo} cloned to ${targetPath}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  async listFiles(args) {
    const { owner, repo, path = '', token } = args;
    const octokit = this.initializeOctokit(token);

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });

      const files = Array.isArray(response.data) 
        ? response.data.map(item => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size
          }))
        : [{
            name: response.data.name,
            path: response.data.path,
            type: response.data.type,
            size: response.data.size
          }];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(files, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async readFile(args) {
    const { owner, repo, path, token } = args;
    const octokit = this.initializeOctokit(token);

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });

      if (response.data.type !== 'file') {
        throw new Error(`Path ${path} is not a file`);
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async createFile(args) {
    const { owner, repo, path, content, message, token, branch = 'main' } = args;
    const octokit = this.initializeOctokit(token);

    try {
      let sha;
      try {
        // Check if file exists to get SHA for update
        const existingFile = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: branch
        });
        sha = existingFile.data.sha;
      } catch (error) {
        // File doesn't exist, this is a new file
      }

      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        ...(sha && { sha })
      });

      return {
        content: [
          {
            type: 'text',
            text: `File ${path} ${sha ? 'updated' : 'created'} successfully. Commit SHA: ${response.data.commit.sha}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create/update file: ${error.message}`);
    }
  }

  async createIssue(args) {
    const { owner, repo, title, body, labels, token } = args;
    const octokit = this.initializeOctokit(token);

    try {
      const response = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        ...(labels && { labels })
      });

      return {
        content: [
          {
            type: 'text',
            text: `Issue #${response.data.number} created successfully: ${response.data.html_url}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  async getIssue(args) {
    const { owner, repo, issue_number, token } = args;
    const octokit = this.initializeOctokit(token);

    try {
      const response = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number
      });

      const issue = {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body,
        state: response.data.state,
        labels: response.data.labels.map(label => label.name),
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        html_url: response.data.html_url
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(issue, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get issue: ${error.message}`);
    }
  }

  async listIssues(args) {
    const { owner, repo, state = 'open', labels, token } = args;
    const octokit = this.initializeOctokit(token);

    try {
      const response = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state,
        ...(labels && { labels })
      });

      const issues = response.data.map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: issue.labels.map(label => label.name),
        created_at: issue.created_at,
        html_url: issue.html_url
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(issues, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list issues: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new GitHubMCPServer();
server.run().catch(console.error);