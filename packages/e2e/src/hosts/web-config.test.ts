import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'vitest';
import { loadWebConfig } from './web-config.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeConfig(value: unknown) {
  const root = mkdtempSync(join(tmpdir(), 'web-config-'));
  roots.push(root);
  writeFileSync(join(root, 'web.config.json'), JSON.stringify(value));
  return root;
}

const valid = {
  placeholderAssets: [
    {
      host: 'assets.template.invalid',
      path: '/fixture.svg',
      file: 'packages/e2e/host/browser/fixture-image.svg',
      contentType: 'image/svg+xml',
    },
  ],
};

test(
  'SCN-BROWSER-PLATFORM-016 web-config-loader',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-016',
        caseId: 'web-config-loader',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-016',
            caseKey: 'web-config-loader',
            checks: ['config-schema-valid', 'config-violation-located'],
          },
        ],
      },
    },
  },
  async (context) => {
    const validRoot = writeConfig(valid);
    context.expect(loadWebConfig(validRoot).placeholderAssets).toEqual(valid.placeholderAssets);

    const missing = writeConfig({});
    context.expect(() => loadWebConfig(missing)).toThrow(/placeholderAssets/);
    const extra = writeConfig({ ...valid, unexpected: true });
    context.expect(() => loadWebConfig(extra)).toThrow(/unexpected/);
    context.expect(() => loadWebConfig(join(missing, 'does-not-exist'))).toThrow(/无法读取/);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['config-schema-valid', 'config-violation-located'],
      }),
      'scenario-evidence',
    );
  },
);
