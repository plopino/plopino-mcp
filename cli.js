import { filesFromPath, publishFiles, DEFAULT_BASE } from './upload.js';
import { openSession } from './session.js';
import { credentials } from './login.js';

const HELP = `Usage: plopino publish <file-or-directory> [--json] [--update <url>]
       plopino login [--email <email>] [--password-stdin] [--json]
       plopino whoami [--json]
       plopino logout [--json]

Publish a file or directory and print its public URL.
  --json          Print a JSON result (errors also use JSON).
  --update <url>  Replace an existing board; requires login or PLOPINO_TOKEN.
  --help         Show this help without uploading.

Environment: PLOPINO_TOKEN (optional), PLOPINO_BASE_URL (optional).
Anonymous uploads are public and kept for 30 days. Keep the private claim link
printed after publishing, then open it in a browser to keep that upload.
Run plopino login to claim this CLI's anonymous uploads and save future uploads.
Cookies persist per server in ~/.config/plopino (override: PLOPINO_CONFIG_DIR).
Login uses email/password; passwords are never stored. Website sessions are separate.
Directories skip symlinks, .git, .env*, node_modules, .ssh and .aws.
Run with no arguments to start the stdio MCP server.
`;

export async function runCli(args) {
  const json = args.includes('--json');
  let session;
  try {
    if (args.includes('--help') || args[0] === '-h') {
      process.stdout.write(HELP);
      return 0;
    }
    const command = args.shift();
    if (!['publish', 'login', 'logout', 'whoami'].includes(command)) throw new Error('Unknown command. Run plopino --help.');
    const baseUrl = (process.env.PLOPINO_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
    const token = (process.env.PLOPINO_TOKEN || '').trim();
    const loginBody = command === 'login' ? await credentials([...args]) : null;
    session = await openSession(baseUrl);
    const authRequest = async (route, body, useToken = false) => {
      const res = await session.fetch(`${baseUrl}/api/auth/${route}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(useToken ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Authentication failed (HTTP ${res.status}).`); }
      if (!res.ok) throw new Error(data.error || `Authentication failed (HTTP ${res.status}).`);
      return data;
    };
    if (command !== 'publish') {
      if (command !== 'login' && args.some(a => a !== '--json')) throw new Error(`Unknown ${command} option.`);
      const data = await authRequest(command === 'whoami' ? 'me' : command, command === 'login' ? loginBody : command === 'logout' ? {} : null);
      const note = command === 'logout' ? 'Logged out. Anonymous upload identity is retained.'
        : command === 'login' ? `Logged in. Claimed ${data.claimed ?? 0} anonymous upload(s) from this CLI.` : 'Logged in.';
      process.stdout.write(json ? JSON.stringify({ ...data, note }) + '\n' : `${note}${data.user ? ' ' + data.user.username : ''}\n`);
      return 0;
    }
    let input, updateUrl;
    while (args.length) {
      const arg = args.shift();
      if (arg === '--json') continue;
      if (arg === '--update') {
        updateUrl = args.shift();
        if (!updateUrl || updateUrl.startsWith('-')) throw new Error('--update requires a URL.');
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else if (input) throw new Error('Provide exactly one file or directory.');
      else input = arg;
    }
    if (!input) throw new Error('Provide a file or directory. Run plopino --help.');
    // Do not silently publish anonymously when a saved login has expired/revoked.
    if (token || session.hasSession()) {
      try { await authRequest('me', null, !!token); }
      catch { throw new Error(token ? 'PLOPINO_TOKEN is invalid or could not be verified. Check the token before publishing.' : 'Saved login is no longer valid or could not be verified. Run plopino login, or plopino logout to publish anonymously.'); }
    }
    let boardId = null;
    if (updateUrl) {
      if (!token && !session.hasSession()) throw new Error('Updating requires login or PLOPINO_TOKEN. Run plopino login.');
      const url = new URL(updateUrl);
      const match = /^\/b\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
      if (url.origin !== new URL(baseUrl).origin || !match || url.search || url.hash) {
        throw new Error('--update must be a board URL on the configured Plopino instance.');
      }
      boardId = match[1];
    }
    const files = await filesFromPath(input, { excludePrivate: true });
    const data = await publishFiles(files, {
      baseUrl, token, boardId, source: 'cli', fetchImpl: session.fetch, signal: AbortSignal.timeout(120_000),
    });
    const owned = data.anonymous === false || !!data.meta?.owner || !!token || session.hasSession();
    const claimUrl = !boardId && !owned ? data.claimUrl : undefined;
    const note = boardId ? 'Updated — the link is unchanged.'
      : owned ? 'Published to your account.' : 'Public; kept for 30 days. Open the private claim link in your browser to keep it, or run plopino login to claim this CLI session’s uploads.';
    process.stdout.write(json
      ? JSON.stringify({ url: data.url, ...(claimUrl ? { claimUrl } : {}), updated: !!boardId, files: files.length, note }) + '\n'
      : data.url + '\n');
    if (!json) process.stderr.write(note + (claimUrl ? `\nPrivate claim link (publisher only; do not include in the public share URL): ${claimUrl}` : '') + '\n');
    return 0;
  } catch (err) {
    const error = err?.message || String(err);
    if (json) process.stdout.write(JSON.stringify({ error }) + '\n');
    else process.stderr.write(`Could not publish: ${error}\n`);
    return 1;
  } finally {
    if (session) await session.close();
  }
}
