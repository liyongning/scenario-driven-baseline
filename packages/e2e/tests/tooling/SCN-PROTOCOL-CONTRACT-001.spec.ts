import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';

type InventoryOutput = {
  contracts?: Array<{ id: string; cases: string[]; requiredIn: string[] }>;
  contractFields?: Array<{
    method: string;
    direction: string;
    path: string;
    applicability: string;
  }>;
};

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-001',
  'inventory-cli',
  ['consumed-methods-only', 'complete-obligations'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        '### Requirement: PC-01 example protocol obligations\n#### Scenario: SCN-PROTOCOL-CONTRACT-001 Example inventory\n' +
          verification(
            [
              {
                key: 'derivation-rules',
                kind: 'module',
                requiredIn: ['test-tools-unit'],
                checks: ['consumed-methods-only', 'complete-obligations', 'pending-reported'],
              },
              {
                key: 'inventory-cli',
                kind: 'engineering',
                requiredIn: ['integration'],
                checks: ['consumed-methods-only', 'complete-obligations'],
              },
            ],
            {
              'consumed-methods-only':
                '义务只针对产品包实际消费的 CreateTrade 与 QueryTrade，不包含其他接口',
              'complete-obligations':
                '路由、字段映射与编码、公共请求上下文、响应、错误、超时各类义务都有 case 与运行环境',
              'pending-reported': '无法判定映射的字段被报告为待定，不被静默忽略',
            },
          ),
      );
      enableInventory(fixture.root);
      const output = runGate(fixture.root, ['--inventory']).output as InventoryOutput | undefined;
      const contracts = output?.contracts ?? [];
      const fields = (output?.contractFields ?? []).filter(
        (field) => field.direction === 'request' || field.direction === 'response',
      );

      await check('consumed-methods-only', () => {
        context
          .expect([...new Set(fields.map((field) => field.method))].sort())
          .toEqual(['CreateTrade', 'QueryTrade']);
        const methods = contracts
          .map((contract) => contract.id.split('#')[0] ?? '')
          .filter((prefix) => prefix.startsWith('infra.trade.v1.'));
        context
          .expect([...new Set(methods)].sort())
          .toEqual(['infra.trade.v1.CreateTrade', 'infra.trade.v1.QueryTrade']);
        context
          .expect(contracts.some((contract) => contract.id.includes('CreateTradePay')))
          .toBe(false);
      });
      await check('complete-obligations', () => {
        const categories = new Set(
          contracts
            .filter((contract) => contract.id.startsWith('infra.trade.v1.'))
            .map((contract) => contract.id.split('#')[1] ?? ''),
        );
        context
          .expect([...categories].sort())
          .toEqual([
            'encoding-boundary',
            'error-handling',
            'header-base-req',
            'http-route',
            'request-mapping',
            'response-handling',
            'response-mapping',
            'timeout',
          ]);
        for (const method of ['CreateTrade', 'QueryTrade']) {
          const scoped = contracts.filter((contract) =>
            contract.id.startsWith(`infra.trade.v1.${method}#`),
          );
          context.expect(scoped.length, method).toBeGreaterThan(0);
          for (const contract of scoped) {
            context.expect(contract.cases.length, contract.id).toBeGreaterThan(0);
            context.expect(contract.requiredIn.length, contract.id).toBeGreaterThan(0);
          }
        }
        context.expect(fields.filter((field) => field.applicability === 'pending')).toEqual([]);
      });
    } finally {
      fixture.cleanup();
    }
  },
);
