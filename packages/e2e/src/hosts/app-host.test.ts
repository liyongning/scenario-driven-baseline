import { EventEmitter } from 'node:events';
import { test } from 'vitest';
import { appPreviewPlan, createAppHost, parsePreviewUrl } from './app-host.ts';

test(
  'SCN-BROWSER-PLATFORM-004 app-host-launcher',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-004',
        caseId: 'app-host-launcher',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-004',
            caseKey: 'app-host-launcher',
            checks: ['preview-args', 'printed-url', 'startup-failure-visible'],
          },
        ],
      },
    },
  },
  async (context) => {
    context.expect(appPreviewPlan('/repo/web')).toEqual({
      command: 'pnpm',
      args: ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '0'],
      cwd: '/repo/web',
    });
    context
      .expect(parsePreviewUrl('  Local: http://127.0.0.1:43123/\n'))
      .toBe('http://127.0.0.1:43123/');

    function fakeChild(events: ReadonlyArray<'exit' | 'line'>) {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => true,
      });
      queueMicrotask(() => {
        for (const event of events) {
          if (event === 'line') child.stdout.emit('data', Buffer.from('http://localhost:1234/\n'));
          else child.emit('exit', 1, null);
        }
      });
      return child;
    }

    await context
      .expect(
        createAppHost({
          root: '/repo',
          productDirectory: 'web',
          spawn: () => fakeChild(['exit']) as never,
          verifyFreshness: () => undefined,
        }),
      )
      .rejects.toThrow(/did not print a 127\.0\.0\.1 URL/);

    await context
      .expect(
        createAppHost({
          root: '/repo',
          productDirectory: 'web',
          spawn: () => fakeChild(['line', 'exit']) as never,
          verifyFreshness: () => undefined,
        }),
      )
      .rejects.toThrow(/did not print a 127\.0\.0\.1 URL/);

    const running = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: () => true,
    });
    const hostPromise = createAppHost({
      root: '/repo',
      productDirectory: 'web',
      spawn: () => running as never,
      verifyFreshness: () => undefined,
    });
    running.stdout.emit('data', Buffer.from('  Local: http://127.0.0.1:43124/\n'));
    const host = await hostPromise;
    context.expect(host.url).toBe('http://127.0.0.1:43124/');
    context.expect(host.output()).toContain('http://127.0.0.1:43124/');
    await host.close();

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['preview-args', 'printed-url', 'startup-failure-visible'],
      }),
      'scenario-evidence',
    );
  },
);
