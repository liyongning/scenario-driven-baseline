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
    ownerId: 'SCN-TEMPLATE-EXAMPLE-004',
    caseId: 'weapp-observe-completed',
    fixtureCase: 'observe-completed',
    environment: 'weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-004',
        caseKey: 'observe-completed',
        checks: ['terminal-mapped', 'stop-after-terminal', 'single-outcome'],
      },
    ],
  },
  async ({ fixture: value, checkpoint, expect, environmentClass }) => {
    const fixture = value as { resourceId: string; externalRef: string; states: string[] };
    const server = await createShadowServer({
      routes: discoverExampleRoutes(),
      environmentClass,
      scenarios: [
        {
          id: 'weapp-example-observe',
          routes: {
            QueryTrade: {
              expectedRequests: fixture.states.map(() => ({ recordOnly: true })),
              steps: fixture.states.map((status) => ({
                body: {
                  trade: { tradeNo: fixture.resourceId, status },
                  baseResp: { statusCode: '0' },
                },
              })),
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
        action: 'observe-completed',
        gatewayBaseUrl: server.url,
        accessToken: 'fixture-token',
        resourceId: fixture.resourceId,
        externalRef: fixture.externalRef,
      },
    });
    await checkpoint('terminal-mapped', () =>
      expect(result).toMatchObject({ outcome: { end: 'completed', lastState: 'completed' } }),
    );
    await checkpoint('stop-after-terminal', () => {
      expect(server.records()).toHaveLength(fixture.states.length);
      expect(server.verify()).toEqual([]);
    });
    await checkpoint('single-outcome', () =>
      expect(Object.keys(result as object)).toEqual(['outcome']),
    );
  },
  { fixtureRoot },
);
