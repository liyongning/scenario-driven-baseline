import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, test, vi } from 'vitest';
import { baseManifest } from '../../tests/tooling/project-manifest-fixture.ts';
import { startDevRemote } from './dev-remote.ts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

test(
  'SCN-BROWSER-PLATFORM-014 dev-remote-config',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-014',
        caseId: 'dev-remote-config',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-014',
            caseKey: 'dev-remote-config',
            checks: ['no-default-target', 'prefix-forwarded', 'no-secret-leak'],
          },
        ],
      },
    },
  },
  async (context) => {
    const neverCreate = vi.fn(() => {
      throw new Error('Vite must not start without DEV_REMOTE_TARGET');
    });
    await context
      .expect(startDevRemote({ root: process.cwd(), env: {}, createViteServer: neverCreate }))
      .rejects.toThrow(/DEV_REMOTE_TARGET/);
    await context
      .expect(
        startDevRemote({
          root: process.cwd(),
          env: { DEV_REMOTE_TARGET: '   ' },
          createViteServer: neverCreate,
        }),
      )
      .rejects.toThrow(/DEV_REMOTE_TARGET/);
    context.expect(neverCreate).not.toHaveBeenCalled();

    const paths: string[] = [];
    const upstream = createHttpServer((request, response) => {
      paths.push(request.url ?? '');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ path: request.url }));
    });
    servers.push(upstream);
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('upstream did not bind');

    const target = `http://127.0.0.1:${address.port}`;
    const logs: string[] = [];
    const session = await startDevRemote({
      root: process.cwd(),
      env: {
        DEV_REMOTE_TARGET: target,
        DEV_REMOTE_CREDENTIAL: 'top-secret',
      },
      log: (message) => logs.push(message),
    });
    try {
      const forwarded = await fetch(`${session.url}api/hello?source=dev-remote`);
      context.expect(forwarded.status).toBe(200);
      context.expect(await forwarded.json()).toEqual({ path: '/api/hello?source=dev-remote' });
      context.expect(paths).toEqual(['/api/hello?source=dev-remote']);

      const beforeUnregistered = paths.length;
      const unregistered = await fetch(`${session.url}not-registered`);
      context.expect(unregistered.status).toBe(200);
      context.expect(paths).toHaveLength(beforeUnregistered);
      context.expect(logs.join('\n')).not.toContain('top-secret');
      context.expect(logs.join('\n')).not.toContain('DEV_REMOTE_CREDENTIAL');
      context.expect(logs.join('\n')).not.toContain(target);
      context.expect(logs.some((message) => message.includes(session.url))).toBe(true);
    } finally {
      await session.close();
    }

    const consoleLog = vi.spyOn(console, 'log').mockImplementation((message) => {
      logs.push(String(message));
    });
    const second = await startDevRemote({
      root: process.cwd(),
      env: { DEV_REMOTE_TARGET: target },
      host: '127.0.0.1',
    });
    try {
      context.expect(new URL(second.url).hostname).toBe('127.0.0.1');
      context.expect(logs.join('\n')).toContain(second.url);
    } finally {
      await second.close();
      await second.close();
      consoleLog.mockRestore();
    }

    const close = vi.fn(async () => {});
    const missingAddress = vi.fn(
      async () =>
        ({
          listen: vi.fn(async () => {}),
          close,
        }) as unknown as ViteDevServer,
    );
    await context
      .expect(
        startDevRemote({
          root: process.cwd(),
          env: { DEV_REMOTE_TARGET: target },
          createViteServer: missingAddress,
        }),
      )
      .rejects.toThrow(/没有绑定端口/);
    context.expect(close).toHaveBeenCalledTimes(1);

    const stringAddressClose = vi.fn(async () => {});
    await context
      .expect(
        startDevRemote({
          root: process.cwd(),
          env: { DEV_REMOTE_TARGET: target },
          createViteServer: async () =>
            ({
              listen: vi.fn(async () => {}),
              close: stringAddressClose,
              httpServer: { address: () => '' },
            }) as unknown as ViteDevServer,
        }),
      )
      .rejects.toThrow(/没有绑定端口/);
    context.expect(stringAddressClose).toHaveBeenCalledTimes(1);

    const noWebRoot = mkdtempSync(join(tmpdir(), 'dev-remote-no-web-'));
    try {
      const manifest = baseManifest();
      writeFileSync(join(noWebRoot, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
      for (const pkg of manifest.packages) {
        const directory = join(noWebRoot, 'packages', pkg.directory);
        mkdirSync(directory, { recursive: true });
        const dependencies = Object.fromEntries(
          manifest.bindings
            .filter((binding) => binding.product === pkg.directory)
            .map((binding) => manifest.packages.find((item) => item.directory === binding.protocol))
            .filter((protocol) => protocol !== undefined)
            .map((protocol) => [protocol.name, 'workspace:*']),
        );
        writeFileSync(
          join(directory, 'package.json'),
          JSON.stringify({
            name: pkg.name,
            private: pkg.private,
            version: '0.0.0',
            dependencies,
          }),
        );
      }
      writeFileSync(
        join(noWebRoot, 'web.config.json'),
        readFileSync(join(process.cwd(), 'packages/e2e/host/web.config.json'), 'utf8'),
      );
      const neverCreate = vi.fn();
      await context
        .expect(
          startDevRemote({
            root: noWebRoot,
            env: { DEV_REMOTE_TARGET: target },
            createViteServer: neverCreate,
          }),
        )
        .rejects.toThrow(/没有登记 web-app 产品包/);
      context.expect(neverCreate).not.toHaveBeenCalled();
    } finally {
      rmSync(noWebRoot, { recursive: true, force: true });
    }

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['no-default-target', 'prefix-forwarded', 'no-secret-leak'],
      }),
      'scenario-evidence',
    );
  },
);
