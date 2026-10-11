import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import {
  bundleProductDirectory,
  runBundleCli,
  validBundle,
  writeBundle,
  writeBundleBuild,
} from './bundle-cli-fixture.ts';

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

cliEvidence(
  'SCN-WEB-APP-014',
  'bundle-freshness-cli',
  ['digest-scope', 'ignored-inputs-excluded', 'stale-bundle-reported'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      writeBundleBuild(root.root);
      const manifestPath = join(root.root, 'project.manifest.json');
      const manifestValue = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        fingerprints: { buildInputs: string[] };
      };
      manifestValue.fingerprints.buildInputs = ['.env*', 'pnpm-lock.yaml'];
      writeFileSync(manifestPath, JSON.stringify(manifestValue, null, 2));
      writeFileSync(join(root.root, '.gitignore'), '.env.local\n');
      writeFileSync(join(root.root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      const valid = validBundle(root.root);
      writeBundle(root.root, valid);

      await check('digest-scope', () => {
        const testPath = join(
          root.root,
          `packages/${bundleProductDirectory}/tests/type-check.test.ts`,
        );
        const testSource = readFileSync(testPath, 'utf8');
        writeFileSync(testPath, `${testSource}\n`);
        let result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
        writeFileSync(testPath, testSource);

        const gatePath = join(root.root, 'scripts/check-bundle.ts');
        write(gatePath, 'export const fixture = true;\n');
        result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
        rmSync(gatePath, { force: true });
      });

      await check('ignored-inputs-excluded', () => {
        writeFileSync(join(root.root, '.env.local'), 'TOKEN=fixture\n');
        const result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
        context.expect(result.json?.issues).toEqual([]);
      });

      await check('stale-bundle-reported', () => {
        const productPath = join(root.root, `packages/${bundleProductDirectory}/src/main.ts`);
        const productSource = readFileSync(productPath, 'utf8');
        writeFileSync(productPath, `${productSource}\n`);
        let result = runBundleCli(root);
        context.expect(result.status, result.output).not.toBe(0);
        context.expect(result.output).toContain('stale');
        writeFileSync(productPath, productSource);

        const protocolPath = join(root.root, 'packages/web-protocol/src/index.ts');
        const protocolSource = readFileSync(protocolPath, 'utf8');
        writeFileSync(protocolPath, `${protocolSource}\n`);
        result = runBundleCli(root);
        context.expect(result.status, result.output).not.toBe(0);
        context.expect(result.output).toContain('stale');
        writeFileSync(protocolPath, protocolSource);

        const lockPath = join(root.root, 'pnpm-lock.yaml');
        writeFileSync(lockPath, 'lockfileVersion: 9\nchanged: true\n');
        result = runBundleCli(root);
        context.expect(result.status, result.output).not.toBe(0);
        context.expect(result.output).toContain('stale');
        writeFileSync(lockPath, 'lockfileVersion: 9\n');

        result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
