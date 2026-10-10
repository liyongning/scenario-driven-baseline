// @SCN-PROTOCOL-CONTRACT-002: 声明的消费接口的协议义务逐项由公共协议客户端与 Shadow 执行。
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { consumedOperations } from '../../../../packages/sdk/src/consumed-operations.ts';
import { discoverDeclaredRoutes, type RunningShadowServer } from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import {
  declaredObligationCases,
  declaredObligationKeys,
  entryOf,
  executeMatrixEvidence,
  nameOf,
} from './matrix-evidence.ts';
import { matrixContext, type MatrixFixture } from './matrix-support.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const inventory = await buildContractInventory(repositoryRoot);

/** 矩阵用例遍历产品包声明的消费接口，不写死任何接口名（PC-01）。 */
const operations: ReadonlyArray<(typeof consumedOperations)[number]> = consumedOperations;
const declaredNames = operations.map((operation) => operation.method.meta.name);
const routes = discoverDeclaredRoutes(operations.map((operation) => operation.method));
const running = new Set<RunningShadowServer>();

afterEach(async () => {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
});

defineCase(
  {
    ownerId: 'SCN-PROTOCOL-CONTRACT-002',
    caseId: 'protocol-matrix',
    fixtureCase: 'protocol-matrix',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-PROTOCOL-CONTRACT-002',
        caseKey: 'protocol-matrix',
        checks: [
          'obligations-covered',
          'real-client-path',
          'routes-from-declaration',
          'matrix-iterates-declaration',
        ],
      },
      ...declaredObligationCases(inventory, declaredNames),
    ],
  },
  async ({ fixture: value, checkpoint, expect, environmentClass }) => {
    const fixture = value as MatrixFixture;
    // 矩阵执行与逐义务判定由共享实现承担：integration 用例与一次性回归证据走同一份口径。
    const summary = await executeMatrixEvidence({
      operations,
      fixture,
      inventory,
      routes,
      environmentClass,
      context: matrixContext(),
      servers: running,
      checkpoint,
    });
    const covered = new Set(summary.covered);

    await checkpoint('routes-from-declaration', () => {
      expect(routes.map((route) => route.methodName)).toEqual([...declaredNames]);
      // 中立字段与声明一致；响应结构校验器由协议来源注入（PC-04），不参与中立字段比较。
      expect(
        routes.map(({ methodName, httpMethod, path }) => ({ methodName, httpMethod, path })),
      ).toEqual(
        operations.map((operation) => ({
          methodName: operation.method.meta.name,
          httpMethod: operation.method.meta.method,
          path: operation.method.meta.path,
        })),
      );
      expect(routes.every((route) => typeof route.validateResponse === 'function')).toBe(true);
      expect(routes.length).toBe(declaredNames.length);
    });

    await checkpoint('matrix-iterates-declaration', () => {
      expect([...Object.keys(summary.runs)].sort()).toEqual([...declaredNames].sort());
      for (const operation of operations) {
        const name = nameOf(operation);
        const entry = entryOf(fixture, name);
        expect(Object.prototype.hasOwnProperty.call(fixture, name)).toBe(true);
        // 每条响应一条请求，再加逐字段省略样例与一条不配置上下文的请求。
        expect(summary.runs[name]!.records.length).toBe(
          entry.responses.length + (entry.omitted ?? []).length + 1,
        );
      }
      expect(() => entryOf({}, 'UndeclaredInterface')).toThrow(/UndeclaredInterface/);
    });

    await checkpoint('obligations-covered', () => {
      // 声明为空时核验真实派生结果：不能拿"由空声明算出来的结果"自证（那样恒真）。
      // 业务错误码义务由 IDL 错误契约派生、不属于消费接口派生的矩阵范围，作为反恒真的存在性证据。
      if (declaredNames.length === 0) {
        expect(
          inventory.obligations.filter((item) => !item.id.startsWith('idl.error-contract#')),
        ).toEqual([]);
        expect(
          inventory.obligations.filter((item) => item.id.startsWith('idl.error-contract#')).length,
        ).toBeGreaterThan(0);
        expect(routes).toEqual([]);
        return;
      }
      const derived = declaredObligationKeys(inventory, declaredNames);
      expect(derived.length).toBeGreaterThan(0);
      expect(covered.size).toBe(derived.length);
      expect(inventory.methods.map((item) => item.name).sort()).toEqual([...declaredNames].sort());
      // 声明了 omitted 的字段必须有逐字段省略样例；每条派生义务都要有取证请求/响应。
      expect(summary.missingSamples, '声明 omitted 却没有省略样例的字段').toEqual([]);
      expect(summary.missingEvidence, '找不到取证响应的义务').toEqual([]);
    });

    await checkpoint('real-client-path', () => {
      for (const name of declaredNames) {
        const run = summary.runs[name]!;
        const entry = entryOf(fixture, name);
        expect(run.records.length).toBe(entry.responses.length + (entry.omitted ?? []).length + 1);
        expect(run.records.every((record) => record.methodName === name)).toBe(true);
      }
    });
  },
  { fixtureRoot },
);
