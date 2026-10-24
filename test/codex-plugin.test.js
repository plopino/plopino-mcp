import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const PLUGIN = path.join(ROOT, 'codex-plugin');
const readJson = async file => JSON.parse(await readFile(path.join(PLUGIN, file), 'utf8'));

const openai = manifest => manifest.extensions?.['com.openai'] ?? {};

test('Codex plugin uses portable metadata and matches package version', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = await readJson('plugin.json');
  assert.equal(manifest.name, 'plopino');
  assert.equal(manifest.version, pkg.version, 'Codex plugin and npm versions must not drift');
  assert.match(manifest.$schema, /^https:\/\/agent-plugins\.org\/schemas\/1\.0\.0\/plugin\.schema\.json$/);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.author.name, 'Plopino');

  const { interface: listing, review, publication } = openai(manifest);
  assert.equal(listing.displayName, 'Plopino');
  assert.ok(listing.shortDescription.length > 0 && listing.shortDescription.length <= 30);
  assert.ok(listing.longDescription.length > 0 && listing.longDescription.length <= 4000);
  assert.equal(listing.developerName, 'Plopino');
  assert.equal(listing.category, 'Productivity');
  assert.deepEqual(listing.capabilities, ['Write']);
  for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
    assert.match(listing[key], /^https:\/\//, `${key} must be HTTPS`);
  }
  assert.equal(listing.composerIcon, './assets/icon.png');
  assert.equal(listing.logo, './assets/icon.png');
  assert.equal(review.commerce, false);
  assert.equal(review.test_cases.positive.length, 5);
  assert.equal(review.test_cases.negative.length, 3);
  for (const item of review.test_cases.positive) {
    for (const field of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
      assert.ok(item[field], `positive case needs ${field}`);
    }
  }
  for (const item of review.test_cases.negative) {
    for (const field of ['description', 'prompt', 'expected_behavior']) {
      assert.ok(item[field], `negative case needs ${field}`);
    }
  }
  assert.equal(review.demo_recording_url, undefined,
    'demo recording must be a real URL added after recording, never a placeholder');
  assert.match(publication.release_notes, /OAuth/);
});

test('Codex plugin declares mixed OAuth via DCR and no fixed bearer token', async () => {
  const mcp = await readJson('mcp.json');
  assert.match(mcp.$schema, /^https:\/\/agent-plugins\.org\/schemas\/1\.0\.0\/mcp\.schema\.json$/);
  assert.deepEqual(Object.keys(mcp.mcpServers), ['plopino']);
  const server = mcp.mcpServers.plopino;
  assert.equal(server.type, 'streamable-http');
  assert.equal(server.url, 'https://plopino.com/mcp');
  assert.equal(server.headers, undefined, 'OpenAI public submission rejects nonempty server headers');
  const auth = server.extensions['com.openai'].auth;
  assert.equal(auth.type, 'mixed');
  assert.equal(auth.client.mode, 'dcr');
  assert.deepEqual(auth.baseScopes, ['publish']);
  assert.equal(auth.resource, 'https://plopino.com/mcp');
});

test('Codex marketplace points to the portable plugin and enables install', async () => {
  const marketplace = JSON.parse(await readFile(path.join(ROOT, '.agents/plugins/marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'plopino');
  assert.equal(marketplace.interface.displayName, 'Plopino');
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, 'plopino');
  assert.equal(entry.source.source, 'local');
  assert.equal(entry.source.path, './codex-plugin');
  assert.equal(entry.policy.installation, 'AVAILABLE');
  assert.equal(entry.policy.authentication, 'ON_INSTALL');
  assert.equal(entry.category, 'Productivity');
});

test('Codex plugin contains a usable skill, license, icons, and no placeholders', async () => {
  const skill = await readFile(path.join(PLUGIN, 'skills/publish-with-plopino/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: publish-with-plopino\ndescription: .+\n---/);
  assert.match(skill, /publish_page/);
  assert.match(skill, /publish_files/);
  assert.match(skill, /claim/i);
  await stat(path.join(PLUGIN, 'LICENSE'));
  await stat(path.join(PLUGIN, 'assets/icon.png'));
  const readme = await readFile(path.join(PLUGIN, 'README.md'), 'utf8');
  assert.ok(readme.split(/\s+/).filter(Boolean).length > 40);
  assert.doesNotMatch(readme, /TODO|TBD|example\.com/);

  const files = await readdir(PLUGIN, { recursive: true });
  for (const file of files) {
    if (/\.(?:json|md)$/i.test(file)) {
      const text = await readFile(path.join(PLUGIN, file), 'utf8');
      assert.doesNotMatch(text, /TODO|TBD|example\.com/, `${file} must not contain placeholders`);
      assert.ok(Buffer.byteLength(text) < 256 * 1024, `${file} exceeds review-friendly text size`);
    }
  }
});
