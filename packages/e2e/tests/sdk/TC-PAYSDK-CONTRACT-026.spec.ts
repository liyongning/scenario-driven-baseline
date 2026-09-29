import { readFile } from 'node:fs/promises';
import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { createPublicHarness, installPublicClientPlatform, successPrepare, successQuery } from './public-client-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function errorResponse(code: string) {
  return { baseResp: { statusCode: code, success: false, statusMsg: 'fixture error', error: {
    bizCode: code, canonicalCode: 'CANONICAL_ERROR_CODE_UNAVAILABLE', retryable: true,
  } } };
}

type Fixture = Readonly<{ tradeNo: string; queryError?: string; prepareError?: string; knownError?: string; unknownError?: string }>;

function expectPublicError(expect: typeof import('vitest')['expect'], error: unknown, originalCode: string) {
  expect(error).toEqual({ code: 'SERVER_ERROR', message: '支付服务处理失败', originalCode, retryable: true, source: 'gateway' });
  expect(Object.keys(error as object).sort()).toEqual(['code', 'message', 'originalCode', 'retryable', 'source']);
}

for (const caseKey of ['known-unavailable-then-paid', 'unknown-retryable-ends', 'other-method-error-ends', 'prepare-no-replay', 'query-public-projection'] as const) {
  const checks = caseKey === 'known-unavailable-then-paid' ? ['known-retry', 'public-shape']
    : caseKey === 'prepare-no-replay' || caseKey === 'query-public-projection' ? ['no-replay', 'public-shape']
      : ['unclassified-stops', 'public-shape'];
  defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-026', caseId: caseKey, fixtureCase: caseKey, environment: 'integration',
    covers: [{ id: 'TC-PAYSDK-CONTRACT-026', caseKey, checks }],
  }, async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as Fixture;
    if (caseKey === 'query-public-projection') {
      const platform = installPublicClientPlatform({ http: [
        { path: '/api/base/trade/query', body: errorResponse(fixture.knownError!) },
        { path: '/api/base/trade/query', body: errorResponse(fixture.unknownError!) },
      ] }); cleanup = platform.restore;
      const { client } = createPublicHarness();
      const results = await Promise.all([client.query({ tradeNo: fixture.tradeNo }), client.query({ tradeNo: `${fixture.tradeNo}-unknown` })]);
      await checkpoint('no-replay', () => expect(platform.httpRecords).toHaveLength(2));
      await checkpoint('public-shape', () => {
        expect(results.every(result => !result.ok && Object.keys(result).sort().join(',') === 'error,ok' && !Object.prototype.hasOwnProperty.call(result, 'cause'))).toBe(true);
        if (!results[0]!.ok) expectPublicError(expect, results[0]!.error, fixture.knownError!);
        if (!results[1]!.ok) expectPublicError(expect, results[1]!.error, fixture.unknownError!);
      });
      return;
    }
    const http = caseKey === 'prepare-no-replay'
      ? [{ path: '/api/base/trade/pay' as const, body: errorResponse(fixture.prepareError!) }]
      : [
        { path: '/api/base/trade/pay' as const, body: successPrepare(fixture.tradeNo) },
        { path: '/api/base/trade/query' as const, body: errorResponse(fixture.queryError!) },
        ...caseKey === 'known-unavailable-then-paid' ? [{ path: '/api/base/trade/query' as const, body: successQuery(fixture.tradeNo) }] : [],
      ];
    const platform = installPublicClientPlatform({ http }); cleanup = platform.restore;
    const { pay } = createPublicHarness({ policy: { requestTimeoutMs: 1000, observation: { intervalMs: 1, maxWaitMs: 1000 } } });
    const outcome = await pay({ reference: { tradeNo: fixture.tradeNo }, method: 'wechat-miniapp-virtual-goods' });
    await checkpoint(checks[0]!, () => {
      if (caseKey === 'known-unavailable-then-paid') {
        expect(outcome).toMatchObject({ reason: 'confirmed', snapshot: { state: 'PAID' } });
        expect(platform.httpRecords.map(record => record.path)).toEqual(['/api/base/trade/pay', '/api/base/trade/query', '/api/base/trade/query']);
      } else {
        expect(outcome).toMatchObject({
          reason: 'error',
          snapshot: { reference: { tradeNo: fixture.tradeNo }, state: 'UNKNOWN', source: 'unavailable' },
          channelSignal: caseKey === 'prepare-no-replay' ? 'not_invoked' : 'success_hint',
        });
        expectPublicError(expect, outcome.error, caseKey === 'prepare-no-replay' ? fixture.prepareError! : fixture.queryError!);
        expect(Object.keys(outcome).sort()).toEqual((caseKey === 'prepare-no-replay'
          ? ['attemptId', 'channelSignal', 'error', 'reason', 'snapshot']
          : ['attemptId', 'channelSignal', 'error', 'paymentNo', 'reason', 'snapshot']).sort());
        expect(platform.httpRecords).toHaveLength(caseKey === 'prepare-no-replay' ? 1 : 2);
      }
    });
    await checkpoint('public-shape', () => {
      expect(Object.prototype.hasOwnProperty.call(outcome, 'cause')).toBe(false);
      if (outcome.error) {
        expect(Object.prototype.hasOwnProperty.call(outcome.error, 'cause')).toBe(false);
        expect(outcome.snapshot.reference.tradeNo).toBe(fixture.tradeNo);
        expect(outcome.snapshot.observedAtMs).toEqual(expect.any(Number));
      }
    });
  }, { fixtureRoot });
}

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-026', caseId: 'public-declarations', fixtureCase: 'public-declarations', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CONTRACT-026', caseKey: 'public-declarations', checks: ['declarations-public-shape'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const fixture = value as Readonly<{ forbidden: string[]; required: string[] }>;
  const declarations = await Promise.all(['index.d.ts', 'index.d.cts'].map(file => readFile(new URL(`../../../payment-sdk/dist/${file}`, import.meta.url), 'utf8')));
  await checkpoint('declarations-public-shape', () => {
    for (const text of declarations) {
      for (const required of fixture.required) expect(text).toContain(required);
      for (const forbidden of fixture.forbidden) expect(text).not.toContain(forbidden);
    }
  });
}, { fixtureRoot });
