import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import type { ProjectManifest } from '../../../../scripts/lib/project-manifest.ts';

const mocks = vi.hoisted(() => ({
  createHttpServer: vi.fn(),
  createViteServer: vi.fn(),
}));
vi.mock('node:http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:http')>()),
  createServer: mocks.createHttpServer,
}));
vi.mock('vite', () => ({ createServer: mocks.createViteServer }));

import { createProtocolHost } from './protocol-host.ts';

const manifest = {
  packages: [{ directory: 'openapi', role: 'protocol', protocolKind: 'openapi' }],
  bindings: [{ name: 'web-openapi-browser', protocol: 'openapi' }],
} as unknown as ProjectManifest;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'protocol-host-branches-'));
  mkdirSync(join(root, 'packages/openapi/testing'), { recursive: true });
  writeFileSync(join(root, 'packages/openapi/testing/browser-runner.ts'), 'export {};\n');
  return root;
}

function server(address: unknown, closeError?: Error) {
  const value = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
    address: vi.fn(() => address),
    close: vi.fn((callback: (error?: Error) => void) => callback(closeError)),
  });
  mocks.createHttpServer.mockReturnValueOnce(value);
  return value;
}

test('protocol host rejects an unbound server address', async () => {
  const root = fixture();
  try {
    server(null);
    mocks.createViteServer.mockResolvedValueOnce({ middlewares: vi.fn(), close: vi.fn() });
    await expect(
      createProtocolHost({
        root,
        bindingName: 'web-openapi-browser',
        shadowUrl: 'http://127.0.0.1:1',
        manifest,
        verifyFreshness: () => undefined,
      }),
    ).rejects.toThrow(/did not bind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('protocol host propagates server close failures', async () => {
  const root = fixture();
  try {
    server({ address: '127.0.0.1', family: 'IPv4', port: 43123 }, new Error('close failure'));
    mocks.createViteServer.mockResolvedValueOnce({
      middlewares: vi.fn(),
      close: vi.fn(async () => undefined),
    });
    const host = await createProtocolHost({
      root,
      bindingName: 'web-openapi-browser',
      shadowUrl: 'http://127.0.0.1:1',
      manifest,
      verifyFreshness: () => undefined,
    });
    expect(host.url).toBe('http://127.0.0.1:43123/');
    await expect(host.close()).rejects.toThrow('close failure');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
