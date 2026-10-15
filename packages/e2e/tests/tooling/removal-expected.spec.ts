import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { expectedMissingBindings, type InventoryOutput } from './removal-expected.ts';

test('expected bindings include cliEvidence declarations in copy-creating specs', () => {
  const root = mkdtempSync(join(tmpdir(), 'removal-expected-cli-evidence-'));
  const spec = join(root, 'packages/e2e/tests/tooling/SCN-WEB-APP-010.spec.ts');
  try {
    mkdirSync(join(spec, '..'), { recursive: true });
    writeFileSync(
      join(root, 'project.manifest.json'),
      JSON.stringify(
        {
          packages: [
            {
              directory: 'product',
              name: '@scope/product',
              role: 'product',
              form: 'web-app',
              private: true,
              allowedDirectories: ['src'],
            },
            {
              directory: 'protocol',
              name: '@scope/protocol',
              role: 'protocol',
              protocolKind: 'idl',
              private: false,
              allowedDirectories: ['src'],
            },
            {
              directory: 'e2e',
              name: '@scope/e2e',
              role: 'test',
              private: true,
              allowedDirectories: ['src'],
            },
          ],
          bindings: [
            { name: 'product-protocol', product: 'product', protocol: 'protocol', platforms: [] },
          ],
          requiredCommands: ['check:fast'],
          testProjects: [
            { name: 'test-unit', class: 'unit', config: 'package/vitest.config.ts' },
            { name: 'integration', class: 'integration', config: 'package/vitest.config.ts' },
          ],
          fingerprints: {
            sourceRoots: ['packages/product/src'],
            buildInputs: [],
            protocolInputs: ['protocol.lock'],
          },
        },
        null,
        2,
      ),
    );
    mkdirSync(join(root, 'packages/product'), { recursive: true });
    writeFileSync(
      join(root, 'packages/product/package.json'),
      JSON.stringify({ dependencies: { '@scope/protocol': 'workspace:*' } }),
    );
    writeFileSync(
      spec,
      [
        "cliEvidence('SCN-WEB-APP-010', 'vitest-project-config', [], async () => {});",
        "cliEvidence('SCN-WEB-APP-012', 'bundle-manifest-cli', [], async () => {});",
      ].join('\n'),
    );
    const inventory: InventoryOutput = {
      mode: 'inventory',
      issues: [],
      contracts: [],
      flows: [],
      scenarios: [
        {
          id: 'SCN-WEB-APP-010',
          verification: {
            cases: [{ key: 'vitest-project-config', requiredIn: ['integration'] }],
          },
        },
        {
          id: 'SCN-WEB-APP-012',
          verification: {
            cases: [{ key: 'bundle-manifest-cli', requiredIn: ['integration'] }],
          },
        },
      ],
    };

    expect(expectedMissingBindings({ root, env: {}, cleanup: () => undefined }, inventory)).toEqual(
      [
        'SCN-WEB-APP-010/vitest-project-config: missing binding for integration',
        'SCN-WEB-APP-012/bundle-manifest-cli: missing binding for integration',
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
