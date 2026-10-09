import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';
import {
  declarationRoot,
  defaultGeneratedFiles,
  syntheticMethodFile,
} from './declaration-fixture.ts';

type InventoryOutput = {
  contracts?: Array<{ id: string; cases: string[]; requiredIn: string[] }>;
  contractFields?: Array<{
    method: string;
    direction: string;
    path: string;
    applicability: string;
  }>;
  issues?: string[];
};

const syntheticSpec =
  '### Requirement: PC-01 example protocol obligations\n' +
  '#### Scenario: SCN-PROTOCOL-CONTRACT-001 Example inventory\n' +
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
        checks: ['consumed-methods-only', 'complete-obligations', 'empty-declaration'],
      },
      {
        key: 'non-trade-method-cli',
        kind: 'engineering',
        requiredIn: ['integration'],
        checks: [
          'package-prefix',
          'source-file-from-declaration',
          'non-trade-method-derived',
          'invalid-declaration-rejected',
        ],
      },
    ],
    {
      'consumed-methods-only':
        '义务只针对产品包实际消费的 CreateTrade 与 QueryTrade，不包含其他接口',
      'complete-obligations':
        '路由、字段映射与编码、公共请求上下文、响应、错误、超时各类义务都有 case 与运行环境',
      'pending-reported': '无法判定映射的字段被报告为待定，不被静默忽略',
      'empty-declaration': '声明为空时按消费接口派生的义务为空且不报错',
      'package-prefix': '义务 ID 前缀由声明元素在 generated 中的声明文件推导',
      'source-file-from-declaration': '请求/响应类型取自声明元素在 generated 中的声明位置',
      'non-trade-method-derived': '非 trade.ts 的合成接口与 trade 方法各自派生',
      'invalid-declaration-rejected': 'method 不是 createMethod 常量时报错并非零退出',
    },
  );

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-001',
  'inventory-cli',
  ['consumed-methods-only', 'complete-obligations', 'empty-declaration'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(fixture.root, syntheticSpec);
      enableInventory(fixture.root, { realSources: true });
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

      await check('empty-declaration', () => {
        // 声明为空：按消费接口派生的义务为空、派生不报错，业务错误码义务仍派生。
        const empty = declarationRoot({
          declaration: 'export const consumedOperations: ReadonlyArray<never> = [];\n',
          caller: null,
          prefix: 'template-contract-001-empty-cli-',
        });
        try {
          const result = runGate(empty.root, ['--inventory']);
          const emptyContracts = (result.output as InventoryOutput | undefined)?.contracts ?? [];
          context.expect(result.status, (result.output?.issues ?? []).join('\n')).toBe(0);
          context
            .expect(emptyContracts.filter((contract) => contract.id.startsWith('infra.')))
            .toEqual([]);
          context
            .expect(emptyContracts.map((contract) => contract.id))
            .toEqual(['idl.error-contract#business-error#$']);
        } finally {
          empty.cleanup();
        }
      });
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-001',
  'non-trade-method-cli',
  [
    'package-prefix',
    'source-file-from-declaration',
    'non-trade-method-derived',
    'invalid-declaration-rejected',
  ],
  async (context, check) => {
    const root = declarationRoot({ prefix: 'template-contract-001-nontrade-' });
    try {
      writeSpec(root.root, syntheticSpec);
      const result = runGate(root.root, ['--inventory']);
      const output = result.output as InventoryOutput | undefined;
      const contracts = output?.contracts ?? [];
      const prefixes = [
        ...new Set(contracts.map((contract) => contract.id.split('#')[0] ?? '')),
      ].sort();

      await check('package-prefix', () => {
        // 前缀由声明文件相对 generated/idl/ 的目录推导：trade 与 pay 各自独立，不取自 meta。
        context
          .expect(prefixes)
          .toEqual(['idl.error-contract', 'infra.pay.v1.FastCharge', 'infra.trade.v1.CreateTrade']);
      });

      await check('source-file-from-declaration', () => {
        // 请求字段取自声明位置所在文件的请求类型：FastCharge 的 order_no 来自 pay.ts。
        context
          .expect(contracts.map((contract) => contract.id))
          .toContain('infra.pay.v1.FastCharge#request-mapping#order_no');
        context
          .expect(
            contracts.filter(
              (contract) =>
                contract.id.includes('FastCharge') && contract.id.startsWith('infra.trade.'),
            ),
          )
          .toEqual([]);
        context
          .expect(
            contracts.filter(
              (contract) =>
                contract.id.includes('CreateTrade') && contract.id.startsWith('infra.pay.'),
            ),
          )
          .toEqual([]);
      });

      await check('non-trade-method-derived', () => {
        // 两个方法同时声明时互不干扰：各自有 http-route、请求与响应义务。
        for (const method of ['infra.trade.v1.CreateTrade', 'infra.pay.v1.FastCharge']) {
          const scoped = contracts.filter((contract) => contract.id.startsWith(`${method}#`));
          context.expect(scoped.length, method).toBeGreaterThan(0);
          for (const contract of scoped) {
            context.expect(contract.cases.length, contract.id).toBeGreaterThan(0);
            context.expect(contract.requiredIn.length, contract.id).toBeGreaterThan(0);
          }
        }
        context
          .expect(
            contracts.some((contract) => contract.id === 'infra.trade.v1.CreateTrade#http-route#$'),
          )
          .toBe(true);
        context
          .expect(
            contracts.some((contract) => contract.id === 'infra.pay.v1.FastCharge#http-route#$'),
          )
          .toBe(true);
      });

      await check('invalid-declaration-rejected', () => {
        // 元素 method 只有 defineMethodSpec、没有 HTTP 元数据：派生器报错并非零退出。
        const invalid = declarationRoot({
          declaration: [
            "import { SlowCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/slow';",
            '',
            'export const consumedOperations = [{ method: SlowCharge, requestFields: {} }];',
            '',
          ].join('\n'),
          generated: [
            ...defaultGeneratedFiles(),
            {
              relative: 'idl/infra/pay/v1/slow.ts',
              content: syntheticMethodFile({
                name: 'SlowCharge',
                path: '/api/base/pay/slow',
                factory: 'defineMethodSpec',
              }),
            },
          ],
          caller: null,
          prefix: 'template-contract-001-invalid-',
        });
        try {
          writeSpec(invalid.root, syntheticSpec);
          const rejected = runGate(invalid.root, ['--inventory']);
          context.expect(rejected.status).not.toBe(0);
          context
            .expect((rejected.output as InventoryOutput | undefined)?.issues?.join('\n') ?? '')
            .toContain('不是 createMethod 常量');
        } finally {
          invalid.cleanup();
        }
      });
    } finally {
      root.cleanup();
    }
  },
);
