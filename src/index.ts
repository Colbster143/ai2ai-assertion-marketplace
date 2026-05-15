#!/usr/bin/env tsx
import { startAPI } from './api/rest.js';

const command = process.argv[2];

switch (command) {
  case 'api':
    startAPI(Number(process.env.PORT) || 3099);
    break;
  case 'mcp':
    console.error('MCP server must be run via the MCP client, not directly.');
    console.error('Configure it in your MCP client settings pointing to:');
    console.error('  npx tsx src/mcp/entry.ts');
    console.error('');
    console.error('Or in opencode.json / claude_desktop_config.json:');
    console.error('{');
    console.error('  "mcpServers": {');
    console.error('    "ai2ai-marketplace": {');
    console.error(`      "command": "npx",`);
    console.error(`      "args": ["tsx", "src/mcp/entry.ts"],`);
    console.error(`      "cwd": "${process.cwd()}"`);
    console.error('    }');
    console.error('  }');
    console.error('}');
    break;
  default:
    console.log('AI2AI Assertion Marketplace');
    console.log('');
    console.log('Usage:');
    console.log('  npm run api     Start the REST API server');
    console.log('  npm run mcp     MCP server (configure in MCP client)');
    console.log('  npm run cli     CLI management tool');
    console.log('  npm run db:seed Seed with demo data');
    console.log('');
    break;
}
