import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';

export async function credentials(args) {
  let email, passwordStdin = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') continue;
    if (arg === '--email') {
      email = args.shift();
      if (!email || email.startsWith('-')) throw new Error('--email requires an address.');
    } else if (arg === '--password-stdin') passwordStdin = true;
    else throw new Error(`Unknown login option: ${arg}`);
  }
  if (passwordStdin) {
    if (!email) throw new Error('--password-stdin requires --email.');
    if (process.stdin.isTTY) throw new Error('Pipe the password on standard input, or omit --password-stdin for a hidden prompt.');
    let password = '';
    for await (const chunk of process.stdin) {
      password += chunk;
      if (password.length > 4096) throw new Error('Password input is too long.');
    }
    return { email, password: password.replace(/\r?\n$/, '') };
  }
  if (!process.stdin.isTTY) throw new Error('Login needs a terminal, or --email with --password-stdin.');
  if (!email) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try { email = await rl.question('Email: '); } finally { rl.close(); }
  }
  const password = await new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = !!input.isRaw;
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stderr.write('Password: ');
    let value = '';
    const finish = (err) => {
      input.removeListener('keypress', onKey);
      input.setRawMode(wasRaw);
      input.pause();
      process.stderr.write('\n');
      if (err) reject(err); else resolve(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) return finish(new Error('Login cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = [...value].slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta && !text.includes('\x1b')) value += text;
      if (value.length > 4096) finish(new Error('Password is too long.'));
    };
    input.on('keypress', onKey);
  });
  return { email, password };
}
