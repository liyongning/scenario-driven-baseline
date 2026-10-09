import automator from 'miniprogram-automator';
import { afterEach } from 'vitest';
import {
  createShadowServer,
  discoverExampleRoutes,
  type RunningShadowServer,
} from '@template-test/protocol';
import { defineCase } from '../../../src/cases/define-case.ts';
import { runWeappFunction } from '../../../src/drivers/weapp.ts';

const fixtureRoot = new URL('../../fixtures', import.meta.url).pathname;
const projectPath = new URL('../../../host/weapp', import.meta.url).pathname;
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const running = new Set<RunningShadowServer>();
afterEach(async () => {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
});

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-002',
    caseId: 'weapp-create-success',
    fixtureCase: 'create-success',
    environment: 'weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-002',
        caseKey: 'create-success',
        checks: ['single-create-request', 'executor-owned-context', 'neutral-reference'],
      },
    ],
  },
  async ({ fixture: value, checkpoint, expect }) => {
    const fixture = value as {
      ownerId: string;
      externalRef: string;
      units: number;
      resourceId: string;
    };
    const server = await createShadowServer({
      routes: discoverExampleRoutes(),
      scenarios: [
        {
          id: 'weapp-example-create',
          routes: {
            CreateTrade: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { tradeNo: fixture.resourceId, baseResp: { statusCode: '0' } } }],
            },
          },
        },
      ],
    }).start();
    running.add(server);
    const result = await runWeappFunction({
      automator,
      projectPath,
      cliPath,
      functionName: 'runExampleCase',
      args: {
        action: 'create-success',
        gatewayBaseUrl: server.url,
        accessToken: 'fixture-token',
        ownerId: fixture.ownerId,
        externalRef: fixture.externalRef,
        units: fixture.units,
      },
    });
    await checkpoint('single-create-request', () => {
      expect(server.records().map((record) => record.methodName)).toEqual(['CreateTrade']);
      expect(server.verify()).toEqual([]);
    });
    await checkpoint('executor-owned-context', () =>
      expect(server.records()[0]!.headers.authorization).toBe('Bearer fixture-token'),
    );
    await checkpoint('neutral-reference', () =>
      expect(result).toMatchObject({
        created: {
          ok: true,
          reference: { id: fixture.resourceId, externalRef: fixture.externalRef },
        },
      }),
    );
  },
  { fixtureRoot },
);
