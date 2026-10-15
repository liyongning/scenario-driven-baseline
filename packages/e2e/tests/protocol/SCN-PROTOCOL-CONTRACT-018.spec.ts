// @SCN-PROTOCOL-CONTRACT-018: integration 经协议包根入口的生产 fetch 实现访问 Shadow。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createFetchHttp,
  createProtocolClient,
  type Cancellation,
  type HttpPort,
} from '@daqian/template-protocol';
import {
  QueryTrade,
  QueryTradeRequest,
} from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
import * as sdk from '@daqian/template-sdk';
import { discoverDeclaredRoutes } from '@template-test/protocol';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

function cancellationSource() {
  let stopped = false;
  const listeners = new Set<() => void>();
  const cancellation: Cancellation = {
    isStopped: () => stopped,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    cancellation,
    stop() {
      stopped = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

function clientFor(url: string, http: HttpPort = createFetchHttp()) {
  return createProtocolClient({
    gatewayBaseUrl: url,
    getAccessToken: () => 'fixture-token',
    http,
    runtime: {
      nowMs: () => Date.now(),
      sleepMs: () => new Promise<void>(() => undefined),
    },
  });
}

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-018',
    caseId: 'fetch-through-shadow',
    fixtureCase: 'fetch-through-shadow',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-018',
        caseKey: 'fetch-through-shadow',
        checks: ['production-fetch-results'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    async function invoke(
      step: Readonly<Record<string, unknown>>,
      options: Readonly<{ timeoutMs?: number; cancelInFlight?: boolean }> = {},
    ) {
      const source = cancellationSource();
      const rawHttp = createFetchHttp();
      const cancelInFlight: HttpPort = {
        send(request) {
          const pending = rawHttp.send(request);
          setTimeout(source.stop, 50);
          return pending;
        },
      };
      const server = await createShadowServer({
        routes: discoverDeclaredRoutes([QueryTrade]),
        environmentClass: 'integration',
        scenarios: [
          {
            id: 'production-fetch-results',
            routes: {
              QueryTrade: {
                expectedRequests: [{ recordOnly: true }],
                steps: [step],
              },
            },
          },
        ],
      }).start();
      try {
        const result = await clientFor(
          server.url,
          options.cancelInFlight ? cancelInFlight : createFetchHttp(),
        ).request(QueryTrade.meta, QueryTradeRequest.create({ tradeNo: 'fixture-trade' }), {
          deadlineAtMs: Date.now() + (options.timeoutMs ?? 2_000),
          ...(options.cancelInFlight ? { cancellation: source.cancellation } : {}),
        });
        // 客户端可能因取消、超时或断连先于服务端记录完成；等待记录事件，避免默认并发下观察竞态。
        await server.waitForRecords(1);
        return { result, records: server.records(), issues: server.verify() };
      } finally {
        await server.close();
      }
    }

    const success = await invoke({ body: { baseResp: { success: true, statusCode: '0' } } });
    const httpError = await invoke({
      status: 503,
      body: { baseResp: { success: false, statusCode: '503' } },
    });
    const timeout = await invoke({ delayMs: 250, body: {} }, { timeoutMs: 20 });
    const cancelled = await invoke({ delayMs: 250, body: {} }, { cancelInFlight: true });
    const network = await invoke({ disconnect: true });

    await checkpoint('production-fetch-results', () => {
      expect(fixture).toEqual({ scenario: 'production-fetch-results' });
      expect(success.result).toMatchObject({ ok: true, value: { http: { status: 200 } } });
      expect(httpError.result).toMatchObject({ ok: true, value: { http: { status: 503 } } });
      expect(timeout.result).toEqual({ ok: false, error: { code: 'TIMEOUT' } });
      expect(cancelled.result).toEqual({ ok: false, error: { code: 'CANCELLED' } });
      expect(network.result).toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
      for (const run of [success, httpError, timeout, cancelled, network]) {
        expect(run.records).toHaveLength(1);
        expect(run.issues).toEqual([]);
      }
    });
  },
  { fixtureRoot, timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-018',
    caseId: 'production-network-wiring',
    fixtureCase: 'production-network-wiring',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-018',
        caseKey: 'production-network-wiring',
        checks: ['node-driver-removed', 'root-export'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const matrixSource = readFileSync(new URL('./matrix-evidence.ts', import.meta.url), 'utf8');
    await checkpoint('node-driver-removed', () => {
      expect(fixture).toEqual({ scenario: 'production-network-wiring' });
      expect(existsSync(`${repositoryRoot}/packages/e2e/src/drivers/node.ts`)).toBe(false);
      expect(existsSync(`${repositoryRoot}/packages/e2e/src/drivers/node.test.ts`)).toBe(false);
      expect(matrixSource).not.toContain('createNodeHttpDriver');
      expect(matrixSource).toContain('createFetchHttp');
    });
    await checkpoint('root-export', () => {
      expect(createFetchHttp).toBeTypeOf('function');
      expect(Object.keys(sdk)).not.toContain('createFetchHttp');
    });
  },
  { fixtureRoot },
);
