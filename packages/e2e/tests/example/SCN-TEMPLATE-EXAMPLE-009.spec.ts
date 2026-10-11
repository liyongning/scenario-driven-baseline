import { readFileSync } from 'node:fs';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-009',
    caseId: 'shadow-excluded',
    fixtureCase: 'shadow-excluded',
    environment: 'integration',
    covers: [
      { id: 'SCN-TEMPLATE-EXAMPLE-009', caseKey: 'shadow-excluded', checks: ['not-in-product'] },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('not-in-product', () => {
      const packageManifest = readFileSync('packages/sdk/package.json', 'utf8');
      expect(packageManifest).not.toContain('testing/shadow');
      expect(readFileSync('packages/sdk/src/index.ts', 'utf8')).not.toContain('shadow');
    });
  },
  { fixtureRoot },
);
