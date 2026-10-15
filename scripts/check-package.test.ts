import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createControlledRoot } from '../packages/e2e/tests/tooling/controlled-root.ts';
import { baseManifest } from '../packages/e2e/tests/tooling/project-manifest-fixture.ts';
import {
  packagesByRole,
  packageByDirectory,
  type ProjectManifest,
} from './lib/project-manifest.ts';
import { checkPackageArtifacts, runPackageCli } from './check-package.ts';

const repositoryManifest = baseManifest() as ProjectManifest;
const repositoryProduct = packagesByRole(repositoryManifest, 'product').find(
  (item) => item.form === 'sdk',
)!;
const repositoryProtocol = packageByDirectory(
  repositoryManifest,
  repositoryManifest.bindings.find((item) => item.product === repositoryProduct.directory)!
    .protocol,
);
/** 门禁逻辑自测的受控根：清单是模板契约输入，测试包清单用测试输入补齐，不读取仓库实时状态。 */
const packageRoot = createControlledRoot({
  manifest: repositoryManifest,
  prefix: 'package-cli-root-',
});
afterAll(() => packageRoot.cleanup());

const protocol = { name: repositoryProtocol.name, version: '0.1.0', files: ['dist'] };
const sdk = {
  name: repositoryProduct.name,
  version: '0.2.0',
  files: ['dist'],
  dependencies: { [repositoryProtocol.name]: '0.1.0' },
};

describe('checkPackageArtifacts', () => {
  it('accepts production-only package files and an exact recorded protocol version', () => {
    expect(
      checkPackageArtifacts(
        {
          sdkManifest: sdk,
          protocolManifest: protocol,
          sdkFiles: ['package/package.json', 'package/dist/index.js'],
          protocolFiles: ['package/package.json', 'package/dist/index.js'],
          record: { sdkVersion: '0.2.0', protocolVersion: '0.1.0' },
        },
        protocol.name,
      ),
    ).toEqual([]);
  });

  it('rejects Shadow leakage, floating dependencies, version drift, and a publishable E2E package', () => {
    expect(
      checkPackageArtifacts(
        {
          sdkManifest: { ...sdk, dependencies: { '@daqian/template-protocol': 'latest' } },
          protocolManifest: protocol,
          sdkFiles: ['package/testing/shadow.js'],
          protocolFiles: ['package/tests/fixture.json'],
          record: { sdkVersion: '0.1.0', protocolVersion: '0.9.0' },
          e2eManifest: { private: false },
        },
        protocol.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('test-only path'),
        expect.stringContaining('must be exact'),
        expect.stringContaining('SDK version does not match'),
        expect.stringContaining('protocol version does not match'),
        'packages/e2e must remain private',
      ]),
    );
  });

  it('runs controlled input and actual-pack collection branches without changing their results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'package-cli-'));
    const input = join(directory, 'input.json');
    await writeFile(
      input,
      JSON.stringify({
        sdkManifest: sdk,
        protocolManifest: protocol,
        sdkFiles: ['package/dist/index.js'],
        protocolFiles: ['package/dist/index.js'],
        record: { sdkVersion: '0.2.0', protocolVersion: '0.1.0' },
      }),
    );
    expect(
      await runPackageCli(['node', 'script', '--input', input], packageRoot.root),
    ).toMatchObject({
      issues: [],
      exitCode: 0,
      commands: [],
    });

    const spawn = vi.fn((command: string, args: ReadonlyArray<string>) => {
      if (command === 'pnpm') {
        const name =
          args[1] === repositoryProtocol.name
            ? `${repositoryProtocol.name.replace(/^@/, '').replace('/', '-')}-0.1.0.tgz`
            : `${repositoryProduct.name.replace(/^@/, '').replace('/', '-')}-0.2.0.tgz`;
        return { status: 0, stdout: `${name}\n`, stderr: '' };
      }
      const isProtocol = args[1]!.includes(repositoryProtocol.directory);
      if (args[0] === '-tf')
        return { status: 0, stdout: 'package/package.json\npackage/dist/index.js\n', stderr: '' };
      return { status: 0, stdout: JSON.stringify(isProtocol ? protocol : sdk), stderr: '' };
    });
    expect(await runPackageCli([], packageRoot.root, spawn)).toMatchObject({
      sdkVersion: '0.2.0',
      protocolVersion: '0.1.0',
      issues: [],
      exitCode: 0,
      commands: [
        { command: expect.stringContaining(repositoryProtocol.name), exitCode: 0 },
        { command: expect.stringContaining(repositoryProduct.name), exitCode: 0 },
      ],
    });
  });

  it('propagates pack, list, and manifest failures with their real command diagnostics', async () => {
    const packFailure = vi.fn(() => ({ status: null, stdout: '', stderr: 'pack error' }));
    await expect(runPackageCli([], packageRoot.root, packFailure)).rejects.toThrow(
      /pack failed.*pack error/,
    );

    const listFailure = vi.fn((command: string) =>
      command === 'pnpm'
        ? { status: 0, stdout: 'package.tgz\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'list error' },
    );
    await expect(runPackageCli([], packageRoot.root, listFailure)).rejects.toThrow(
      /cannot be listed.*list error/,
    );

    const manifestFailure = vi.fn((command: string, args: ReadonlyArray<string>) => {
      if (command === 'pnpm') return { status: 0, stdout: 'package.tgz\n', stderr: '' };
      if (args[0] === '-tf') return { status: 0, stdout: 'package/package.json\n', stderr: '' };
      return { status: 1, stdout: '', stderr: 'manifest error' };
    });
    await expect(runPackageCli([], packageRoot.root, manifestFailure)).rejects.toThrow(
      /no package manifest.*manifest error/,
    );
  });
});
