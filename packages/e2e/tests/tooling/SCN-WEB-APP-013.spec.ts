import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import {
  bundleProductDirectory,
  refreshBundleDigest,
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
  'SCN-WEB-APP-013',
  'bundle-boundary-cli',
  ['test-infra-by-source', 'contract-excluded', 'css-residue-rejected', 'boundary-restorable'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      writeBundleBuild(root.root);
      const valid = validBundle(root.root);
      writeBundle(root.root, valid);

      await check('test-infra-by-source', () => {
        for (const source of [
          'packages/sample-test/src/leaked.ts',
          'packages/web-protocol/testing/adapter.ts',
          'packages/sample-test/tests/fixtures/leaked.ts',
        ]) {
          writeBundle(root.root, {
            ...valid,
            modules: [
              ...valid.modules,
              { source, dependency: false, outputs: ['assets/index.js'] },
            ],
          });
          const result = runBundleCli(root);
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain(source);
        }

        const shadow = `packages/${bundleProductDirectory}/src/features/shadow/Card.vue`;
        const shadowPath = join(root.root, shadow);
        write(shadowPath, '<template><p>shadow</p></template>\n');
        const withShadow = refreshBundleDigest(root.root, {
          ...valid,
          modules: [
            ...valid.modules,
            { source: shadow, dependency: false, outputs: ['assets/index.js'] },
          ],
        });
        writeBundle(root.root, withShadow);
        try {
          const result = runBundleCli(root);
          context.expect(result.status, result.output).toBe(0);
          context.expect(result.json?.issues).toEqual([]);
        } finally {
          rmSync(shadowPath, { force: true });
        }
      });

      await check('contract-excluded', () => {
        const bundlePath = join(root.root, 'packages/web-protocol/testing/contract.bundle.json');
        write(bundlePath, '{}\n');
        try {
          const bundle = refreshBundleDigest(root.root, {
            ...valid,
            modules: [
              ...valid.modules,
              {
                source: 'packages/web-protocol/testing/contract.bundle.json',
                dependency: false,
                outputs: ['assets/index.js'],
              },
            ],
          });
          writeBundle(root.root, bundle);
          const result = runBundleCli(root);
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('protocol contract');
        } finally {
          rmSync(bundlePath, { force: true });
        }

        const manifestPath = join(root.root, 'project.manifest.json');
        const originalManifest = readFileSync(manifestPath, 'utf8');
        const contractPath = join(root.root, 'packages/web-protocol/contracts/api.yaml');
        const lockPath = join(root.root, 'packages/web-protocol/contracts/api.lock.json');
        write(contractPath, 'openapi: 3.1.0\n');
        write(lockPath, '{}\n');
        const contractManifest = JSON.parse(originalManifest) as {
          packages: Array<Record<string, unknown>>;
          fingerprints: { protocolInputs: string[] };
        };
        const protocol = contractManifest.packages.find(
          (item) => item.directory === 'web-protocol',
        )!;
        protocol.protocolKind = 'openapi';
        protocol.contract = {
          file: 'packages/web-protocol/contracts/api.yaml',
          lock: 'packages/web-protocol/contracts/api.lock.json',
        };
        contractManifest.fingerprints.protocolInputs.push(
          'packages/web-protocol/contracts/api.yaml',
          'packages/web-protocol/contracts/api.lock.json',
        );
        writeFileSync(manifestPath, JSON.stringify(contractManifest, null, 2));
        try {
          const contract = refreshBundleDigest(root.root, {
            ...valid,
            modules: [
              ...valid.modules,
              {
                source: 'packages/web-protocol/contracts/api.yaml',
                dependency: false,
                outputs: ['assets/index.js'],
              },
            ],
          });
          writeBundle(root.root, contract);
          const result = runBundleCli(root);
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain('protocol contract');
        } finally {
          writeFileSync(manifestPath, originalManifest);
          rmSync(contractPath, { force: true });
          rmSync(lockPath, { force: true });
          writeBundle(root.root, valid);
        }
      });

      await check('css-residue-rejected', () => {
        for (const residue of [':deep(', ':slotted(', ':global(']) {
          writeBundleBuild(root.root, { css: `${residue}.x) {}\n` });
          const cssPath = join(
            root.root,
            `packages/${bundleProductDirectory}/dist/assets/index.css`,
          );
          const css = readFileSync(cssPath);
          writeBundle(root.root, {
            ...valid,
            outputs: valid.outputs.map((output) =>
              output.file === 'assets/index.css'
                ? {
                    ...output,
                    sha256: createHash('sha256').update(css).digest('hex'),
                  }
                : output,
            ),
          });
          const result = runBundleCli(root);
          context.expect(result.status, result.output).not.toBe(0);
          context.expect(result.output).toContain(residue);
        }
      });

      await check('boundary-restorable', () => {
        writeBundleBuild(root.root);
        writeBundle(root.root, valid);
        const result = runBundleCli(root);
        context.expect(result.status, result.output).toBe(0);
        context.expect(result.json?.issues).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
