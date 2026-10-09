import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { loadProjectManifest, packageByRole } from '../../../../scripts/lib/project-manifest.ts';
import { discoverEntryExports } from './public-doc.ts';
import { buildCopyInputs, createBuildCopy, type RepositoryCopy } from './repository-copy.ts';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
type PackedManifest = Readonly<{ version: string; dependencies: Readonly<Record<string, string>> }>;
type PackageState = Readonly<{
  root: string;
  copy: RepositoryCopy;
  sdkConsumer: string;
  protocolConsumer: string;
  sdkTar: string;
  protocolTar: string;
  sdkFiles: string[];
  protocolFiles: string[];
  sdkManifest: PackedManifest;
}>;
const manifest = loadProjectManifest(root);
const productPackage = packageByRole(manifest, 'product');
const protocolPackage = packageByRole(manifest, 'protocol');
let state: PackageState;

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

beforeAll(async () => {
  // 临时构建根由清单登记输入复制而来，不维护写死的文件清单（ENG-01）。
  const copy = createBuildCopy({ source: root, prefix: 'template-engineering-consumer-' });
  const directory = join(copy.root, 'consumers');
  const packDir = join(copy.root, 'packs');
  await mkdir(directory, { recursive: true });
  await mkdir(packDir, { recursive: true });
  run('pnpm', ['--filter', protocolPackage.name, 'build'], copy.root);
  run('pnpm', ['--filter', productPackage.name, 'build'], copy.root);
  const protocolTar = resolve(
    packDir,
    run(
      'pnpm',
      ['--filter', protocolPackage.name, 'pack', '--pack-destination', packDir],
      copy.root,
    )
      .split('\n')
      .at(-1)!,
  );
  const sdkTar = resolve(
    packDir,
    run('pnpm', ['--filter', productPackage.name, 'pack', '--pack-destination', packDir], copy.root)
      .split('\n')
      .at(-1)!,
  );
  async function install(
    name: string,
    dependency: string,
    tarball: string,
    overrideName?: string,
    overrideTar?: string,
  ) {
    const cwd = join(directory, name);
    await mkdir(cwd);
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        name,
        private: true,
        type: 'module',
        dependencies: { [dependency]: `file:${tarball}` },
        ...(overrideName ? { pnpm: { overrides: { [overrideName]: `file:${overrideTar}` } } } : {}),
      }),
    );
    run('pnpm', ['install', '--ignore-workspace'], cwd);
    return cwd;
  }
  const sdkConsumer = await install(
    'sdk-only-consumer',
    productPackage.name,
    sdkTar,
    protocolPackage.name,
    protocolTar,
  );
  const protocolConsumer = await install('protocol-consumer', protocolPackage.name, protocolTar);
  const sdkManifest = JSON.parse(run('tar', ['-xOf', sdkTar, 'package/package.json']));
  state = {
    root: directory,
    copy,
    sdkConsumer,
    protocolConsumer,
    sdkTar,
    protocolTar,
    sdkFiles: run('tar', ['-tf', sdkTar]).split('\n'),
    protocolFiles: run('tar', ['-tf', protocolTar]).split('\n'),
    sdkManifest,
  };
}, 120_000);

afterAll(() => state?.copy.cleanup());

const caseChecks: Record<string, string[]> = {
  'protocol-network-esm-consumer': ['protocol-network-export'],
  'protocol-network-commonjs-consumer': ['protocol-network-export'],
  'protocol-network-types-consumer': ['protocol-network-export'],
  'sdk-does-not-reexport-network': ['sdk-export-boundary', 'sdk-exports-from-entry'],
  'sdk-only-consumer': ['dependency-release-contract'],
  'package-boundaries': [
    'production-package-clean',
    'source-and-graph-current',
    'build-copy-by-manifest',
  ],
};

for (const [caseKey, checks] of Object.entries(caseChecks))
  defineCase(
    {
      ownerId: 'SCN-TEMPLATE-ENGINEERING-001',
      caseId: caseKey,
      fixtureCase: caseKey,
      environment: 'integration',
      covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-001', caseKey, checks }],
    },
    async ({ fixture: value, checkpoint, expect }) => {
      const fixture = value as {
        sdkVersion: string;
        protocolVersion: string;
        sdkExports: string[];
        protocolExport: string;
      };
      if (caseKey.endsWith('esm-consumer')) {
        const cwd = state.protocolConsumer;
        await writeFile(
          join(cwd, 'consumer.mjs'),
          `import * as subject from '${protocolPackage.name}'; console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`,
        );
        const exports = JSON.parse(run('node', ['consumer.mjs'], cwd)) as string[];
        await checkpoint(checks[0]!, () => expect(exports).toContain(fixture.protocolExport));
      } else if (caseKey.endsWith('commonjs-consumer')) {
        const cwd = state.protocolConsumer;
        await writeFile(
          join(cwd, 'consumer.cjs'),
          `const subject=require('${protocolPackage.name}'); console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`,
        );
        const exports = JSON.parse(run('node', ['consumer.cjs'], cwd)) as string[];
        await checkpoint(checks[0]!, () => expect(exports).toContain(fixture.protocolExport));
      } else if (caseKey.endsWith('types-consumer')) {
        const cwd = state.protocolConsumer;
        await writeFile(
          join(cwd, 'consumer.ts'),
          `import {createWechatMiniappHttp, type HttpPort} from '${protocolPackage.name}'; const value: HttpPort=createWechatMiniappHttp(); void value;`,
        );
        await writeFile(
          join(cwd, 'consumer.cts'),
          `import subject = require('${protocolPackage.name}'); void subject.createWechatMiniappHttp;`,
        );
        await writeFile(
          join(cwd, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: true,
              noEmit: true,
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              target: 'ES2020',
            },
            include: ['consumer.ts', 'consumer.cts'],
          }),
        );
        await checkpoint(checks[0]!, () =>
          expect(() =>
            run('pnpm', ['exec', 'tsc', '-p', join(cwd, 'tsconfig.json')], root),
          ).not.toThrow(),
        );
      } else if (caseKey === 'sdk-does-not-reexport-network') {
        const esm = await import(productPackage.name);
        await checkpoint('sdk-export-boundary', () =>
          expect(esm).not.toHaveProperty('createWechatMiniappHttp'),
        );
        // 期望导出集合由产品包根入口的实际导出计算，不在 Fixture 或测试里写死示例导出名。
        await checkpoint('sdk-exports-from-entry', () => {
          const entry = resolve(root, 'packages', productPackage.directory, 'src/index.ts');
          const expected = discoverEntryExports({ root, entry }).values;
          expect([...expected].sort()).toEqual(Object.keys(esm).sort());
        });
      } else if (caseKey === 'sdk-only-consumer') {
        const consumerManifest = JSON.parse(
          await readFile(join(state.sdkConsumer, 'package.json'), 'utf8'),
        );
        await checkpoint('dependency-release-contract', () => {
          expect(Object.keys(consumerManifest.dependencies)).toEqual([productPackage.name]);
          expect(state.sdkManifest.dependencies[protocolPackage.name]).toBe(
            fixture.protocolVersion,
          );
        });
      } else {
        await checkpoint('production-package-clean', () =>
          expect(
            [...state.sdkFiles, ...state.protocolFiles].every(
              (file) => !/(testing|fixtures|e2e)/.test(file),
            ),
          ).toBe(true),
        );
        await checkpoint('source-and-graph-current', () =>
          expect(state.sdkManifest.version).toBe(fixture.sdkVersion),
        );
        await checkpoint('build-copy-by-manifest', () => {
          const inputs = buildCopyInputs(root, manifest);
          // 清单声明的源码目录整体纳入复制输入。
          for (const sourceRoot of manifest.fingerprints.sourceRoots)
            expect(inputs.some((path) => path.startsWith(`${sourceRoot}/`))).toBe(true);
          // 各包 package.json 与 tsconfig 按清单纳入，未声明的目录不复制。
          for (const pkg of manifest.packages)
            expect(inputs).toContain(`packages/${pkg.directory}/package.json`);
          expect(inputs.some((path) => path.startsWith('openspec/'))).toBe(false);
          // 清单新增构建输入后，无需修改测试即可纳入复制输入。
          const augmented = {
            ...manifest,
            fingerprints: {
              ...manifest.fingerprints,
              buildInputs: [
                ...manifest.fingerprints.buildInputs,
                'openspec/changes/template-core-hardening/tasks.md',
              ],
            },
          };
          expect(buildCopyInputs(root, augmented)).toContain(
            'openspec/changes/template-core-hardening/tasks.md',
          );
        });
      }
    },
    { fixtureRoot },
  );
