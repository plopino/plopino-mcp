import { mkdir, readFile, writeFile, rename, open, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

// One cookie jar per exact origin. Never follow redirects carrying credentials.
export async function openSession(base) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PLOPINO_BASE_URL must be an origin without a path or credentials.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use HTTPS for Plopino (HTTP is allowed only on loopback).');
  }
  const dir = process.env.PLOPINO_CONFIG_DIR || path.join(homedir(), '.config', 'plopino');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, createHash('sha256').update(url.origin).digest('hex') + '.json');
  const lockFile = file + '.lock';
  let lock;
  try { lock = await open(lockFile, 'wx', 0o600); }
  catch (err) {
    if (err.code === 'EEXIST') throw new Error(`Another CLI command is using this session. If no command is running, remove the stale lock: ${lockFile}`);
    throw err;
  }
  const close = async () => { await lock.close(); await unlink(lockFile); };
  let cookies;
  try {
    try { cookies = JSON.parse(await readFile(file, 'utf8')).cookies; }
    catch (err) { if (err.code !== 'ENOENT') throw err; cookies = {}; }
    if (!cookies || typeof cookies !== 'object' || Array.isArray(cookies)) throw new Error('Invalid CLI cookie file.');
    const save = async () => {
      const tmp = file + '.tmp';
      await writeFile(tmp, JSON.stringify({ cookies }) + '\n', { mode: 0o600 });
      await chmod(tmp, 0o600);
      await rename(tmp, file);
    };
    // Persist identity before uploading, even if the response is lost.
    if (!cookies.boards_anon || cookies.boards_anon.expires <= Date.now()) {
      cookies.boards_anon = { value: randomBytes(32).toString('base64url'), expires: Date.now() + 365 * 86400000 };
    }
    await save();
    const fetchWithCookies = async (input, options = {}) => {
      if (new URL(input).origin !== url.origin) throw new Error('Refusing to send CLI cookies to another origin.');
      const headers = new Headers(options.headers);
      const cookie = Object.entries(cookies)
        .filter(([name, c]) => ['boards_anon', 'gw_session'].includes(name) && c.expires > Date.now())
        .map(([name, c]) => `${name}=${c.value}`).join('; ');
      if (cookie) headers.set('Cookie', cookie);
      headers.set('User-Agent', 'plopino-cli');
      const res = await fetch(input, { ...options, headers, redirect: 'manual', signal: options.signal || AbortSignal.timeout(120_000) });
      const setCookies = res.headers.getSetCookie?.() || (res.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);
      for (const raw of setCookies) {
        const [pair, ...attrs] = raw.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        if (!['boards_anon', 'gw_session'].includes(name)) continue;
        const value = pair.slice(i + 1).trim();
        const maxAge = attrs.find(a => /^\s*max-age=/i.test(a));
        const expiresAttr = attrs.find(a => /^\s*expires=/i.test(a));
        const expires = maxAge ? Date.now() + Number(maxAge.split('=')[1]) * 1000
          : expiresAttr ? Date.parse(expiresAttr.slice(expiresAttr.indexOf('=') + 1)) : Date.now() + 30 * 86400000;
        if (!value || expires <= Date.now()) delete cookies[name];
        else cookies[name] = { value, expires };
      }
      await save();
      return res;
    };
    return { fetch: fetchWithCookies, close, hasSession: () => !!cookies.gw_session };
  } catch (err) { await close(); throw err; }
}
