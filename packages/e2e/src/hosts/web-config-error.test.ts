import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFileSync: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: mocks.readFileSync };
});

import { loadWebConfig } from './web-config.ts';

test('web config wraps non-Error read failures', () => {
  mocks.readFileSync.mockImplementationOnce(() => {
    throw 'fixture read failure';
  });
  expect(() => loadWebConfig('/fixture')).toThrow(/无法读取 .*fixture read failure/);
});
