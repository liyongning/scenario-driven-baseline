import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  declarationRoot,
  defaultGeneratedFiles,
  writeFixtureFile,
} from '../../packages/e2e/tests/tooling/declaration-fixture.ts';
import {
  businessErrorNames,
  controlled,
  customMethodFile,
  exampleInventoryRoot,
  hasRepositoryIdl,
  inventoryTradeFile,
  repositoryRoot,
  requiredIn,
} from '../../packages/e2e/tests/tooling/contract-inventory-fixture.ts';
import { buildContractInventory } from './contract-inventory.ts';

describe.skipIf(!hasRepositoryIdl)('buildContractInventory', () => {
  it(
    'reports a missing declaration module and treats a missing registration as empty',
    { timeout: 30_000 },
    async () => {
      const missing = declarationRoot({
        consumedOperations: ['packages/sdk/src/absent.ts'],
        caller: null,
        prefix: 'template-contract-missing-module-',
      });
      try {
        const inventory = await buildContractInventory(missing.root);
        expect(inventory.issues).toEqual([
          expect.stringContaining('声明模块不存在或未进入分析范围'),
        ]);
      } finally {
        missing.cleanup();
      }

      const unregistered = declarationRoot({
        consumedOperations: null,
        caller: null,
        prefix: 'template-contract-unregistered-',
      });
      try {
        const inventory = await buildContractInventory(unregistered.root);
        expect(inventory.methods).toEqual([]);
        expect(inventory.issues).toEqual([]);
        expect(inventory.obligations).toEqual([
          expect.objectContaining({ id: 'idl.error-contract#business-error#$', cases: [] }),
        ]);
      } finally {
        unregistered.cleanup();
      }

      const empty = declarationRoot({
        declaration: 'export const consumedOperations: ReadonlyArray<never> = [];\n',
        caller: null,
        prefix: 'template-contract-empty-',
      });
      try {
        const inventory = await buildContractInventory(empty.root);
        expect(inventory.methods).toEqual([]);
        expect(inventory.issues).toEqual([]);
        const interfaceObligations = inventory.obligations.filter((item) =>
          item.id.startsWith('infra.'),
        );
        expect(interfaceObligations).toEqual([]);
        expect(inventory.obligations).toEqual([
          expect.objectContaining({ id: 'idl.error-contract#business-error#$', cases: [] }),
        ]);
      } finally {
        empty.cleanup();
      }
    },
  );

  it(
    'reads the business error catalog from a frozen or plain object literal',
    { timeout: 30_000 },
    async () => {
      const root = declarationRoot({ caller: null, prefix: 'template-contract-error-catalog-' });
      const paths = controlled(root.root);
      const catalog = join(paths.protocolSrc, 'errors/business-codes.ts');
      try {
        const shapes = [
          { content: 'export const businessErrors = { ErrProbe: "probe" };', cases: ['ErrProbe'] },
          { content: 'export const businessErrors = Object.freeze();', cases: [] },
          { content: 'export const businessErrors = Object.freeze("probe");', cases: [] },
        ];
        for (const shape of shapes) {
          writeFixtureFile(root.root, catalog, shape.content);
          const inventory = await buildContractInventory(root.root);
          const obligation = inventory.obligations.find(
            (item) => item.id === 'idl.error-contract#business-error#$',
          );
          expect(obligation?.cases, shape.content).toEqual(shape.cases);
        }
      } finally {
        root.cleanup();
      }
    },
  );

  it(
    'ignores request calls that do not resolve to a generated method constant',
    { timeout: 30_000 },
    async () => {
      const root = declarationRoot({
        prefix: 'template-contract-call-shapes-',
        caller: [
          "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
          "import { FastCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/pay';",
          'declare const client: {',
          '  request(meta: unknown, request: unknown, context: unknown): Promise<unknown>;',
          '};',
          'declare const config: { meta: unknown };',
          'function pickTarget() {',
          '  return 1;',
          '}',
          'const factory = { createMethod };',
          'const notCall = 42;',
          'const viaFactory = factory.createMethod({ method: "POST" } as never);',
          'const noArguments = createMethod();',
          'const unnamed = createMethod({ method: "POST" } as never);',
          'const numeric = createMethod(42 as never);',
          'const meta = CreateTrade.meta;',
          'export const declared = () => client.request(meta, {}, {});',
          'export const other = () => client.request(FastCharge, {}, {});',
          'export const unresolved = () => client.request(missingThing, {}, {});',
          'export const literal = () => client.request(42, {}, {});',
          'export const nested = () => client.request(config.meta, {}, {});',
          'export const viaFunction = () => client.request(pickTarget, {}, {});',
          'export const notCallExpression = () => client.request(notCall, {}, {});',
          'export const viaFactoryCall = () => client.request(viaFactory, {}, {});',
          'export const noArgumentCall = () => client.request(noArguments, {}, {});',
          'export const unnamedCall = () => client.request(unnamed, {}, {});',
          'export const numericCall = () => client.request(numeric, {}, {});',
          '',
        ].join('\n'),
      });
      try {
        const inventory = await buildContractInventory(root.root);
        expect(inventory.issues).toEqual([]);
        expect(inventory.methods.map((item) => item.name)).toEqual(['CreateTrade', 'FastCharge']);
      } finally {
        root.cleanup();
      }
    },
  );

  it('derives prefix and types from each declaration site in a controlled root', async () => {
    const root = declarationRoot({ prefix: 'template-contract-nontrade-' });
    try {
      const inventory = await buildContractInventory(root.root);
      expect(inventory.issues).toEqual([]);
      expect(inventory.methods.map((item) => item.name)).toEqual(['CreateTrade', 'FastCharge']);
      expect(
        inventory.obligations
          .filter((item) => item.id.includes('FastCharge'))
          .map((item) => item.id.split('#')[0])
          .every((prefix) => prefix === 'infra.pay.v1.FastCharge'),
      ).toBe(true);
      expect(inventory.obligations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'infra.pay.v1.FastCharge#request-mapping#order_no',
            cases: ['mapped-value'],
          }),
          expect.objectContaining({
            id: 'infra.trade.v1.CreateTrade#request-mapping#user_id',
            cases: ['mapped-value'],
          }),
        ]),
      );
    } finally {
      root.cleanup();
    }
  });
});

test.skipIf(!hasRepositoryIdl)(
  'SCN-PROTOCOL-CONTRACT-001 derivation-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-001',
        caseId: 'derivation-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-001',
            caseKey: 'derivation-rules',
            checks: [
              'consumed-methods-only',
              'package-prefix',
              'source-file-from-declaration',
              'non-trade-method-derived',
              'request-fields-from-declaration',
              'invalid-declaration-rejected',
              'complete-obligations',
              'error-catalog-source',
              'empty-declaration',
              'pending-reported',
            ],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    // 示例协议的义务由受控输入派生，示例删除后同一事实仍可复核（ENG-06）。
    const example = exampleInventoryRoot('template-contract-001-');
    const inventory = await buildContractInventory(example.root);
    const declarationSource = readFileSync(
      join(example.root, controlled(example.root).declaration),
      'utf8',
    );

    await check('consumed-methods-only', () => {
      context
        .expect(inventory.methods.map((item) => item.name))
        .toEqual(['CreateTrade', 'QueryTrade']);
      const prefixes = new Set(inventory.obligations.map((item) => item.id.split('#')[0]));
      context
        .expect([...prefixes].sort())
        .toEqual(['idl.error-contract', 'infra.trade.v1.CreateTrade', 'infra.trade.v1.QueryTrade']);
    });
    await check('package-prefix', () => {
      context
        .expect(
          inventory.obligations
            .filter((item) => item.id.startsWith('infra.'))
            .every((item) => item.id.startsWith('infra.trade.v1.')),
        )
        .toBe(true);
    });
    await check('source-file-from-declaration', () => {
      context.expect(inventory.obligations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'infra.trade.v1.QueryTrade#response-mapping#trade.orders.unit_price',
          }),
        ]),
      );
      context
        .expect(declarationSource)
        .toContain('@daqian/template-protocol/generated/idl/infra/trade/v1/trade');
    });
    await check('non-trade-method-derived', async () => {
      const controlledInventory = await (async () => {
        const root = declarationRoot({ prefix: 'template-contract-001-nontrade-' });
        try {
          return await buildContractInventory(root.root);
        } finally {
          root.cleanup();
        }
      })();
      context.expect(controlledInventory.issues).toEqual([]);
      context
        .expect(
          controlledInventory.obligations.some(
            (item) => item.id === 'infra.pay.v1.FastCharge#request-mapping#order_no',
          ),
        )
        .toBe(true);
      context
        .expect(
          controlledInventory.obligations.some(
            (item) => item.id === 'infra.trade.v1.CreateTrade#request-mapping#user_id',
          ),
        )
        .toBe(true);
    });
    await check('request-fields-from-declaration', () => {
      context.expect(inventory.obligations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'infra.trade.v1.CreateTrade#request-mapping#goods_type',
            cases: ['fixed-value'],
          }),
          expect.objectContaining({
            id: 'infra.trade.v1.CreateTrade#request-mapping#items.sku_snapshot',
            cases: ['omitted'],
          }),
        ]),
      );
      const moduleSource = readFileSync(
        join(repositoryRoot, 'scripts/lib/contract-inventory.ts'),
        'utf8',
      );
      context.expect(moduleSource.includes('requestPolicies')).toBe(false);
    });
    await check('invalid-declaration-rejected', async () => {
      const root = declarationRoot({
        generated: [
          ...defaultGeneratedFiles(),
          {
            relative: 'idl/infra/trade/v1/spec-only.ts',
            content: customMethodFile('SpecOnly', { factory: 'defineMethodSpec' }),
          },
        ],
        declaration: [
          "import { SpecOnly } from '@daqian/template-protocol/generated/idl/infra/trade/v1/spec-only';",
          'export const consumedOperations = [{ method: SpecOnly, requestFields: {} }];',
          '',
        ].join('\n'),
        caller: null,
        prefix: 'template-contract-001-invalid-',
      });
      try {
        const invalid = await buildContractInventory(root.root);
        context.expect(invalid.issues.join('\n')).toContain('不是 createMethod 常量');
      } finally {
        root.cleanup();
      }
    });
    await check('complete-obligations', () => {
      const categories = new Set(inventory.obligations.map((item) => item.id.split('#')[1]));
      context
        .expect([...categories].sort())
        .toEqual([
          'business-error',
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
        const scoped = inventory.obligations.filter((item) =>
          item.id.startsWith(`infra.trade.v1.${method}#`),
        );
        context.expect(scoped.length, method).toBeGreaterThan(0);
        for (const obligation of scoped) {
          context.expect(obligation.cases.length, obligation.id).toBeGreaterThan(0);
          context.expect(obligation.requiredIn, obligation.id).toEqual(requiredIn);
        }
      }
      context
        .expect(inventory.discoveries.filter((item) => item.applicability === 'pending'))
        .toEqual([]);
    });
    await check('error-catalog-source', () => {
      const business = inventory.obligations.find(
        (item) => item.id === 'idl.error-contract#business-error#$',
      );
      context.expect([...business!.cases].sort()).toEqual([...businessErrorNames].sort());
    });
    await check('empty-declaration', async () => {
      const root = declarationRoot({
        declaration: 'export const consumedOperations: ReadonlyArray<never> = [];\n',
        caller: null,
        prefix: 'template-contract-001-empty-',
      });
      try {
        const empty = await buildContractInventory(root.root);
        context.expect(empty.issues).toEqual([]);
        context
          .expect(empty.obligations.filter((item) => item.id.startsWith('infra.')))
          .toEqual([]);
        context
          .expect(empty.obligations.map((item) => item.id))
          .toEqual(['idl.error-contract#business-error#$']);
      } finally {
        root.cleanup();
      }
    });
    await check('pending-reported', async () => {
      const root = exampleInventoryRoot('template-contract-derivation-');
      const file = inventoryTradeFile(root.root);
      const original = await readFile(file, 'utf8');
      await writeFile(
        file,
        original.replace(
          'export interface QueryTradeRequest {',
          'export interface QueryTradeRequest {\n  reviewProbe: string;',
        ),
      );
      const mutated = await buildContractInventory(root.root);
      root.cleanup();
      context.expect(mutated.discoveries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'request',
            path: 'review_probe',
            applicability: 'pending',
            authority: null,
          }),
        ]),
      );
      context
        .expect(mutated.issues.join('\n'))
        .toContain('review_probe has no reviewed applicability rule');
      context
        .expect(mutated.obligations.some((item) => item.id.includes('review_probe')))
        .toBe(false);
    });

    context
      .expect(executed.sort())
      .toEqual(
        [
          'complete-obligations',
          'consumed-methods-only',
          'empty-declaration',
          'error-catalog-source',
          'invalid-declaration-rejected',
          'non-trade-method-derived',
          'package-prefix',
          'pending-reported',
          'request-fields-from-declaration',
          'source-file-from-declaration',
        ].sort(),
      );
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
    example.cleanup();
  },
);

test.skipIf(!hasRepositoryIdl)(
  'SCN-PROTOCOL-CONTRACT-005 call-scan-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-005',
        caseId: 'call-scan-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-005',
            caseKey: 'call-scan-rules',
            checks: ['consistent-pass', 'unused-declaration', 'undeclared-call', 'both-call-forms'],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };

    await check('consistent-pass', async () => {
      const root = declarationRoot({ prefix: 'template-contract-005-consistent-' });
      try {
        const inventory = await buildContractInventory(root.root);
        context.expect(inventory.issues).toEqual([]);
      } finally {
        root.cleanup();
      }
    });
    await check('both-call-forms', async () => {
      const root = declarationRoot({ prefix: 'template-contract-005-forms-' });
      try {
        const inventory = await buildContractInventory(root.root);
        context
          .expect(inventory.methods.map((item) => item.name).sort())
          .toEqual(['CreateTrade', 'FastCharge']);
        context.expect(inventory.issues).toEqual([]);
      } finally {
        root.cleanup();
      }
    });
    await check('unused-declaration', async () => {
      const root = declarationRoot({
        caller: null,
        prefix: 'template-contract-005-unused-',
      });
      try {
        const inventory = await buildContractInventory(root.root);
        context.expect(inventory.issues.join('\n')).toContain('未使用的声明：CreateTrade');
        context.expect(inventory.issues.join('\n')).toContain('未使用的声明：FastCharge');
      } finally {
        root.cleanup();
      }
    });
    await check('undeclared-call', async () => {
      const root = declarationRoot({ prefix: 'template-contract-005-undeclared-' });
      const paths = controlled(root.root);
      try {
        writeFixtureFile(
          root.root,
          join(paths.generated, 'idl/infra/trade/v1/extra.ts'),
          customMethodFile('ExtraMethod', {
            meta: [
              '  {',
              "    method: 'POST',",
              "    path: '/api/base/extra',",
              "    name: 'ExtraMethod',",
              "    requestType: 'ExtraMethodRequest',",
              "    responseType: 'ExtraMethodResponse',",
              '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '  } as never',
            ].join('\n'),
          }),
        );
        writeFixtureFile(
          root.root,
          paths.caller,
          [
            "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
            "import { FastCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/pay';",
            "import { ExtraMethod } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
            'declare const client: { request(meta: unknown, request: unknown, context: unknown): Promise<unknown> };',
            'const tradeMeta = CreateTrade.meta;',
            'export const createTrade = () => client.request(tradeMeta, {}, {});',
            'export const fastCharge = () => client.request(FastCharge, {}, {});',
            'export const extra = () => client.request(ExtraMethod, {}, {});',
            '',
          ].join('\n'),
        );
        const inventory = await buildContractInventory(root.root);
        context.expect(inventory.issues.join('\n')).toContain('未声明的调用：ExtraMethod');
        context.expect(inventory.issues.join('\n')).toContain('caller.ts');
      } finally {
        root.cleanup();
      }
    });

    context
      .expect(executed.sort())
      .toEqual(['both-call-forms', 'consistent-pass', 'undeclared-call', 'unused-declaration']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);

test.skipIf(!hasRepositoryIdl)(
  'SCN-PROTOCOL-CONTRACT-010 context-obligation',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-010',
        caseId: 'context-obligation',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-010',
            caseKey: 'context-obligation',
            checks: ['obligation-header'],
          },
        ],
      },
    },
  },
  async (context: TestContext) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };

    const root = exampleInventoryRoot('template-contract-010-');
    const obligations = (await buildContractInventory(root.root)).obligations;
    root.cleanup();
    const headerObligations = obligations.filter((item) => item.id.endsWith('#header-base-req#$'));

    await check('obligation-header', () => {
      context.expect(headerObligations.length).toBeGreaterThan(0);
      for (const obligation of headerObligations) {
        // 公共请求上下文义务校验 X-Request-Id 的头名与格式（PC-05）。
        context.expect(obligation.cases, obligation.id).toContain('x-request-id-header');
        context.expect(obligation.cases, obligation.id).toContain('x-request-id-format');
        context.expect(obligation.cases, obligation.id).toContain('base-req-request-id');
        // 不再引用旧的 request_id 头名。
        context.expect(obligation.cases, obligation.id).not.toContain('request-id-header');
        context
          .expect(
            obligation.cases.filter((item) => item.includes('request_id')),
            obligation.id,
          )
          .toEqual([]);
      }
    });

    context.expect(executed).toEqual(['obligation-header']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
