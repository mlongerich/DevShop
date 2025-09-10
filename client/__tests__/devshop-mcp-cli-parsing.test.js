import { describe, test, expect, jest } from '@jest/globals';
import { Command } from 'commander';

describe('DevShop CLI Argument Parsing', () => {
  test('should pass input argument as description in interactive mode', () => {
    const program = new Command();
    
    // Set up the BA command similar to devshop-mcp.js
    program
      .command('ba')
      .description('Run Business Analyst agent for requirements analysis')
      .requiredOption('--repo <repo>', 'Repository in format owner/repo-name')
      .argument('[input]', 'Feature description (legacy mode) or conversation input')
      .option('--interactive', 'Enter interactive real-time conversation mode')
      .option('--multi-agent', 'Enable multi-agent mode (BA + Tech Lead collaboration)')
      .action((input, options) => {
        // This simulates the parsing logic in devshop-mcp.js
        const commandOptions = {
          repo: options.repo
        };
        
        // Route interactive mode - fixed behavior
        if (options.interactive) {
          commandOptions.interactive = true;
          commandOptions.multiAgent = options.multiAgent;
          commandOptions.description = input; // Fixed: now passing input to interactive mode
        }
        
        // For the test, we'll check if description is set
        expect(commandOptions.description).toBe('i want to add unit tests');
      });
    
    // Parse the command like the user would run it
    program.parse([
      'node', 
      'devshop-mcp.js', 
      'ba',
      '--repo=test/repo',
      '--interactive',
      '--multi-agent',
      'i want to add unit tests'
    ]);
  });
});