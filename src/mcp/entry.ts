#!/usr/bin/env tsx
import { startMCPServer } from './server.js';

startMCPServer().catch((err) => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
