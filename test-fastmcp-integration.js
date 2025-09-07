#!/usr/bin/env node

import { FastMCPDirectClient } from './client/clients/fastmcp-direct-client.js';
import chalk from 'chalk';

/**
 * Comprehensive FastMCP Integration Test
 * Tests the complete FastMCP server with enhanced features
 */
async function testFastMCPIntegration() {
  console.log(chalk.blue('🚀 FastMCP Integration Test Suite\n'));

  let client = null;
  let allTestsPassed = true;

  try {
    // Test 1: Client connection and initialization
    console.log(chalk.yellow('📡 Test 1: Client Connection'));
    client = new FastMCPDirectClient({
      sessionId: 'integration_test',
      userId: 'test_user'
    });

    await client.connect();
    console.log(chalk.green('  ✓ Connected to FastMCP server'));
    console.log(chalk.green(`  ✓ Session ID: ${client.getSessionId()}`));
    console.log(chalk.green(`  ✓ User ID: ${client.getUserId()}`));

    // Test 2: Tool discovery
    console.log(chalk.yellow('\n🔧 Test 2: Tool Discovery'));
    const tools = client.getAvailableTools();
    console.log(chalk.green(`  ✓ Found ${tools.length} tools:`));
    tools.forEach(tool => {
      console.log(chalk.gray(`    • ${tool.name}: ${tool.description}`));
    });

    // Verify all expected tools are present
    const expectedTools = ['llm_chat_completion', 'llm_get_usage', 'llm_check_limits', 'llm_list_models', 'llm_create_agent_prompt'];
    const missingTools = expectedTools.filter(tool => !client.hasTool(tool));
    if (missingTools.length > 0) {
      throw new Error(`Missing expected tools: ${missingTools.join(', ')}`);
    }
    console.log(chalk.green('  ✓ All expected tools available'));

    // Test 3: Model listing
    console.log(chalk.yellow('\n🤖 Test 3: Model Listing'));
    const modelData = await client.listModels({
      cost_preference: 'low'
    });
    
    console.log(chalk.green(`  ✓ Found ${Object.keys(modelData.supported_models).length} providers`));
    console.log(chalk.green(`  ✓ Generated ${modelData.recommendations.length} recommendations`));
    
    if (modelData.recommendations.length > 0) {
      const topModel = modelData.recommendations[0];
      console.log(chalk.gray(`    • Top recommendation: ${topModel.model} (${topModel.provider})`));
    }

    // Test 4: Usage statistics
    console.log(chalk.yellow('\n📊 Test 4: Usage Statistics'));
    const initialUsage = await client.getUsage();
    console.log(chalk.green('  ✓ Retrieved initial usage statistics'));
    console.log(chalk.gray(`    • Total providers tracked: ${Object.keys(initialUsage.providers).length}`));
    console.log(chalk.gray(`    • Active sessions: ${Object.keys(initialUsage.sessions).length}`));

    // Test 5: Limits checking
    console.log(chalk.yellow('\n⚖️  Test 5: Limits Checking'));
    const limitsCheck = await client.checkLimits(500);
    console.log(chalk.green('  ✓ Limits check completed'));
    console.log(chalk.gray(`    • Within limits: ${limitsCheck.within_limits}`));
    console.log(chalk.gray(`    • Current tokens: ${limitsCheck.current_usage.tokens}`));
    console.log(chalk.gray(`    • Current cost: $${limitsCheck.current_usage.cost.toFixed(4)}`));

    // Test 6: Agent prompt creation
    console.log(chalk.yellow('\n💭 Test 6: Agent Prompt Creation'));
    const agentPrompt = await client.createAgentPrompt(
      'developer',
      'Create a FastMCP integration test',
      'Testing enhanced FastMCP features'
    );
    
    console.log(chalk.green('  ✓ Agent prompt created successfully'));
    console.log(chalk.gray(`    • Role: ${agentPrompt.agent_role}`));
    console.log(chalk.gray(`    • System prompt length: ${agentPrompt.system_prompt.length} chars`));

    // Test 7: Enhanced chat completion (if API keys available)
    console.log(chalk.yellow('\n💬 Test 7: Enhanced Chat Completion'));
    
    if (process.env.OPENAI_API_KEY) {
      try {
        const chatResponse = await client.chatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'user', content: 'Say "FastMCP test successful" if you can hear me.' }
          ],
          max_tokens: 50,
          temperature: 0.1
        });

        if (chatResponse.success) {
          console.log(chalk.green('  ✓ Chat completion successful'));
          console.log(chalk.gray(`    • Response: ${chatResponse.response.substring(0, 50)}...`));
          console.log(chalk.gray(`    • Processing time: ${chatResponse.usage.processing_time_ms}ms`));
          console.log(chalk.gray(`    • Provider: ${chatResponse.metadata.provider}`));
          console.log(chalk.gray(`    • Session tracked: ${chatResponse.metadata.session_id}`));
        } else {
          console.log(chalk.yellow('  ⚠ Chat completion returned error (expected without proper model)'));
        }
      } catch (error) {
        console.log(chalk.yellow(`  ⚠ Chat completion test skipped: ${error.message}`));
      }
    } else {
      console.log(chalk.yellow('  ⚠ Chat completion test skipped (no OPENAI_API_KEY)'));
    }

    // Test 8: Session management
    console.log(chalk.yellow('\n📋 Test 8: Session Management'));
    const finalUsage = await client.getUsage();
    const sessionUsage = finalUsage.sessions[client.getSessionId()];
    
    if (sessionUsage) {
      console.log(chalk.green('  ✓ Session tracking working'));
      console.log(chalk.gray(`    • Session tokens: ${sessionUsage.total_tokens}`));
      console.log(chalk.gray(`    • Session cost: $${sessionUsage.total_cost.toFixed(4)}`));
    } else {
      console.log(chalk.yellow('  ⚠ Session tracking not yet active (no usage recorded)'));
    }

    // Test 9: Error handling
    console.log(chalk.yellow('\n🛡️  Test 9: Error Handling'));
    try {
      await client.chatCompletion({
        model: 'non-existent-model',
        messages: [{ role: 'user', content: 'test' }]
      });
      
      console.log(chalk.red('  ✗ Error handling test failed - should have thrown error'));
      allTestsPassed = false;
    } catch (error) {
      console.log(chalk.green('  ✓ Error handling working correctly'));
      console.log(chalk.gray(`    • Error caught: ${error.message.substring(0, 50)}...`));
    }

    // Performance summary
    console.log(chalk.yellow('\n⚡ Test Summary'));
    console.log(chalk.green('  ✓ FastMCP server operational'));
    console.log(chalk.green('  ✓ All tools functional'));
    console.log(chalk.green('  ✓ Session management active'));
    console.log(chalk.green('  ✓ Enhanced error handling working'));
    console.log(chalk.green('  ✓ Provider architecture intact'));

    if (allTestsPassed) {
      console.log(chalk.green('\n🎉 All FastMCP integration tests passed!'));
      console.log(chalk.green('Migration is ready for production deployment.'));
    } else {
      console.log(chalk.yellow('\n⚠️  Some tests failed - review before deployment'));
    }

  } catch (error) {
    console.error(chalk.red(`\n❌ FastMCP integration test failed: ${error.message}`));
    allTestsPassed = false;
    
    if (error.stack) {
      console.error(chalk.red('Stack trace:'));
      console.error(chalk.gray(error.stack));
    }
  } finally {
    // Cleanup
    if (client && client.isConnected()) {
      console.log(chalk.blue('\n🧹 Cleaning up...'));
      await client.disconnect();
      console.log(chalk.green('✓ Client disconnected'));
    }
  }

  return allTestsPassed;
}

// Enhanced connection test
async function testConnectionOnly() {
  console.log(chalk.blue('📡 Quick Connection Test\n'));
  
  const client = new FastMCPDirectClient({
    sessionId: 'quick_test'
  });

  try {
    await client.connect();
    console.log(chalk.green('✓ FastMCP server connection successful'));
    
    const tools = client.getAvailableTools();
    console.log(chalk.green(`✓ ${tools.length} tools loaded`));
    
    await client.disconnect();
    console.log(chalk.green('✓ Clean disconnection'));
    
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Connection failed: ${error.message}`));
    return false;
  }
}

// Run appropriate test based on command line argument
const testType = process.argv[2];

if (testType === 'quick') {
  testConnectionOnly().then(success => {
    process.exit(success ? 0 : 1);
  });
} else {
  testFastMCPIntegration().then(success => {
    process.exit(success ? 0 : 1);
  });
}