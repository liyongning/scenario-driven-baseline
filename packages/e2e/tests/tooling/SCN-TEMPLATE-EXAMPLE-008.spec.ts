import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';

function execute(command: string, args: string[]) {
  return spawnSync(resolve('node_modules/.bin', command), args, { cwd: process.cwd(), encoding: 'utf8' });
}

test('SCN-TEMPLATE-EXAMPLE-008 dependency-violations', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-008', caseId: 'dependency-violations', environment: 'integration', fixtureCase: 'dependency-violations',
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-008', caseKey: 'dependency-violations', checks: ['example-core-isolated', 'no-cross-domain-import', 'restored-passes'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const root = process.cwd();
  const sampleDomain = resolve(root, 'packages/payment-sdk/src/sample-domain');
  const temporaryFiles = [
    resolve(root, 'packages/payment-sdk/src/example/core/example-rule-generated.ts'),
    resolve(sampleDomain, 'contracts.ts'),
    resolve(sampleDomain, 'example-rule-cross.ts'),
    resolve(root, 'packages/payment-sdk/src/example/example-rule-cross.ts'),
    resolve(root, 'packages/payment-sdk/src/example/core/example-rule-wx.ts'),
  ];
  try {
    writeFileSync(temporaryFiles[0]!, "import { BaseReq } from '@daqian/payment-protocol/generated/idl/base';\nvoid BaseReq;\n");
    const generated = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/example/core/example-rule-generated.ts']);
    context.expect(generated.status).not.toBe(0);
    context.expect(generated.stdout + generated.stderr).toContain('example-core-no-generated');
    mkdirSync(sampleDomain, { recursive: true });
    writeFileSync(temporaryFiles[1]!, 'export type SampleThing = { value: string };\n');
    writeFileSync(temporaryFiles[2]!, "import type { ExampleClient } from '../example/contracts';\nvoid (null as unknown as ExampleClient);\n");
    const sampleToExample = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/sample-domain/example-rule-cross.ts']);
    context.expect(sampleToExample.status).not.toBe(0);
    context.expect(sampleToExample.stdout + sampleToExample.stderr).toContain('domain-isolation');
    writeFileSync(temporaryFiles[3]!, "import type { SampleThing } from '../sample-domain/contracts';\nvoid (null as unknown as SampleThing);\n");
    const exampleToSample = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/example/example-rule-cross.ts']);
    context.expect(exampleToSample.status).not.toBe(0);
    context.expect(exampleToSample.stdout + exampleToSample.stderr).toContain('domain-isolation');
    writeFileSync(temporaryFiles[4]!, 'void wx;\n');
    const wx = execute('eslint', ['packages/payment-sdk/src/example/core/example-rule-wx.ts']);
    context.expect(wx.status).not.toBe(0);
    context.expect(wx.stdout + wx.stderr).toContain('no-restricted-globals');
    for (const path of temporaryFiles) rmSync(path, { force: true });
    rmSync(sampleDomain, { recursive: true, force: true });
    const restored = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src', 'packages/payment-protocol/src']);
    context.expect(restored.status).toBe(0);
    await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: ['example-core-isolated', 'no-cross-domain-import', 'restored-passes'] }), 'payment-evidence');
  } finally {
    for (const path of temporaryFiles) rmSync(path, { force: true });
    rmSync(sampleDomain, { recursive: true, force: true });
  }
});
