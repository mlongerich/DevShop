#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

class DevShopSetup {
  constructor() {
    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async ask(question) {
    return new Promise((resolve) => {
      this.readline.question(question, resolve);
    });
  }

  async checkRequirements() {
    console.log(chalk.blue('🔍 Checking requirements...\n'));
    
    const checks = [];
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
    if (majorVersion >= 18) {
      console.log(chalk.green(`✓ Node.js ${nodeVersion} (>= 18 required)`));
      checks.push(true);
    } else {
      console.log(chalk.red(`✗ Node.js ${nodeVersion} (>= 18 required)`));
      checks.push(false);
    }

    // Check if package.json exists
    try {
      await fs.access(path.join(rootDir, 'package.json'));
      console.log(chalk.green('✓ package.json found'));
      checks.push(true);
    } catch {
      console.log(chalk.red('✗ package.json not found'));
      checks.push(false);
    }

    // Check if directories exist
    const requiredDirs = ['client', 'servers', 'prompts', 'config'];
    for (const dir of requiredDirs) {
      try {
        await fs.access(path.join(rootDir, dir));
        console.log(chalk.green(`✓ ${dir}/ directory exists`));
        checks.push(true);
      } catch {
        console.log(chalk.red(`✗ ${dir}/ directory missing`));
        checks.push(false);
      }
    }

    return checks.every(check => check);
  }

  async setupEnvironment() {
    console.log(chalk.blue('\n🔧 Setting up environment variables...\n'));

    const envPath = path.join(rootDir, '.env');
    let existingEnv = {};
    
    // Try to load existing .env file
    try {
      const content = await fs.readFile(envPath, 'utf8');
      const lines = content.split('\\n').filter(line => line.trim() && !line.startsWith('#'));
      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
          existingEnv[key.trim()] = valueParts.join('=').trim();
        }
      }
      console.log(chalk.yellow('Found existing .env file. Current values will be shown.'));
    } catch {
      console.log('Creating new .env file...');
    }

    // GitHub Token
    console.log(chalk.cyan('\\n1. GitHub Configuration:'));
    console.log('   You need a GitHub Personal Access Token with repo, issues, and pull_requests permissions.');
    console.log('   Create one at: https://github.com/settings/personal-access-tokens/new');
    
    const currentGithubToken = existingEnv.GITHUB_TOKEN || '';
    const displayToken = currentGithubToken ? `${currentGithubToken.substring(0, 10)}...` : '(not set)';
    console.log(`   Current: ${displayToken}`);
    
    const githubToken = await this.ask('   Enter GitHub token (or press Enter to keep current): ');
    const finalGithubToken = githubToken.trim() || existingEnv.GITHUB_TOKEN || '';

    // GitHub Organization (optional)
    const currentGithubOrg = existingEnv.GITHUB_ORG || '';
    console.log(`   Current GitHub org: ${currentGithubOrg || '(not set)'}`);
    const githubOrg = await this.ask('   Enter default GitHub org (optional, press Enter to skip): ');
    const finalGithubOrg = githubOrg.trim() || existingEnv.GITHUB_ORG || '';

    // OpenAI API Key
    console.log(chalk.cyan('\\n2. OpenAI Configuration:'));
    console.log('   You need an OpenAI API key from: https://platform.openai.com/api-keys');
    
    const currentOpenAIKey = existingEnv.OPENAI_API_KEY || '';
    const displayKey = currentOpenAIKey ? `${currentOpenAIKey.substring(0, 10)}...` : '(not set)';
    console.log(`   Current: ${displayKey}`);
    
    const openaiKey = await this.ask('   Enter OpenAI API key (or press Enter to keep current): ');
    const finalOpenAIKey = openaiKey.trim() || existingEnv.OPENAI_API_KEY || '';

    // Optional settings
    console.log(chalk.cyan('\\n3. Optional Settings:'));
    
    const currentBaModel = existingEnv.OPENAI_BA_MODEL || '';
    console.log(`   Current BA model: ${currentBaModel || 'gpt-4o-mini (default)'}`);
    const baModel = await this.ask('   BA Agent model (press Enter for default): ');
    const finalBaModel = baModel.trim() || existingEnv.OPENAI_BA_MODEL || '';

    const currentDevModel = existingEnv.OPENAI_DEV_MODEL || '';
    console.log(`   Current Developer model: ${currentDevModel || 'gpt-4o-mini (default)'}`);
    const devModel = await this.ask('   Developer Agent model (press Enter for default): ');
    const finalDevModel = devModel.trim() || existingEnv.OPENAI_DEV_MODEL || '';

    const currentMaxCost = existingEnv.MAX_COST_PER_SESSION || '';
    console.log(`   Current max cost per session: $${currentMaxCost || '5.00 (default)'}`);
    const maxCost = await this.ask('   Max cost per session in USD (press Enter for default): ');
    const finalMaxCost = maxCost.trim() || existingEnv.MAX_COST_PER_SESSION || '';

    // Create .env file content
    const envContent = `# DevShop Configuration
# Generated on ${new Date().toISOString()}

# GitHub Configuration
GITHUB_TOKEN=${finalGithubToken}${finalGithubOrg ? `\\nGITHUB_ORG=${finalGithubOrg}` : ''}

# OpenAI Configuration  
OPENAI_API_KEY=${finalOpenAIKey}${finalBaModel ? `\\nOPENAI_BA_MODEL=${finalBaModel}` : ''}${finalDevModel ? `\\nOPENAI_DEV_MODEL=${finalDevModel}` : ''}

# Optional: Cost limits${finalMaxCost ? `\\nMAX_COST_PER_SESSION=${finalMaxCost}` : ''}

# Auto-generated settings
MAX_TOKENS_PER_SESSION=10000
`;

    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('\\n✓ Environment configuration saved to .env'));

    return {
      githubToken: finalGithubToken,
      openaiKey: finalOpenAIKey
    };
  }

  async testConnections(config) {
    console.log(chalk.blue('\\n🧪 Testing API connections..\\n'));

    // Test GitHub API
    if (config.githubToken) {
      try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: config.githubToken });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        console.log(chalk.green(`✓ GitHub API: Connected as ${user.login}`));
      } catch (error) {
        console.log(chalk.red(`✗ GitHub API: ${error.message}`));
        console.log(chalk.yellow('  Please check your GitHub token'));
      }
    } else {
      console.log(chalk.yellow('⚠ GitHub API: No token provided, skipping test'));
    }

    // Test OpenAI API
    if (config.openaiKey) {
      try {
        const OpenAI = await import('openai');
        const openai = new OpenAI.default({ apiKey: config.openaiKey });
        
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello! This is a connection test.' }],
          max_tokens: 10
        });
        
        console.log(chalk.green('✓ OpenAI API: Connected successfully'));
      } catch (error) {
        console.log(chalk.red(`✗ OpenAI API: ${error.message}`));
        console.log(chalk.yellow('  Please check your OpenAI API key'));
      }
    } else {
      console.log(chalk.yellow('⚠ OpenAI API: No key provided, skipping test'));
    }
  }

  async installDependencies() {
    console.log(chalk.blue('\\n📦 Installing dependencies...\\n'));
    
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve, reject) => {
        const npm = spawn('npm', ['install'], {
          stdio: 'inherit',
          cwd: rootDir
        });

        npm.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green('\\n✓ Dependencies installed successfully'));
            resolve();
          } else {
            console.log(chalk.red(`\\n✗ npm install failed with code ${code}`));
            reject(new Error(`npm install failed with code ${code}`));
          }
        });

        npm.on('error', (error) => {
          console.log(chalk.red(`\\n✗ npm install failed: ${error.message}`));
          reject(error);
        });
      });
    } catch (error) {
      console.log(chalk.red(`Error running npm install: ${error.message}`));
      throw error;
    }
  }

  async createDirectories() {
    console.log(chalk.blue('\\n📁 Creating required directories...\\n'));
    
    const directories = ['logs', 'logs/backups'];
    
    for (const dir of directories) {
      const dirPath = path.join(rootDir, dir);
      try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(chalk.green(`✓ Created ${dir}/`));
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.log(chalk.red(`✗ Failed to create ${dir}/: ${error.message}`));
        } else {
          console.log(chalk.gray(`  ${dir}/ already exists`));
        }
      }
    }
  }

  async showNextSteps() {
    console.log(chalk.green('\\n🎉 Setup completed successfully!\\n'));
    console.log(chalk.bold('Next steps:'));
    console.log('');
    console.log('1. Test the installation:');
    console.log(chalk.cyan('   npm run test'));
    console.log('');
    console.log('2. Try the BA Agent:');
    console.log(chalk.cyan('   node client/devshop-mcp.js ba --repo=owner/repo "Add user authentication"'));
    console.log('');
    console.log('3. Try the Developer Agent:');
    console.log(chalk.cyan('   node client/devshop-mcp.js dev --repo=owner/repo --issue=1'));
    console.log('');
    console.log('4. View logs:');
    console.log(chalk.cyan('   node client/devshop-mcp.js logs'));
    console.log('');
    console.log(chalk.bold('Documentation:'));
    console.log('- Configuration: config/default.json');
    console.log('- Environment: .env file');
    console.log('- Logs: logs/ directory');
    console.log('');
    console.log(chalk.yellow('💡 Tip: Start with a simple test repository to validate the setup.'));
  }

  async run() {
    try {
      console.log(chalk.bold.blue('\\n🔧 DevShop Setup Wizard\\n'));
      console.log('This wizard will help you configure DevShop for first use.\\n');

      // Check requirements
      const requirementsMet = await this.checkRequirements();
      if (!requirementsMet) {
        console.log(chalk.red('\\n❌ Requirements check failed. Please fix the issues above.'));
        process.exit(1);
      }

      // Install dependencies
      await this.installDependencies();

      // Setup environment
      const config = await this.setupEnvironment();

      // Create directories
      await this.createDirectories();

      // Test connections
      await this.testConnections(config);

      // Show next steps
      await this.showNextSteps();

    } catch (error) {
      console.error(chalk.red(`\\n❌ Setup failed: ${error.message}`));
      process.exit(1);
    } finally {
      this.readline.close();
    }
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new DevShopSetup();
  setup.run().catch(console.error);
}

export default DevShopSetup;