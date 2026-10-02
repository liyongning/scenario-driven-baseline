import automator from 'miniprogram-automator';
import { afterEach } from 'vitest';
import { createShadowServer, discoverExampleRoutes, type RunningShadowServer } from '@template-test/protocol';
import { defineCase } from '../../../src/cases/define-case.ts';
import { runWeappFunction } from '../../../src/drivers/weapp.ts';

const fixtureRoot = new URL('../../fixtures', import.meta.url).pathname;
const projectPath = new URL('../../../host/weapp', import.meta.url).pathname;
const cliPath = process.env.WECHAT_DEVTOOLS_CLI_PATH ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const running = new Set<RunningShadowServer>();
afterEach(async () => { await Promise.all([...running].map(server => server.close())); running.clear(); });

defineCase({ ownerId: 'FLOW-TEMPLATE-EXAMPLE-001', caseId: 'weapp-normal', fixtureCase: 'normal', environment: 'weapp', flowId: 'FLOW-TEMPLATE-EXAMPLE-001', flowCase: 'normal', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-011', caseKey: 'normal', checks: ['stage-order', 'reference-continuity', 'single-final-outcome'] }] }, async ({ fixture: value, checkpoint, flow, expect }) => {
  const fixture = value as { ownerId: string; externalRef: string; units: number; resourceId: string; states: string[] };
  const server = await createShadowServer({ routes: discoverExampleRoutes(), scenarios: [{ id: 'weapp-example-flow', routes: {
    CreateTrade: { expectedRequests: [{ recordOnly: true }], steps: [{ body: { tradeNo: fixture.resourceId, baseResp: { statusCode: '0' } } }] },
    QueryTrade: { expectedRequests: fixture.states.map(() => ({ recordOnly: true })), steps: fixture.states.map(status => ({ body: { trade: { tradeNo: fixture.resourceId, status }, baseResp: { statusCode: '0' } } })) },
  } }] }).start();
  running.add(server);
  const result = await runWeappFunction({ automator, projectPath, cliPath, functionName: 'runExampleCase', args: { action: 'normal', gatewayBaseUrl: server.url, accessToken: 'fixture-token', ownerId: fixture.ownerId, externalRef: fixture.externalRef, units: fixture.units } });
  await checkpoint('stage-order', () => { expect(server.records().map(record => record.methodName)).toEqual(['CreateTrade', 'QueryTrade', 'QueryTrade']); expect(server.verify()).toEqual([]); });
  await checkpoint('reference-continuity', () => expect(server.records().slice(1).map(record => (record.rawBody as { tradeNo: string }).tradeNo)).toEqual([fixture.resourceId, fixture.resourceId]));
  await checkpoint('single-final-outcome', () => expect(result).toMatchObject({ created: { ok: true, reference: { id: fixture.resourceId } }, outcome: { end: 'completed' } }));
  await flow(fixture.resourceId, ['createExampleClient', 'create', 'CreateTrade', 'observe', 'QueryTrade(CREATED', 'PAID)', '一次最终结果；资源引用贯通各阶段，调用顺序和次数一致，初始化时不发请求']);
}, { fixtureRoot });
