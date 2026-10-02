import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let temporaryRoot = '';
let consumer = '';

function run(command: string, args: string[], cwd = repositoryRoot) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'example-package-consumer-'));
  const packs = join(temporaryRoot, 'packs'); await mkdir(packs);
  const protocol = resolve(packs, run('pnpm', ['--filter', '@daqian/template-protocol', 'pack', '--pack-destination', packs]).split('\n').at(-1)!);
  const sdk = resolve(packs, run('pnpm', ['--filter', '@daqian/template-sdk', 'pack', '--pack-destination', packs]).split('\n').at(-1)!);
  consumer = join(temporaryRoot, 'consumer'); await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'example-package-consumer', private: true, type: 'module', dependencies: { '@daqian/template-sdk': `file:${sdk}` }, pnpm: { overrides: { '@daqian/template-protocol': `file:${protocol}` } } }));
  run('pnpm', ['install', '--ignore-workspace', '--offline'], consumer);
}, 30_000);

afterAll(async () => { if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true }); });

defineCase({ ownerId: 'SCN-TEMPLATE-EXAMPLE-001', caseId: 'package-consumer', fixtureCase: 'package-consumer', environment: 'integration', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-001', caseKey: 'package-consumer', checks: ['package-consumable'] }] }, async ({ checkpoint, expect }) => {
  const check = `const invalid={runtime:'wechat-miniapp',gatewayBaseUrl:'',getAccessToken:()=>null,catalog:{kind:'fixture',itemId:'sku',itemName:'Fixture',unitValue:100n}};\nif(typeof createExampleClient!=='function'||typeof ExampleConfigurationError!=='function')process.exit(1);\ntry{createExampleClient(invalid);process.exit(2)}catch(error){if(!(error instanceof ExampleConfigurationError))process.exit(3)}\nconsole.log('ok');\n`;
  await writeFile(join(consumer, 'consumer.mjs'), `import {createExampleClient,ExampleConfigurationError} from '@daqian/template-sdk';\n${check}`);
  await writeFile(join(consumer, 'consumer.cjs'), `const {createExampleClient,ExampleConfigurationError}=require('@daqian/template-sdk');\n${check}`);
  await writeFile(join(consumer, 'consumer.ts'), `import {createExampleClient,type ExampleClient,type ExampleClientOptions,type ExampleResourceRef} from '@daqian/template-sdk';\nconst options:ExampleClientOptions={runtime:'wechat-miniapp',gatewayBaseUrl:'https://fixture.invalid',getAccessToken:()=>null,catalog:{kind:'fixture',itemId:'sku',itemName:'Fixture',unitValue:100n}};\nconst client:ExampleClient=createExampleClient(options);const reference:ExampleResourceRef={id:'resource',externalRef:'ref'};void client.observe(reference);`);
  await writeFile(join(consumer, 'consumer.cts'), `import sdk = require('@daqian/template-sdk');\nconst options:sdk.ExampleClientOptions={runtime:'wechat-miniapp',gatewayBaseUrl:'https://fixture.invalid',getAccessToken:()=>null,catalog:{kind:'fixture',itemId:'sku',itemName:'Fixture',unitValue:100n}};\nconst client:sdk.ExampleClient=sdk.createExampleClient(options);void client;`);
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2020' }, include: ['consumer.ts', 'consumer.cts'] }));
  await checkpoint('package-consumable', () => {
    expect(run('node', ['consumer.mjs'], consumer)).toBe('ok');
    expect(run('node', ['consumer.cjs'], consumer)).toBe('ok');
    expect(() => run('pnpm', ['exec', 'tsc', '-p', join(consumer, 'tsconfig.json')], repositoryRoot)).not.toThrow();
  });
}, { fixtureRoot });
