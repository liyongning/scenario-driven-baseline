import { test } from 'vitest';
import { CreateTrade, QueryTrade } from '../../src/generated/idl/infra/trade/v1/trade.ts';
import { routesFromRpcMethods } from './idl-routes.ts';

// 证据直接以 generated 方法常量构造输入，不依赖模板示例目录（SCN-PROTOCOL-CONTRACT-004）。
const requiredMethods = [CreateTrade.meta, QueryTrade.meta];

test(
  'SCN-PROTOCOL-CONTRACT-004 idl-route-source',
  {
    // 派生响应结构校验器要编译 generated 类型：副本/负载下默认 5s 易误判超时。
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-004',
        caseId: 'idl-route-source',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-004',
            caseKey: 'idl-route-source',
            checks: ['idl-route-source'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // 生成描述 -> 中立路由：方法名、HTTP 方法与路径与生成描述一致。
    // 注入的响应校验函数不在中立字段比较范围内（PC-04），单独断言其存在。
    const derived = routesFromRpcMethods(requiredMethods, requiredMethods);
    context
      .expect(derived.map(({ methodName, httpMethod, path }) => ({ methodName, httpMethod, path })))
      .toEqual([
        { methodName: 'CreateTrade', httpMethod: 'POST', path: CreateTrade.meta.path },
        { methodName: 'QueryTrade', httpMethod: 'POST', path: QueryTrade.meta.path },
      ]);
    context
      .expect(derived.every((route) => typeof route.validateResponse === 'function'))
      .toBe(true);
    // 缺少所需方法时报错，不静默跳过。
    context
      .expect(() => routesFromRpcMethods(requiredMethods, [QueryTrade.meta]))
      .toThrow(/CreateTrade/);
    // 缺少路径、HTTP 方法或 codec 时报错。
    const { requestCodec, ...withoutCodec } = CreateTrade.meta;
    void requestCodec;
    context
      .expect(() => routesFromRpcMethods([CreateTrade.meta], [{ ...CreateTrade.meta, path: '' }]))
      .toThrow(/not an HTTP method/);
    context
      .expect(() => routesFromRpcMethods([CreateTrade.meta], [{ ...CreateTrade.meta, method: '' }]))
      .toThrow(/not an HTTP method/);
    context
      .expect(() => routesFromRpcMethods([CreateTrade.meta], [withoutCodec as never]))
      .toThrow(/not an HTTP method/);
    // 缺少响应类型、或 generated 中没有该类型时报错，不静默跳过结构校验。
    const { responseType, ...withoutResponseType } = CreateTrade.meta;
    void responseType;
    context
      .expect(() => routesFromRpcMethods([CreateTrade.meta], [withoutResponseType as never]))
      .toThrow(/missing a response type/);
    context
      .expect(() =>
        routesFromRpcMethods(
          [CreateTrade.meta],
          [{ ...CreateTrade.meta, responseType: 'MissingResponse' }],
        ),
      )
      .toThrow(/generated output is missing response type MissingResponse/);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['idl-route-source'],
      }),
      'scenario-evidence',
    );
  },
);
