import { expect, test, vi } from 'vitest';

const fixtureOperation = vi.hoisted(() => ({
  meta: {
    id: 'fixtureFallback',
    method: 'get',
    path: '/fixture',
    security: [],
    codes: [],
  },
}));

vi.mock('../src/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/index')>()),
  fixtureFallback: fixtureOperation,
}));

const { run } = await import('./browser-runner');

test('OpenAPI browser runner discovers exported operations when no map is supplied', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"code":0,"message":"ok","data":{"ok":true}}');
  try {
    await expect(
      run([{ method: 'fixtureFallback', input: {} }], {
        gatewayBaseUrl: 'https://api.example.invalid',
      }),
    ).resolves.toEqual([{ kind: 'success', data: { ok: true } }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
