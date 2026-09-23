import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openSession } from '../session.js';

test('cookie jars isolate origins, persist server cookies, clear logout, and reject concurrent access', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'plopino-session-'));
  const previousDir = process.env.PLOPINO_CONFIG_DIR;
  const previousFetch = globalThis.fetch;
  process.env.PLOPINO_CONFIG_DIR = dir;
  t.after(async () => {
    globalThis.fetch = previousFetch;
    if (previousDir === undefined) delete process.env.PLOPINO_CONFIG_DIR;
    else process.env.PLOPINO_CONFIG_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });
  let setCookie = ['gw_session=saved-session; Path=/; HttpOnly; Secure; Max-Age=3600'];
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { headers: { getSetCookie: () => setCookie } };
  };
  let session = await openSession('https://first.example');
  await assert.rejects(() => openSession('https://first.example'), /Another CLI command/);
  await session.fetch('https://first.example/api/auth/login');
  assert.equal(request.options.redirect, 'manual', 'credentials must not follow redirects');
  assert.match(request.options.headers.get('Cookie'), /boards_anon=[A-Za-z0-9_-]{43}/);
  await session.close();
  session = await openSession('https://first.example');
  setCookie = [];
  await session.fetch('https://first.example/api/auth/me');
  assert.match(request.options.headers.get('Cookie'), /gw_session=saved-session/);
  await assert.rejects(() => session.fetch('https://second.example/api/auth/me'), /another origin/);
  setCookie = ['gw_session=; Path=/; Max-Age=0'];
  await session.fetch('https://first.example/api/auth/logout');
  assert.equal(session.hasSession(), false);
  await session.close();
  session = await openSession('https://second.example');
  setCookie = [];
  await session.fetch('https://second.example/api/auth/me');
  assert.doesNotMatch(request.options.headers.get('Cookie'), /gw_session/);
  await session.close();
  await assert.rejects(() => openSession('http://remote.example'), /HTTPS/);
});
