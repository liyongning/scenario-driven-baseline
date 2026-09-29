import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

function execute(command: string, args: string[]) {
  return spawnSync(resolve('node_modules/.bin', command), args, { cwd: process.cwd(), encoding: 'utf8' });
}

test('SCN-TEMPLATE-EXAMPLE-008 dependency-violations', { meta: { paymentCase: {
  ownerId: 'SCN-TEMPLATE-EXAMPLE-008', caseId: 'dependency-violations', environment: 'integration', fixtureCase: 'dependency-violations',
  covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-008', caseKey: 'dependency-violations', checks: ['example-core-isolated', 'no-cross-domain-import', 'restored-passes'] }],
} } }, async context => {
  const before = context.expect.getState().assertionCalls;
  const root = process.cwd();
  const temporaryFiles = [
    resolve(root, 'packages/payment-sdk/src/example/core/example-rule-generated.ts'),
    resolve(root, 'packages/payment-sdk/src/example/example-rule-payment.ts'),
    resolve(root, 'packages/payment-sdk/src/core/example-rule-reverse.ts'),
    resolve(root, 'packages/payment-sdk/src/example/core/example-rule-wx.ts'),
  ];
  try {
    writeFileSync(temporaryFiles[0]!, "import { BaseReq } from '@daqian/payment-protocol/generated/idl/base';\nvoid BaseReq;\n");
    const generated = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/example/core/example-rule-generated.ts']);
    expect(generated.status).not.toBe(0);
    expect(generated.stdout + generated.stderr).toContain('example-core-no-generated');
    writeFileSync(temporaryFiles[1]!, "import { createCoreClient } from '../core/client';\nvoid createCoreClient;\n");
    const examplePayment = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/example/example-rule-payment.ts']);
    expect(examplePayment.status).not.toBe(0);
    expect(examplePayment.stdout + examplePayment.stderr).toContain('example-no-payment');
    writeFileSync(temporaryFiles[2]!, "import type { ExampleClient } from '../example/contracts';\nvoid (null as unknown as ExampleClient);\n");
    const paymentExample = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src/core/example-rule-reverse.ts']);
    expect(paymentExample.status).not.toBe(0);
    expect(paymentExample.stdout + paymentExample.stderr).toContain('payment-no-example');
    writeFileSync(temporaryFiles[3]!, 'void wx;\n');
    const wx = execute('eslint', ['packages/payment-sdk/src/example/core/example-rule-wx.ts']);
    expect(wx.status).not.toBe(0);
    expect(wx.stdout + wx.stderr).toContain('no-restricted-globals');
    rmSync(temporaryFiles[0]!);
    rmSync(temporaryFiles[1]!);
    rmSync(temporaryFiles[2]!);
    rmSync(temporaryFiles[3]!);
    const restored = execute('depcruise', ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', 'packages/payment-sdk/src', 'packages/payment-protocol/src']);
    expect(restored.status).toBe(0);
    await context.annotate(JSON.stringify({ assertions: context.expect.getState().assertionCalls - before, checkpoints: ['example-core-isolated', 'no-cross-domain-import', 'restored-passes'] }), 'payment-evidence');
  } finally {
    for (const path of temporaryFiles) rmSync(path, { force: true });
  }
});
