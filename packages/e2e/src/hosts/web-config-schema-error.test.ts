import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock('ajv/dist/2020.js', () => ({
  default: class {
    compile() {
      return mocks.validate;
    }
  },
}));

import { loadWebConfig } from './web-config.ts';

test('web config tolerates validators without collected errors or messages', () => {
  const root = mkdtempSync(join(tmpdir(), 'web-config-validator-'));
  try {
    writeFileSync(join(root, 'web.config.json'), '{"placeholderAssets":[]}\n');
    mocks.validate.mockReturnValue(false);
    Object.assign(mocks.validate, { errors: undefined });
    expect(() => loadWebConfig(root)).toThrow(/不符合 schema/);

    Object.assign(mocks.validate, {
      errors: [{ instancePath: '', params: {}, message: undefined }],
    });
    expect(() => loadWebConfig(root)).toThrow(/不符合 schema/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
