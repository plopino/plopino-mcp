import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquisitionHeaders, publishFiles } from '../upload.js';
test('optional provenance is sent with uploads and absent by default', async () => {
  assert.deepEqual(acquisitionHeaders({}), {});
  assert.deepEqual(acquisitionHeaders({ PLOPINO_ACQUISITION_SOURCE: 'https://example.com' }), {});
  const old = process.env.PLOPINO_ACQUISITION_SOURCE;
  try {
    process.env.PLOPINO_ACQUISITION_SOURCE = 'devto';
    await publishFiles([{ name: 'index.html', data: '<h1>Example</h1>' }], { fetchImpl: async (_, init) => {
      assert.equal(JSON.parse(decodeURIComponent(init.headers['X-Plopino-Acquisition'])).channel, 'devto');
      assert.equal(init.headers['User-Agent'], 'plopino-mcp');
      return new Response(JSON.stringify({ url: 'https://example.com/b/test/' }));
    } });
  } finally { if (old === undefined) delete process.env.PLOPINO_ACQUISITION_SOURCE; else process.env.PLOPINO_ACQUISITION_SOURCE = old; }
});
