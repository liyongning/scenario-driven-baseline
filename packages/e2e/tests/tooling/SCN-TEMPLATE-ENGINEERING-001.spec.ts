import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
type PackedManifest = Readonly<{ version: string; dependencies: Readonly<Record<string, string>> }>;
type PackageState = Readonly<{ root: string; sdkConsumer: string; protocolConsumer: string; sdkTar: string; protocolTar: string; sdkFiles: string[]; protocolFiles: string[]; sdkManifest: PackedManifest }>;
let state: PackageState;

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'payment-template-engineering-consumer-'));
  const packDir = join(directory, 'packs');
  await mkdir(packDir);
  const protocolTar = resolve(packDir, run('pnpm', ['--filter', '@daqian/template-protocol', 'pack', '--pack-destination', packDir]).split('\n').at(-1)!);
  const sdkTar = resolve(packDir, run('pnpm', ['--filter', '@daqian/template-sdk', 'pack', '--pack-destination', packDir]).split('\n').at(-1)!);
  async function install(name: string, dependency: string, tarball: string, overrideName?: string, overrideTar?: string) {
    const cwd = join(directory, name); await mkdir(cwd);
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name, private: true, type: 'module', dependencies: { [dependency]: `file:${tarball}` },
      ...(overrideName ? { pnpm: { overrides: { [overrideName]: `file:${overrideTar}` } } } : {}) }));
    run('pnpm', ['install', '--ignore-workspace'], cwd);
    return cwd;
  }
  const sdkConsumer = await install('sdk-only-consumer', '@daqian/template-sdk', sdkTar, '@daqian/template-protocol', protocolTar);
  const protocolConsumer = await install('protocol-consumer', '@daqian/template-protocol', protocolTar);
  const sdkManifest = JSON.parse(run('tar', ['-xOf', sdkTar, 'package/package.json']));
  state = { root: directory, sdkConsumer, protocolConsumer, sdkTar, protocolTar,
    sdkFiles: run('tar', ['-tf', sdkTar]).split('\n'), protocolFiles: run('tar', ['-tf', protocolTar]).split('\n'), sdkManifest };
}, 30_000);

afterAll(async () => { if (state) await rm(state.root, { recursive: true, force: true }); });

const caseChecks: Record<string, string[]> = {
  'protocol-network-esm-consumer': ['protocol-network-export'],
  'protocol-network-commonjs-consumer': ['protocol-network-export'],
  'protocol-network-types-consumer': ['protocol-network-export'],
  'sdk-does-not-reexport-network': ['sdk-export-boundary'],
  'sdk-only-consumer': ['dependency-release-contract'],
  'package-boundaries': ['production-package-clean', 'source-and-graph-current'],
};

for (const [caseKey, checks] of Object.entries(caseChecks)) defineCase({
  ownerId: 'SCN-TEMPLATE-ENGINEERING-001', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-001', caseKey, checks }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as { sdkVersion: string; protocolVersion: string; sdkExports: string[]; protocolExport: string };
  if (caseKey.endsWith('esm-consumer')) {
    const cwd = state.protocolConsumer;
    await writeFile(join(cwd, 'consumer.mjs'), `import * as subject from '@daqian/template-protocol'; console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`);
    const exports = JSON.parse(run('node', ['consumer.mjs'], cwd)) as string[];
    await checkpoint(checks[0]!, () => expect(exports).toContain(fixture.protocolExport));
  } else if (caseKey.endsWith('commonjs-consumer')) {
    const cwd = state.protocolConsumer;
    await writeFile(join(cwd, 'consumer.cjs'), `const subject=require('@daqian/template-protocol'); console.log(JSON.stringify(Object.keys(subject).sort())); subject.createWechatMiniappHttp();`);
    const exports = JSON.parse(run('node', ['consumer.cjs'], cwd)) as string[];
    await checkpoint(checks[0]!, () => expect(exports).toContain(fixture.protocolExport));
  } else if (caseKey.endsWith('types-consumer')) {
    const cwd = state.protocolConsumer;
    await writeFile(join(cwd, 'consumer.ts'), `import {createWechatMiniappHttp, type HttpPort} from '@daqian/template-protocol'; const value: HttpPort=createWechatMiniappHttp(); void value;`);
    await writeFile(join(cwd, 'consumer.cts'), `import subject = require('@daqian/template-protocol'); void subject.createWechatMiniappHttp;`);
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2020' }, include: ['consumer.ts', 'consumer.cts'] }));
    await checkpoint(checks[0]!, () => expect(() => run('pnpm', ['exec', 'tsc', '-p', join(cwd, 'tsconfig.json')], root)).not.toThrow());
  } else if (caseKey === 'sdk-does-not-reexport-network') {
    const esm = await import('@daqian/template-sdk');
    await checkpoint('sdk-export-boundary', () => expect(esm).not.toHaveProperty('createWechatMiniappHttp'));
  } else if (caseKey === 'sdk-only-consumer') {
    const consumerManifest = JSON.parse(await readFile(join(state.sdkConsumer, 'package.json'), 'utf8'));
    await checkpoint('dependency-release-contract', () => {
      expect(Object.keys(consumerManifest.dependencies)).toEqual(['@daqian/template-sdk']);
      expect(state.sdkManifest.dependencies['@daqian/template-protocol']).toBe(fixture.protocolVersion);
    });
  } else {
    await checkpoint('production-package-clean', () => expect([...state.sdkFiles, ...state.protocolFiles].every(file => !/(testing|fixtures|e2e)/.test(file))).toBe(true));
    await checkpoint('source-and-graph-current', () => expect(state.sdkManifest.version).toBe(fixture.sdkVersion));
  }
}, { fixtureRoot });
