import { readFile } from 'node:fs/promises';
import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

const runtimeValues: Record<string, unknown> = {
  omitted: undefined, 'explicit-undefined': undefined, sandbox: 'sandbox', prod: 'prod', null: null,
  'number-zero': 0, 'number-one': 1, 'number-two': 2, 'empty-string': '',
  'unspecified-name': 'UNSPECIFIED', 'protocol-enum-name': 'XPAY_ENV_PROD', 'unknown-value': 'future',
};

for (const caseKey of Object.keys(runtimeValues)) {
  const valid = ['omitted', 'explicit-undefined', 'sandbox', 'prod'].includes(caseKey);
  const checks = [valid ? 'valid-runtime-inputs' : 'invalid-runtime-before-effects'];
  defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-022', caseId: `contract-022-${caseKey}`, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CONTRACT-022', caseKey, checks }],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const tradeNo = `${(value as { tradeNo: string }).tradeNo}-${caseKey}`;
    const platform = installPublicClientPlatform({ http: valid ? [
      { path: '/api/base/trade/pay', body: successPrepare(tradeNo) }, { path: '/api/base/trade/query', body: successQuery(tradeNo) },
    ] : [] }); cleanup = platform.restore;
    let providers = 0;
    const { client } = createPublicHarness({ getAccessToken: () => { providers += 1; return 'fixture-token'; } });
    const request: Record<string, unknown> = { reference: { tradeNo }, method: 'wechat-miniapp-virtual-goods' };
    if (caseKey !== 'omitted') request.xpayEnv = runtimeValues[caseKey];
    const outcome = await client.pay(request as never);
    await checkpoint(checks[0]!, () => {
      if (valid) expect(outcome).toMatchObject({ reason: 'confirmed' });
      else {
        expect(outcome).toMatchObject({ reason: 'error', channelSignal: 'not_invoked', error: { code: 'INVALID_INPUT', source: 'sdk' } });
        expect({ providers, http: platform.httpRecords.length, channel: platform.channelRecords.length }).toEqual({ providers: 0, http: 0, channel: 0 });
      }
    });
  }, { fixtureRoot });
}

for (const caseKey of ['typescript-input-surface', 'dual-declaration-xpay-docs'] as const) {
  const check = caseKey === 'typescript-input-surface' ? 'public-type-scope' : 'declaration-docs';
  defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-022', caseId: `contract-022-${caseKey}`, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CONTRACT-022', caseKey, checks: [check] }],
  }, async ({ checkpoint, expect }) => {
    const declarations = await Promise.all(['index.d.ts', 'index.d.cts'].map(file => readFile(new URL(`../../../payment-sdk/dist/${file}`, import.meta.url), 'utf8')));
    await checkpoint(check, () => {
      for (const dts of declarations) {
        expect(dts).toMatch(/type XpayEnv[\s\S]*'sandbox'[\s\S]*'prod'/);
        expect(dts).toMatch(/PaymentRequest[\s\S]*xpayEnv\?: XpayEnv/);
        expect(dts).toContain('请求现网，可能真实扣款');
        expect(dts.match(/xpayEnv\?/g)).toHaveLength(1);
      }
    });
  }, { fixtureRoot });
}
