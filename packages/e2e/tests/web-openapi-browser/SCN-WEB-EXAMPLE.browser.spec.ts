import { createTrade, getTrade, listTrades } from '@daqian/template-openapi/generated/operations';
import { createShadowServer, type RunningShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { createAppHost, type AppHost } from '../../src/hosts/app-host.ts';
import { waitForCalls } from '../../src/harness.ts';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';
import { useBrowserDriver } from './browser-case-support.ts';

const root = process.cwd();
const driver = useBrowserDriver();
const allOperations = [createTrade, getTrade, listTrades] as const;

type Trade = Readonly<{
  trade_no: string;
  status: 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  amount: number;
  merchant_id: number;
  failure_reason?: string | null;
}>;

type CreateFixture = Readonly<{
  token: string;
  merchantId: number;
  amount: number;
  trade: Trade;
}>;

type PollFixture = CreateFixture &
  Readonly<{ statuses: ReadonlyArray<Trade['status']>; list: ReadonlyArray<Trade> }>;

type ListFixture = CreateFixture & Readonly<{ list: ReadonlyArray<Trade> }>;

type FailureFixture = Readonly<{
  token: string;
  merchantId: number;
  amount: number;
  response: Readonly<{ code: number; message: string; data: unknown }>;
}>;

type TransportFailureFixture = Readonly<{
  token: string;
  merchantId: number;
  amount: number;
}>;

function envelope(data: unknown, code = 0, message = 'ok') {
  return { code, message, data };
}

function success(data: unknown) {
  return { body: envelope(data) };
}

async function withWebExample(
  id: string,
  routes: Readonly<Record<string, unknown>>,
  body: (host: AppHost, server: RunningShadowServer) => Promise<void>,
) {
  const selected = Object.keys(routes).flatMap((name) =>
    allOperations.filter((operation) => operation.meta.id === name),
  );
  const server = await createShadowServer({
    routes: routesFromOpenApiOperations(selected, allOperations),
    environmentClass: 'platform',
    scenarios: [{ id, routes: routes as never }],
  }).start();
  const host = await createAppHost({
    root,
    productDirectory: 'web',
    shadowUrl: server.url,
  });
  try {
    await body(host, server);
  } finally {
    await host.close();
    await server.close();
  }
}

async function openExample(
  page: import('playwright').Page,
  host: AppHost,
  fixture: Readonly<Pick<CreateFixture, 'token' | 'merchantId'>>,
) {
  await page.goto(`${host.url}?token=${fixture.token}&merchant=${String(fixture.merchantId)}`);
  await page.getByTestId('app-root').waitFor();
}

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-001',
    caseId: 'create-in-browser',
    fixtureCase: 'create-in-browser',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-001',
        caseKey: 'create-in-browser',
        checks: ['single-create', 'token-from-url', 'current-trade-shown'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as CreateFixture;
    await withWebExample(
      'web-example-001',
      {
        createTrade: {
          expectedRequests: [
            {
              body: {
                merchant_id: data.merchantId,
                amount: data.amount,
                channel: 'WEB',
              },
            },
          ],
          steps: [success(data.trade)],
        },
        // 创建返回初始状态后组件按约定开始轮询；提供终态以让后续列表装载结束，避免未登记请求。
        getTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success({ ...data.trade, status: 'SUCCEEDED' })],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success({ items: [] })],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          const beforeSubmit = server.records().length;
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          const records = await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'createTrade'),
            (items) => items.length === 1,
          );
          await page.getByTestId('current-trade').getByText(data.trade.trade_no).waitFor();
          return {
            beforeSubmit,
            record: records[0]!,
            createResult: await page.getByTestId('create-result').textContent(),
            contextToken: await page.getByTestId('context-token').textContent(),
            currentTrade: await page.getByTestId('current-trade').textContent(),
          };
        });

        await checkpoint('single-create', () => {
          expect(observed.beforeSubmit).toBe(0);
          expect(observed.record.methodName).toBe('createTrade');
          expect(observed.record.rawBody).toEqual({
            merchant_id: data.merchantId,
            amount: data.amount,
            channel: 'WEB',
          });
          expect(
            server.records().filter((record) => record.methodName === 'createTrade'),
          ).toHaveLength(1);
          expect(server.verify()).toEqual([]);
        });
        await checkpoint('token-from-url', () => {
          expect(observed.contextToken).toBe(data.token);
          expect(observed.record.headers['x-access-token']).toBe(data.token);
        });
        await checkpoint('current-trade-shown', () => {
          expect(observed.currentTrade).toContain(data.trade.trade_no);
          // 创建模块保留初始状态展示；轮询终态由 SCN-WEB-EXAMPLE-002 覆盖。
          expect(observed.createResult).toContain(data.trade.trade_no);
          expect(observed.createResult).toContain(data.trade.status);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-002',
    caseId: 'poll-in-browser',
    fixtureCase: 'poll-in-browser',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-002',
        caseKey: 'poll-in-browser',
        checks: ['poll-uses-trade-no', 'pending-shown', 'terminal-stops'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as PollFixture;
    await withWebExample(
      'web-example-002',
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success(data.trade)],
        },
        getTrade: {
          expectedRequests: [{ recordOnly: true }, { recordOnly: true }],
          steps: [
            success({ ...data.trade, status: data.statuses[0]! }),
            { delayMs: 400, body: envelope({ ...data.trade, status: data.statuses[1]! }) },
          ],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success({ items: data.list })],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'createTrade'),
            (items) => items.length === 1,
          );
          await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'getTrade'),
            (items) => items.length >= 1,
          );
          await page.getByTestId('trade-status').getByText('进行中').waitFor();
          const getRecords = await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'getTrade'),
            (items) => items.length >= 2,
          );
          const pending = await page.getByTestId('trade-status').textContent();
          await page.getByTestId('trade-status').getByText('已完成').waitFor();
          await new Promise((resolve) => setTimeout(resolve, 350));
          return {
            getRecords,
            pending,
            terminal: await page.getByTestId('trade-status').textContent(),
            getCountAfterTerminal: server
              .records()
              .filter((record) => record.methodName === 'getTrade').length,
          };
        });

        await checkpoint('poll-uses-trade-no', () => {
          expect(observed.getRecords.map((record) => record.path)).toEqual([
            `/api/v1/trades/${data.trade.trade_no}`,
            `/api/v1/trades/${data.trade.trade_no}`,
          ]);
        });
        await checkpoint('pending-shown', () => expect(observed.pending).toContain('进行中'));
        await checkpoint('terminal-stops', () => {
          expect(observed.terminal).toContain('已完成');
          expect(observed.getCountAfterTerminal).toBe(2);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-003',
    caseId: 'list-in-browser',
    fixtureCase: 'list-in-browser',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-003',
        caseKey: 'list-in-browser',
        checks: ['merchant-from-url', 'list-rendered'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as ListFixture;
    await withWebExample(
      'web-example-003',
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success(data.trade)],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ delayMs: 300, body: envelope({ items: data.list }) }],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          const records = await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'listTrades'),
            (items) => items.length === 1,
          );
          const loading = await page
            .getByTestId('trade-list')
            .getByTestId('loading-indicator')
            .isVisible();
          await page.getByTestId('trade-list').getByText(data.list[0]!.trade_no).waitFor();
          await page.getByTestId('trade-list').getByText(data.list[1]!.trade_no).waitFor();
          return {
            record: records[0]!,
            loading,
            listText: await page.getByTestId('trade-list').textContent(),
          };
        });

        await checkpoint('merchant-from-url', () => {
          expect(observed.record.path).toBe(`/api/v1/merchants/${String(data.merchantId)}/trades`);
          expect(observed.loading).toBe(true);
        });
        await checkpoint('list-rendered', () => {
          expect(observed.listText).toContain(data.list[0]!.trade_no);
          expect(observed.listText).toContain(data.list[1]!.trade_no);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-004',
    caseId: 'business-failure-in-browser',
    fixtureCase: 'business-failure-in-browser',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-004',
        caseKey: 'business-failure-in-browser',
        checks: ['code-outcome-shown', 'failure-no-follow-up'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as FailureFixture;
    await withWebExample(
      'web-example-004',
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [
            {
              body: envelope(data.response.data, data.response.code, data.response.message),
            },
          ],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          await waitForCalls(
            () => server.records(),
            (items) => items.length === 1,
          );
          await page.getByTestId('create-result').getByText('交易冲突').waitFor();
          return {
            result: await page.getByTestId('create-result').textContent(),
            currentTrade: await page.getByTestId('current-trade').textContent(),
            requests: server.records().map((record) => record.methodName),
          };
        });

        await checkpoint('code-outcome-shown', () => expect(observed.result).toContain('交易冲突'));
        await checkpoint('failure-no-follow-up', () => {
          expect(observed.requests).toEqual(['createTrade']);
          expect(observed.currentTrade).toContain('无当前交易');
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-005',
    caseId: 'transport-failure-in-browser',
    fixtureCase: 'transport-failure-in-browser',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-005',
        caseKey: 'transport-failure-in-browser',
        checks: ['failure-component-shown', 'no-replay'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as TransportFailureFixture;
    const trade: Trade = {
      trade_no: 'T-WEB-005',
      status: 'CREATED',
      amount: data.amount,
      merchant_id: data.merchantId,
    };
    await withWebExample(
      'web-example-005',
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success(trade)],
        },
        getTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success({ ...trade, status: 'SUCCEEDED' })],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [{ partialThenDisconnect: true }],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          await waitForCalls(
            () => server.records().filter((record) => record.methodName === 'listTrades'),
            (items) => items.length === 1,
          );
          await page.getByTestId('loading-failure').getByText('加载失败').waitFor();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            failure: await page.getByTestId('loading-failure').textContent(),
            listRequestCount: server
              .records()
              .filter((record) => record.methodName === 'listTrades').length,
          };
        });

        await checkpoint('failure-component-shown', () =>
          expect(observed.failure).toContain('加载失败'),
        );
        await checkpoint('no-replay', () => {
          expect(observed.listRequestCount).toBe(1);
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-006',
    caseId: 'normal',
    fixtureCase: 'normal',
    flowId: 'FLOW-WEB-EXAMPLE-001',
    flowCase: 'normal',
    environment: 'browser',
    binding: 'web-openapi-browser',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-006',
        caseKey: 'normal',
        checks: ['stage-order', 'trade-no-continuity', 'terminal-visible'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect, flow }) => {
    const data = fixture as PollFixture;
    await withWebExample(
      'web-example-006',
      {
        createTrade: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success(data.trade)],
        },
        getTrade: {
          expectedRequests: [{ recordOnly: true }, { recordOnly: true }],
          steps: [
            success({ ...data.trade, status: data.statuses[0]! }),
            success({ ...data.trade, status: data.statuses[1]! }),
          ],
        },
        listTrades: {
          expectedRequests: [{ recordOnly: true }],
          steps: [success({ items: data.list })],
        },
      },
      async (host, server) => {
        const observed = await driver.runCase({}, async ({ page }) => {
          await openExample(page, host, data);
          expect(server.records()).toHaveLength(0);
          await page.getByTestId('amount-input').fill(String(data.amount));
          await page.getByTestId('create-submit').click();
          await waitForCalls(
            () => server.records(),
            (items) => items.filter((record) => record.methodName === 'createTrade').length === 1,
          );
          await waitForCalls(
            () => server.records(),
            (items) => items.filter((record) => record.methodName === 'getTrade').length === 2,
          );
          await page.getByTestId('trade-status').getByText('已完成').waitFor();
          await page.getByTestId('trade-list').getByText(data.trade.trade_no).waitFor();
          await new Promise((resolve) => setTimeout(resolve, 350));
          const records = server.records();
          return {
            records,
            listText: await page.getByTestId('trade-list').textContent(),
            terminal: await page.getByTestId('trade-status').textContent(),
            getCountAfterTerminal: records.filter((record) => record.methodName === 'getTrade')
              .length,
          };
        });

        await flow(data.trade.trade_no, [
          '打开页面',
          '提交创建表单',
          'createTrade',
          'getTrade 轮询（非终态',
          '终态）',
          '停止轮询',
          'listTrades',
          '列表中可见新交易；trade_no 贯通各阶段，调用顺序和次数一致',
        ]);
        await checkpoint('stage-order', () => {
          expect(observed.records.map((record) => record.methodName)).toEqual([
            'createTrade',
            'getTrade',
            'getTrade',
            'listTrades',
          ]);
          expect(observed.getCountAfterTerminal).toBe(2);
        });
        await checkpoint('trade-no-continuity', () => {
          expect(
            observed.records
              .filter((record) => record.methodName === 'getTrade')
              .map((record) => record.path),
          ).toEqual([
            `/api/v1/trades/${data.trade.trade_no}`,
            `/api/v1/trades/${data.trade.trade_no}`,
          ]);
          expect(observed.listText).toContain(data.trade.trade_no);
        });
        await checkpoint('terminal-visible', () => {
          expect(observed.terminal).toContain('已完成');
          expect(observed.listText).toContain('已完成');
          expect(server.verify()).toEqual([]);
        });
      },
    );
  },
  { timeoutMs: 60_000 },
);
