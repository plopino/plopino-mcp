import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.join(DIR, '..', 'claude-plugin');
const readJson = async rel => JSON.parse(await readFile(path.join(PLUGIN, rel), 'utf8'));
const wordCount = text => text.trim().split(/\s+/).filter(Boolean).length;

test('Claude plugin manifest matches the MCP package version and directory metadata', async () => {
  const pkg = JSON.parse(await readFile(path.join(DIR, '..', 'package.json'), 'utf8'));
  const manifest = await readJson('.claude-plugin/plugin.json');
  assert.equal(manifest.name, 'plopino');
  assert.equal(manifest.version, pkg.version, 'plugin and npm package versions must not drift');
  assert.equal(manifest.license, pkg.license);
  assert.equal(manifest.author.name, 'Plopino');
  assert.equal(manifest.privacyPolicyUrl, 'https://plopino.com/privacy');
  assert.equal(manifest.termsOfServiceUrl, 'https://plopino.com/terms');
  assert.equal(manifest.repository, 'https://github.com/plopino/plopino-mcp');
});

test('Claude plugin connects only to the production remote MCP endpoint', async () => {
  const mcp = await readJson('.mcp.json');
  assert.deepEqual(Object.keys(mcp.mcpServers), ['plopino']);
  const server = mcp.mcpServers.plopino;
  assert.equal(server.type, 'http');
  assert.equal(server.url, 'https://plopino.com/mcp');
  assert.equal(server.headers.Authorization, 'Bearer ${user_config.token}');
  const manifest = await readJson('.claude-plugin/plugin.json');
  assert.equal(manifest.userConfig.token.sensitive, true);
  assert.equal(manifest.userConfig.token.required, false);
});

test('Claude Code marketplace lists the Plopino plugin from this repository', async () => {
  const manifest = await readJson('.claude-plugin/plugin.json');
  const marketplace = JSON.parse(await readFile(
    path.join(DIR, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'plopino');
  assert.equal(marketplace.owner.name, 'Plopino');
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, manifest.name, 'marketplace and manifest names must match');
  assert.equal(entry.source, './claude-plugin');
});

test('Claude plugin README explains free installation paths', async () => {
  const readme = await readFile(path.join(PLUGIN, 'README.md'), 'utf8');
  assert.match(readme, /claude plugin marketplace add plopino\/plopino-mcp/);
  assert.match(readme, /claude plugin install plopino@plopino/);
  assert.match(readme, /releases\/latest\/download\/plopino\.mcpb/);
});

test('Claude plugin README meets the directory minimum and discloses data handling', async () => {
  const readme = await readFile(path.join(PLUGIN, 'README.md'), 'utf8');
  const prose = readme.replace(/```[\s\S]*?```/g, '');
  assert.ok(wordCount(prose) >= 40,
    `README has ${wordCount(prose)} words; directory requires at least 40`);
  assert.match(prose, /plopino\.com/i);
  assert.match(prose, /30 days/i);
  assert.match(prose, /token/i);
  assert.match(prose, /public/i);
});

test('Claude plugin ships a skill for publishing through Plopino', async () => {
  const skill = await readFile(path.join(PLUGIN, 'skills', 'publish-with-plopino', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: publish-with-plopino\ndescription: .+\n---/);
  assert.match(skill, /publish_page/);
  assert.match(skill, /publish_files/);
  assert.match(skill, /claim/i);
});
