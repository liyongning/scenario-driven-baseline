import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), verifyFreshness: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('./freshness.ts', () => ({ assertProductBundleFresh: mocks.verifyFreshness }));

import { createAppHost, type ChildProcessLike } from './app-host.ts';

type FakeChild = ChildProcessLike &
  EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };

function child(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(() => true),
  }) as FakeChild;
}

test('app host uses the production spawn path and preserves non-Error failures', async () => {
  const running = child();
  mocks.spawn.mockImplementationOnce(
    (command: string, args: ReadonlyArray<string>, options: { cwd: string }) => {
      expect(command).toBe('pnpm');
      expect(args).toEqual(['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '0']);
      expect(options.cwd).toBe('/repo/packages/web');
      queueMicrotask(() =>
        running.stdout.emit('data', Buffer.from('Local: http://127.0.0.1:45123/\n')),
      );
      return running;
    },
  );
  const host = await createAppHost({
    root: '/repo',
    productDirectory: 'web',
  });
  expect(mocks.verifyFreshness).toHaveBeenCalledWith('/repo', 'web');
  expect(host.url).toBe('http://127.0.0.1:45123/');
  await host.close();
  expect(running.kill).toHaveBeenCalledOnce();

  const failed = child();
  mocks.spawn.mockImplementationOnce(() => {
    queueMicrotask(() => failed.emit('exit', 1));
    return failed;
  });
  const originalMatch = String.prototype.match;
  String.prototype.match = (() => {
    throw 'fixture string failure';
  }) as typeof String.prototype.match;
  try {
    await expect(
      createAppHost({
        root: '/repo',
        productDirectory: 'web',
        verifyFreshness: () => undefined,
      }),
    ).rejects.toThrow(/fixture string failure/);
  } finally {
    String.prototype.match = originalMatch;
  }
});
