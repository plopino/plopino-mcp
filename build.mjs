// 单文件发行版的唯一构建入口；dist 同步测试复用同一组 esbuild 参数。
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function buildOptions({ write = true } = {}) {
  // npm 安装会带上依赖自己的 LICENSE；单文件下载没有 node_modules，必须把同一份
  // 声明嵌进 bundle。相同许可证合并，但保留其适用的包名；Zod 的 MIT 声明单列。
  const packages = ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'];
  const groups = new Map();
  for (const name of packages) {
    const license = await readFile(path.join(ROOT, 'node_modules', name, 'LICENSE'), 'utf8');
    if (!groups.has(license)) groups.set(license, []);
    groups.get(license).push(name);
  }
  const notices = [...groups].map(([license, names]) => (
    `Bundled components: ${names.join(', ')}\n\n${license}`
  )).join('\n\n---\n\n');
  if (notices.includes('*/')) throw new Error('Third-party notices cannot be embedded safely in a JS comment.');

  return {
    absWorkingDir: ROOT,
    entryPoints: ['index.js'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: path.join(ROOT, 'dist', 'plopino-mcp.mjs'),
    logLevel: 'warning',
    write,
    footer: { js: `/*!\n${notices}\n*/` },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build(await buildOptions());
}
