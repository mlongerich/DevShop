import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');

/**
 * Configuration Service
 * Handles loading, parsing, and managing application configuration
 */
export class ConfigService {
  constructor() {
    this.config = null;
  }

  /**
   * Load configuration from file
   * @param {string} configPath - Path to config file (optional)
   * @returns {Promise<Object>} Loaded configuration
   */
  async loadConfig(configPath) {
    try {
      const resolvedPath = configPath || path.join(rootDir, 'config', 'default.json');
      const configContent = await fs.readFile(resolvedPath, 'utf8');
      this.config = JSON.parse(configContent);

      // Resolve environment variables
      this.config = this.resolveEnvVars(this.config);
      
      // Validate configuration
      this.validateConfig(this.config);
      
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration object
   */
  getConfig() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Get specific configuration section
   * @param {string} section - Configuration section name
   * @returns {*} Configuration section
   */
  getSection(section) {
    const config = this.getConfig();
    return config[section];
  }

  /**
   * Resolve environment variable references in configuration
   * @param {*} obj - Configuration object or value
   * @returns {*} Resolved configuration
   */
  resolveEnvVars(obj) {
    if (typeof obj === 'string' && obj.startsWith('env:')) {
      const envVar = obj.substring(4);
      const value = process.env[envVar];
      if (!value) {
        console.warn(`Environment variable ${envVar} is not set`);
        return obj; // Return original if env var not found
      }
      return value;
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVars(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveEnvVars(value);
      }
      return resolved;
    }
    return obj;
  }

  /**
   * Validate configuration structure
   * @param {Object} config - Configuration to validate
   */
  validateConfig(config) {
    const requiredSections = ['mcp_servers'];
    
    for (const section of requiredSections) {
      if (!config[section]) {
        throw new Error(`Missing required configuration section: ${section}`);
      }
    }

    // Validate MCP servers configuration
    if (!config.mcp_servers.github && !config.mcp_servers.litellm) {
      throw new Error('At least github and litellm MCP servers must be configured');
    }
  }

  /**
   * Get GitHub configuration
   * @returns {Object} GitHub configuration
   */
  getGitHubConfig() {
    const config = this.getConfig();
    return {
      token: config.github?.token || process.env.GITHUB_TOKEN,
      ...config.github
    };
  }

  /**
   * Get LLM configuration
   * @returns {Object} LLM configuration
   */
  getLLMConfig() {
    const config = this.getConfig();
    return {
      api_key: config.llm?.api_key || process.env.OPENAI_API_KEY,
      base_url: config.llm?.base_url || 'https://api.openai.com/v1',
      ...config.llm
    };
  }

  /**
   * Get models configuration with environment variable priority
   * @returns {Object} Models configuration
   */
  getModelsConfig() {
    const config = this.getConfig();
    return {
      ba: process.env.OPENAI_BA_MODEL || config.models?.ba || 'gpt-5-nano',
      developer: process.env.OPENAI_DEV_MODEL || config.models?.developer || 'gpt-5-nano',
      tl: process.env.OPENAI_TL_MODEL || config.models?.tl || 'gpt-5-nano',
      'tech-lead': process.env.OPENAI_TL_MODEL || config.models?.['tech-lead'] || 'gpt-5-nano',
      ...config.models
    };
  }

  /**
   * Get MCP servers configuration
   * @returns {Object} MCP servers configuration
   */
  getMCPServersConfig() {
    const config = this.getConfig();
    return config.mcp_servers || {};
  }

  /**
   * Check if configuration is valid and complete
   * @returns {Object} Validation result with details
   */
  checkConfiguration() {
    try {
      const config = this.getConfig();
      const issues = [];
      const warnings = [];

      // Check GitHub token
      const githubConfig = this.getGitHubConfig();
      if (!githubConfig.token) {
        issues.push('GitHub token not configured');
      }

      // Check LLM API key
      const llmConfig = this.getLLMConfig();
      if (!llmConfig.api_key) {
        issues.push('LLM API key not configured');
      }

      // Check additional API keys
      if (!process.env.ANTHROPIC_API_KEY) {
        warnings.push('Anthropic API key not configured (optional)');
      }
      
      if (!process.env.GOOGLE_API_KEY) {
        warnings.push('Google API key not configured (optional)');
      }

      return {
        valid: issues.length === 0,
        issues,
        warnings,
        config_loaded: true
      };
    } catch (error) {
      return {
        valid: false,
        issues: [error.message],
        warnings: [],
        config_loaded: false
      };
    }
  }

  /**
   * Update configuration section
   * @param {string} section - Section name
   * @param {*} value - New value
   */
  updateSection(section, value) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    this.config[section] = value;
  }

  /**
   * Save current configuration to file
   * @param {string} configPath - Path to save configuration (optional)
   */
  async saveConfig(configPath) {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const resolvedPath = configPath || path.join(rootDir, 'config', 'default.json');
    await fs.writeFile(resolvedPath, JSON.stringify(this.config, null, 2), 'utf8');
  }
}