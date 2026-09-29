import { expect, test, vi, type TestContext } from 'vitest';
import type { Cancellation, HttpPort, HttpRequest } from '@daqian/payment-protocol';
import { CreateTradeRequest } from '@daqian/payment-protocol/generated/idl/infra/trade/v1/trade';
import { createLiveCreateTradePort } from './create-trade';
import wireRequest from '../../../tests/fixtures/TC-PAYSDK-CORE-023/wire-request.json';
import wireSuccess from '../../../tests/fixtures/TC-PAYSDK-CORE-023/wire-success.json';

function request() {
  return CreateTradeRequest.fromJSON(wireRequest);
}

function moduleCase(key: string, checks: string[], body: (context: TestContext) => void | Promise<void>) {
  test(`TC-PAYSDK-CORE-023 ${key}`, { meta: { paymentCase: { ownerId: 'TC-PAYSDK-CORE-023', caseId: key, environment: 'test-tools-unit', fixtureCase: null, covers: [{ id: 'TC-PAYSDK-CORE-023', caseKey: key, checks }] } } }, async context => {
    const before = expect.getState().assertionCalls;
    await body(context);
    await context.annotate(JSON.stringify({ assertions: expect.getState().assertionCalls - before, checkpoints: checks }), 'payment-evidence');
  });
}

function harness(body: unknown, status = 200) {
  const sent: HttpRequest[] = [];
  let token = 'first';
  const http: HttpPort = { send: vi.fn(async input => { sent.push(input); return { ok: true as const, value: { status, headers: {}, body } }; }) };
  const port = createLiveCreateTradePort({
    createTradeUrl: 'https://trade.example/api/base/trade/create', getAccessToken: () => token,
    requestContext: { productId: 'product', lane: 'lane', appVersion: '1' }, http,
    runtime: { nowMs: () => 100, nextRequestId: (() => { let i = 0; return () => `live-request-${++i}`; })(), sleepMs: () => new Promise(() => undefined) },
  });
  return { port, sent, setToken(value: string) { token = value; } };
}

const success = wireSuccess;

test('CreateTrade assembly does not require the browser URL constructor in a mini-program runtime', () => {
  const original = globalThis.URL;
  Object.defineProperty(globalThis, 'URL', { configurable: true, writable: true, value: undefined });
  try {
    expect(() => harness(success)).not.toThrow();
  } finally {
    Object.defineProperty(globalThis, 'URL', { configurable: true, writable: true, value: original });
  }
});

moduleCase('wire-success', ['create-wire', 'create-result', 'create-lifetime'], async () => {
  expect(() => createLiveCreateTradePort({
    createTradeUrl: 'https://trade.example/wrong', getAccessToken: () => 'token',
    runtime: { nowMs: () => 100, nextRequestId: () => 'id', sleepMs: () => new Promise(() => undefined) },
    http: { send: async () => ({ ok: false, error: { code: 'NETWORK_ERROR' } }) },
  })).toThrow('generated binding');
  const h = harness(success);
  await expect(h.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'created', reference: { tradeNo: 'trade-1' } });
  expect(h.sent).toHaveLength(1);
  expect(h.sent[0]).toMatchObject({ url: 'https://trade.example/api/base/trade/create', method: 'POST' });
  expect(h.sent[0]!.headers).toEqual({ Authorization: 'Bearer first', 'Content-Type': 'application/json', request_id: 'live-request-1', 'X-Product-ID': 'product', lane: 'lane', app_version: '1' });
  expect(h.sent[0]!.headers).not.toHaveProperty('user_id');
  expect(h.sent[0]!.headers).not.toHaveProperty('userId');
  const wire = JSON.parse(h.sent[0]!.body!);
  expect(wire).toEqual(wireRequest);
  expect(wire).not.toHaveProperty('token');
  h.setToken('second');
  await h.port.create(request(), { deadlineAtMs: 60_100 });
  expect(h.sent[1]!.headers.Authorization).toBe('Bearer second');
  await expect(harness({ ...success, status: 1, baseResp: { success: true, statusCode: 0 } }).port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'created', reference: { tradeNo: 'trade-1' } });

  const sent: HttpRequest[] = [];
  const withoutContext = createLiveCreateTradePort({
    createTradeUrl: 'https://trade.example/api/base/trade/create', getAccessToken: () => 'token',
    runtime: { nowMs: () => 100, nextRequestId: () => 'live-request-1', sleepMs: () => new Promise(() => undefined) },
    http: { send: async input => { sent.push(input); return { ok: true, value: { status: 200, headers: {}, body: success } }; } },
  });
  await expect(withoutContext.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'created', reference: { tradeNo: 'trade-1' } });
  expect(sent[0]!.headers).not.toHaveProperty('X-Product-ID');
});

moduleCase('auth-parameter-conflict', ['create-wire', 'create-result'], async () => {
  const cases: Array<[number, unknown, string]> = [
    [401, {}, 'auth'],
    [401, 'not-json', 'auth'],
    [200, { baseResp: { statusCode: '10100801001020' } }, 'auth'],
    [200, { baseResp: { statusCode: '20200002001020' } }, 'auth'],
    [200, { baseResp: { statusCode: '10100801001010' } }, 'invalid_input'],
    [200, { baseResp: { statusCode: '20200002001010' } }, 'invalid_input'],
    [200, { tradeNo: 'looks-good', baseResp: { success: true, statusCode: '10100801001040' } }, 'conflict'],
    [200, { baseResp: { statusCode: '10100801001070' } }, 'unavailable'],
    [200, { baseResp: { statusCode: '20200002001030' } }, 'unavailable'],
  ];
  for (const [status, wire, reason] of cases) {
    const h = harness(wire, status);
    await expect(h.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason });
    expect(h.sent).toHaveLength(1);
  }
});

moduleCase('invalid-envelope-and-no-replay', ['create-result', 'create-lifetime'], async () => {
  const invalid = [
    'not-json', [], {}, { baseResp: {} }, { baseResp: { statusCode: 0.5 } }, { baseResp: { statusCode: -1 } }, { baseResp: { statusCode: Number.MAX_SAFE_INTEGER + 1 } }, { baseResp: { statusCode: '9223372036854775808' } },
    { ...success, tradeNo: 1 }, { ...success, tradeNo: '' }, { ...success, tradeNo: 'x'.repeat(26) },
    { ...success, status: 'TRADE_STATUS_UNSPECIFIED' }, { ...success, status: 'BAD' },
    { ...success, orderNos: [] }, { ...success, orderNos: ['same', 'same'] },
  ];
  for (const body of invalid) {
    const h = harness(body);
    await expect(h.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'invalid_response' });
    expect(h.sent).toHaveLength(1);
  }
  const unknown = harness({ baseResp: { statusCode: '999' } });
  await expect(unknown.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  expect(unknown.sent).toHaveLength(1);
  const non2xxZero = harness(success, 503);
  await expect(non2xxZero.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  await expect(harness({}, 503).port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  await expect(harness({ baseResp: {} }, 503).port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  const empty = harness(success); empty.setToken('  ');
  await expect(empty.port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'auth' });
  expect(empty.sent).toHaveLength(0);
});

test('CreateTrade transport maps timeout and pre-send cancellation without replay', async () => {
  const network: HttpPort = { send: vi.fn(async () => ({ ok: false as const, error: { code: 'TIMEOUT' as const } })) };
  const port = createLiveCreateTradePort({ createTradeUrl: 'https://trade.example/api/base/trade/create', getAccessToken: () => 'token', http: network, runtime: { nowMs: () => 100, nextRequestId: () => 'live-request-1', sleepMs: () => new Promise(() => undefined) } });
  await expect(port.create(request(), { deadlineAtMs: 60_100 })).resolves.toEqual({ kind: 'failed', reason: 'unavailable' });
  expect(network.send).toHaveBeenCalledTimes(1);
  const cancellation: Cancellation = { isStopped: () => true, subscribe: () => () => undefined };
  await expect(port.create(request(), { deadlineAtMs: 60_100, cancellation })).resolves.toEqual({ kind: 'failed', reason: 'cancelled' });
  expect(network.send).toHaveBeenCalledTimes(1);
});
