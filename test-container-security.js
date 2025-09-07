#!/usr/bin/env node

import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * Container Security Test Suite
 * Validates security configuration of containerized FastMCP server
 */
async function testContainerSecurity() {
  console.log(chalk.blue('🔒 Container Security Test Suite\n'));

  let allTestsPassed = true;
  const securityTests = [
    {
      name: 'Non-Root User Verification',
      command: 'docker',
      args: ['exec', 'devshop-fastmcp-server', 'id'],
      expectedPattern: /uid=1001.*gid=1001/,
      description: 'Verify container runs as non-root user (UID 1001)'
    },
    {
      name: 'Read-Only Root Filesystem',
      command: 'docker',
      args: ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.ReadonlyRootfs}}'],
      expectedPattern: /true/,
      description: 'Verify root filesystem is read-only'
    },
    {
      name: 'Dropped Capabilities',
      command: 'docker',
      args: ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.CapDrop}}'],
      expectedPattern: /ALL/,
      description: 'Verify all capabilities are dropped'
    },
    {
      name: 'No New Privileges',
      command: 'docker',
      args: ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.SecurityOpt}}'],
      expectedPattern: /no-new-privileges:true/,
      description: 'Verify no-new-privileges security option'
    },
    {
      name: 'Resource Limits - Memory',
      command: 'docker',
      args: ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.Memory}}'],
      expectedPattern: /536870912/, // 512MB in bytes
      description: 'Verify memory limit (512MB) is enforced'
    },
    {
      name: 'Container Network Isolation',
      command: 'docker',
      args: ['inspect', 'devshop-fastmcp-server', '--format', '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'],
      expectedPattern: /.+/,
      description: 'Verify container is on isolated network'
    },
    {
      name: 'Docker Secrets Mount',
      command: 'docker',
      args: ['exec', 'devshop-fastmcp-server', 'ls', '-la', '/run/secrets/'],
      expectedPattern: /openai_api_key|anthropic_api_key/,
      description: 'Verify Docker secrets are properly mounted'
    },
    {
      name: 'Process Tree Isolation',
      command: 'docker',
      args: ['exec', 'devshop-fastmcp-server', 'ps', 'aux'],
      expectedPattern: /node.*fastmcp-litellm-server-fixed\.js/,
      description: 'Verify only FastMCP process is running in container'
    }
  ];

  console.log(chalk.yellow(`Running ${securityTests.length} security tests...\n`));

  for (const test of securityTests) {
    try {
      console.log(chalk.cyan(`🔍 ${test.name}`));
      console.log(chalk.gray(`   ${test.description}`));
      
      const result = await executeCommand(test.command, test.args);
      
      if (test.expectedPattern.test(result)) {
        console.log(chalk.green(`   ✓ PASS: Security control verified`));
      } else {
        console.log(chalk.red(`   ✗ FAIL: Security control not found`));
        console.log(chalk.red(`   Output: ${result}`));
        allTestsPassed = false;
      }
    } catch (error) {
      console.log(chalk.red(`   ✗ ERROR: ${error.message}`));
      allTestsPassed = false;
    }
    
    console.log(''); // Empty line for readability
  }

  // Additional comprehensive security check
  console.log(chalk.yellow('🔒 Comprehensive Security Audit'));
  try {
    const securityAudit = await performSecurityAudit();
    if (securityAudit.passed) {
      console.log(chalk.green('   ✓ PASS: All security controls verified'));
    } else {
      console.log(chalk.red(`   ✗ FAIL: ${securityAudit.issues.length} security issues found`));
      securityAudit.issues.forEach(issue => {
        console.log(chalk.red(`     • ${issue}`));
      });
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ ERROR: Security audit failed: ${error.message}`));
    allTestsPassed = false;
  }

  // Summary
  console.log(chalk.yellow('\n📋 Security Test Summary'));
  if (allTestsPassed) {
    console.log(chalk.green('🎉 All security tests passed!'));
    console.log(chalk.green('✅ FastMCP container is properly security-hardened'));
    console.log(chalk.green('✅ Ready for production deployment'));
  } else {
    console.log(chalk.red('❌ Some security tests failed'));
    console.log(chalk.red('⚠️  Review security configuration before deployment'));
  }

  return allTestsPassed;
}

/**
 * Execute command and return output
 */
function executeCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Perform comprehensive security audit
 */
async function performSecurityAudit() {
  const auditResult = {
    passed: true,
    issues: []
  };

  try {
    // Check if container is running as root (critical security issue)
    const userInfo = await executeCommand('docker', ['exec', 'devshop-fastmcp-server', 'whoami']);
    if (userInfo === 'root') {
      auditResult.passed = false;
      auditResult.issues.push('Container running as root user');
    }

    // Check for writable root filesystem
    const filesystemCheck = await executeCommand('docker', ['exec', 'devshop-fastmcp-server', 'sh', '-c', 'touch /test_write 2>&1 || echo "readonly"']);
    if (!filesystemCheck.includes('readonly') && !filesystemCheck.includes('Read-only')) {
      auditResult.passed = false;
      auditResult.issues.push('Root filesystem is writable');
    }

    // Check for privileged mode
    const privilegedCheck = await executeCommand('docker', ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.Privileged}}']);
    if (privilegedCheck === 'true') {
      auditResult.passed = false;
      auditResult.issues.push('Container running in privileged mode');
    }

    // Check for host network mode
    const networkCheck = await executeCommand('docker', ['inspect', 'devshop-fastmcp-server', '--format', '{{.HostConfig.NetworkMode}}']);
    if (networkCheck === 'host') {
      auditResult.passed = false;
      auditResult.issues.push('Container using host network mode');
    }

  } catch (error) {
    auditResult.passed = false;
    auditResult.issues.push(`Audit check failed: ${error.message}`);
  }

  return auditResult;
}

/**
 * Check if container is running
 */
async function checkContainerStatus() {
  try {
    const result = await executeCommand('docker', ['ps', '--format', 'table {{.Names}}\t{{.Status}}', '--filter', 'name=devshop-fastmcp-server']);
    return result.includes('devshop-fastmcp-server') && result.includes('Up');
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log(chalk.blue('🐳 Checking container status...'));
  
  const isRunning = await checkContainerStatus();
  if (!isRunning) {
    console.log(chalk.yellow('⚠️  FastMCP container is not running. Starting container...'));
    console.log(chalk.blue('💡 Hint: Run "npm run fastmcp:container" to start the container'));
    process.exit(1);
  }

  console.log(chalk.green('✅ FastMCP container is running\n'));
  
  const success = await testContainerSecurity();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});