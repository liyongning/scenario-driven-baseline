import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkPackageArtifacts, runPackageCli } from './check-package.ts';

const protocol = { name: '@daqian/template-protocol', version: '0.1.0', files: ['dist'] };
const sdk = { name: '@daqian/template-sdk', version: '0.2.0', files: ['dist'], dependencies: { '@daqian/template-protocol': '0.1.0' } };

describe('checkPackageArtifacts', () => {
  it('accepts production-only package files and an exact recorded protocol version', () => {
    expect(checkPackageArtifacts({
      sdkManifest: sdk, protocolManifest: protocol,
      sdkFiles: ['package/package.json', 'package/dist/index.js'], protocolFiles: ['package/package.json', 'package/dist/index.js'],
      record: { sdkVersion: '0.2.0', protocolVersion: '0.1.0' },
    }, protocol.name)).toEqual([]);
  });

  it('rejects Shadow leakage, floating dependencies, version drift, and a publishable E2E package', () => {
    expect(checkPackageArtifacts({
      sdkManifest: { ...sdk, dependencies: { '@daqian/template-protocol': 'latest' } }, protocolManifest: protocol,
      sdkFiles: ['package/testing/shadow.js'], protocolFiles: ['package/tests/fixture.json'],
      record: { sdkVersion: '0.1.0', protocolVersion: '0.9.0' }, e2eManifest: { private: false },
    }, protocol.name)).toEqual(expect.arrayContaining([
      expect.stringContaining('test-only path'), expect.stringContaining('must be exact'),
      expect.stringContaining('SDK version does not match'), expect.stringContaining('protocol version does not match'),
      'packages/e2e must remain private',
    ]));
  });

  it('runs controlled input and actual-pack collection branches without changing their results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'package-cli-'));
    const input = join(directory, 'input.json');
    await writeFile(input, JSON.stringify({
      sdkManifest: sdk, protocolManifest: protocol,
      sdkFiles: ['package/dist/index.js'], protocolFiles: ['package/dist/index.js'],
      record: { sdkVersion: '0.2.0', protocolVersion: '0.1.0' },
    }));
    expect(await runPackageCli(['node', 'script', '--input', input])).toMatchObject({ issues: [], exitCode: 0, commands: [] });

    const spawn = vi.fn((command: string, args: ReadonlyArray<string>) => {
      if (command === 'pnpm') {
        const name = args[1]!.endsWith('protocol') ? 'daqian-template-protocol-0.1.0.tgz' : 'daqian-template-sdk-0.2.0.tgz';
        return { status: 0, stdout: `${name}\n`, stderr: '' };
      }
      const isProtocol = args[1]!.includes('protocol');
      if (args[0] === '-tf') return { status: 0, stdout: 'package/package.json\npackage/dist/index.js\n', stderr: '' };
      return { status: 0, stdout: JSON.stringify(isProtocol ? protocol : sdk), stderr: '' };
    });
    expect(await runPackageCli([], process.cwd(), spawn)).toMatchObject({
      sdkVersion: '0.2.0', protocolVersion: '0.1.0', issues: [], exitCode: 0,
      commands: [{ command: expect.stringContaining('@daqian/template-protocol'), exitCode: 0 }, { command: expect.stringContaining('@daqian/template-sdk'), exitCode: 0 }],
    });
  });

  it('propagates pack, list, and manifest failures with their real command diagnostics', async () => {
    const packFailure = vi.fn(() => ({ status: null, stdout: '', stderr: 'pack error' }));
    await expect(runPackageCli([], process.cwd(), packFailure)).rejects.toThrow(/pack failed.*pack error/);

    const listFailure = vi.fn((command: string) => command === 'pnpm'
      ? { status: 0, stdout: 'package.tgz\n', stderr: '' }
      : { status: 1, stdout: '', stderr: 'list error' });
    await expect(runPackageCli([], process.cwd(), listFailure)).rejects.toThrow(/cannot be listed.*list error/);

    const manifestFailure = vi.fn((command: string, args: ReadonlyArray<string>) => {
      if (command === 'pnpm') return { status: 0, stdout: 'package.tgz\n', stderr: '' };
      if (args[0] === '-tf') return { status: 0, stdout: 'package/package.json\n', stderr: '' };
      return { status: 1, stdout: '', stderr: 'manifest error' };
    });
    await expect(runPackageCli([], process.cwd(), manifestFailure)).rejects.toThrow(/no package manifest.*manifest error/);
  });
});
