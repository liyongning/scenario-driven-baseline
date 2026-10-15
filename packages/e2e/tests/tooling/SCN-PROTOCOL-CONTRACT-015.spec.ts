import { createHash } from 'node:crypto';
import { exampleInventoryRoot } from './contract-inventory-fixture.ts';
import { cliEvidence, runGate, writeSpec } from './scenario-gate-helpers.ts';

const spec = [
  '### Requirement: PC-07 IDL adapter migration',
  '#### Scenario: SCN-PROTOCOL-CONTRACT-015 IDL adapter regression',
  '```json verification',
  JSON.stringify({
    formatVersion: 2,
    checkpoints: { unchanged: 'IDL 适配器迁移后义务不变' },
    cases: [
      {
        key: 'idl-adapter-inventory-cli',
        kind: 'engineering',
        requiredIn: ['integration'],
        checks: ['unchanged'],
      },
    ],
    blockedBy: [],
  }),
  '```',
].join('\n');

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-015',
  'idl-adapter-inventory-cli',
  ['obligations-unchanged'],
  async (context, check) => {
    const root = exampleInventoryRoot('idl-adapter-inventory-cli-');
    try {
      writeSpec(root.root, spec);
      const result = runGate(root.root, ['--inventory']);
      const contracts = (
        result.output as
          | Readonly<{
              contracts?: ReadonlyArray<{
                id: string;
                cases: string[];
                requiredIn: string[];
              }>;
            }>
          | undefined
      )?.contracts;

      await check('obligations-unchanged', () => {
        const normalized = (contracts ?? [])
          .map(({ id, cases, requiredIn }) => ({ id, cases, requiredIn }))
          .sort((left, right) => left.id.localeCompare(right.id));
        context.expect(normalized).toHaveLength(177);
        context
          .expect(createHash('sha256').update(JSON.stringify(normalized)).digest('hex'))
          .toBe('46417e0f18bb012791eca67959ed6d4bab2ca0711ff952966f5f4a0f34638eca');
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 30_000 },
);
