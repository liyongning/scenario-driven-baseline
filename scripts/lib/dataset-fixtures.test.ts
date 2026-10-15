import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createAdapterFixture } from '../../packages/e2e/tests/tooling/protocol-adapter-fixture.ts';
import { checkDatasets } from './dataset-fixtures.ts';

test('dataset adapter failures preserve non-Error messages', async () => {
  const fixture = createAdapterFixture({ prefix: 'dataset-adapter-string-error-' });
  try {
    const directory = join(fixture.root, 'packages/e2e/tests/fixtures/_datasets/preview');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        protocol: 'protocol-a',
        description: 'preview',
        entries: [],
      }),
    );
    const issues: string[] = [];
    await checkDatasets({
      fixtureRoot: join(fixture.root, 'packages/e2e/tests/fixtures'),
      protocols: new Set(['protocol-a']),
      validate: (() => true) as never,
      ajv: { errorsText: () => '' } as never,
      adapterFor: async () => {
        throw 'string adapter failure';
      },
      issues,
    });
    expect(issues).toEqual(['preview: protocol adapter protocol-a failed: string adapter failure']);
  } finally {
    fixture.cleanup();
  }
});
