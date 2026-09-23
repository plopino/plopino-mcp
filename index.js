#!/usr/bin/env node
// No arguments remains the existing stdio MCP entry point.
if (process.argv.length === 2) {
  await import('./mcp-server.js');
} else {
  const { runCli } = await import('./cli.js');
  process.exitCode = await runCli(process.argv.slice(2));
}
