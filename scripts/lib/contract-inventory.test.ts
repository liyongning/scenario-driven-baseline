import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, test, type TestContext } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  declarationRoot,
  defaultGeneratedFiles,
  writeFixtureFile,
} from '../../packages/e2e/tests/tooling/declaration-fixture.ts';
import { evaluateCoverage } from '../check-scenarios.ts';
import { buildContractInventory } from './contract-inventory.ts';
import { loadProjectManifest, packageByRole, testProjectsByClass } from './project-manifest.ts';

/** 模板自身事实核验：只读真实仓库已提交的协议产物与清单，不依赖调用方工作目录。 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const generated = join(repositoryRoot, 'packages/protocol/src/generated');
const tradeFile = 'generated/idl/infra/trade/v1/trade.ts';
/** 义务运行环境由清单派生：路由、字段与共享方法要求全部 integration 与 platform 项目。 */
const requiredIn = testProjectsByClass(loadProjectManifest(repositoryRoot), [
  'integration',
  'platform',
]);
const businessErrorNames = [
  'ErrGatewayProxyInvalidParameter',
  'ErrGatewayProxyUnauthorized',
  'ErrGatewayProxyNotFound',
  'ErrInfraTradeQueryTradeUnauthorized',
  'ErrInfraTradeQueryTradeInvalidParameter',
  'ErrInfraTradeQueryTradeNotFound',
  'ErrInfraTradeQueryTradeUnavailable',
];

async function copyGenerated(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await cp(generated, join(root, 'generated'), { recursive: true });
  return { root, file: join(root, tradeFile) };
}

/** 受控临时根中的包目录由清单推导，测试不写死包名与目录。 */
function controlled(root: string) {
  const manifest = loadProjectManifest(root);
  const product = packageByRole(manifest, 'product');
  const protocol = packageByRole(manifest, 'protocol');
  return {
    declaration: `packages/${product.directory}/src/consumed-operations.ts`,
    caller: `packages/${product.directory}/src/caller.ts`,
    generated: `packages/${protocol.directory}/src/generated`,
    protocolSrc: `packages/${protocol.directory}/src`,
  };
}

function customMethodFile(
  name: string,
  options: Readonly<{
    factory?: string;
    meta?: string;
    cast?: string;
    extra?: string;
    request?: string;
    response?: string;
  }> = {},
) {
  return [
    "import { createMethod, defineMethodSpec } from '../../../../std';",
    '',
    `export interface ${name}Request {`,
    options.request ?? '  user_id?: string;',
    '}',
    `export interface ${name}Response {`,
    options.response ?? '  trade_no?: string;',
    '}',
    `export const ${name} = ${options.factory ?? 'createMethod'}(`,
    options.meta ?? `  { name: '${name}' }`,
    `)${options.cast ?? ''};`,
    options.extra ?? '',
    '',
  ].join('\n');
}

describe('buildContractInventory', () => {
  // 副本内（SCN-SCENARIO-GATE-026）负载叠加时默认 5s 超时不够，显式放宽。
  it('derives obligations for the example protocol only', { timeout: 30_000 }, async () => {
    const inventory = await buildContractInventory(repositoryRoot);
    expect(inventory.methods).toEqual([
      { name: 'CreateTrade', method: 'POST', path: '/api/base/trade/create' },
      { name: 'QueryTrade', method: 'POST', path: '/api/base/trade/query' },
    ]);
    expect(inventory.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#http-route#$',
          cases: ['CreateTrade'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#user_id',
          cases: ['mapped-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#goods_type',
          cases: ['fixed-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#items.sku_snapshot',
          cases: ['omitted'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#request-mapping#discount_amount',
          cases: ['fixed-value'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#response-mapping#order_nos',
          cases: ['decoded-value', 'decoded-default'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.CreateTrade#encoding-boundary#response.order_nos',
          cases: ['response-repeated-array'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#request-mapping#sync_channel',
          cases: ['omitted'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#response-mapping#trade.orders.refund_status',
        }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#header-base-req#$' }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#encoding-boundary#response.trade.orders.unit_price',
          cases: expect.arrayContaining(['response-json-int64-string']),
        }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#response-handling#$' }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#error-handling#$' }),
        expect.objectContaining({ id: 'infra.trade.v1.QueryTrade#timeout#$' }),
        expect.objectContaining({
          id: 'idl.error-contract#business-error#$',
          cases: expect.arrayContaining(['ErrInfraTradeQueryTradeUnavailable']),
        }),
      ]),
    );
    expect(inventory.obligations.some((item) => item.id.includes('CreateTradePay'))).toBe(false);
    expect(new Set(inventory.obligations.map((item) => item.id)).size).toBe(
      inventory.obligations.length,
    );
    for (const obligation of inventory.obligations) {
      expect(obligation.cases.length, obligation.id).toBeGreaterThan(0);
      expect(obligation.requiredIn.length, obligation.id).toBeGreaterThan(0);
    }
    expect(inventory.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'CreateTrade',
          direction: 'request',
          path: 'user_id',
          applicability: 'applicable',
          authority: expect.stringContaining('Design'),
        }),
        expect.objectContaining({
          method: 'QueryTrade',
          direction: 'response',
          path: 'trade.orders.refund_status',
          applicability: 'applicable',
          authority: expect.stringContaining('Design'),
        }),
      ]),
    );
    expect(inventory.discoveries.filter((item) => item.applicability === 'pending')).toEqual([]);
    expect(inventory.issues).toEqual([]);
  });

  it('derives a newly reachable field and leaves it missing without a binding', async () => {
    const { root, file } = await copyGenerated('template-contract-added-field-');
    const original = await readFile(file, 'utf8');
    await writeFile(
      file,
      original.replace(
        'export interface QueryTradeResponse {',
        'export interface QueryTradeResponse {\n  reviewProbe: string;',
      ),
    );
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
    const obligation = inventory.obligations.find(
      (item) => item.id === 'infra.trade.v1.QueryTrade#response-mapping#review_probe',
    );
    expect(obligation).toEqual(
      expect.objectContaining({ cases: ['decoded-value', 'decoded-default'] }),
    );
    const coverage = evaluateCoverage({
      current: {
        runId: 'controlled',
        sourceDigest: 'source',
        specDigest: 'spec',
        protocolDigest: 'idl',
        fixtureDigest: 'fixture',
      },
      scenarios: [],
      contracts: inventory.obligations.map((item) => ({
        ...item,
        requiredIn: [...item.requiredIn],
      })),
      flows: [],
      bindings: [],
      reports: [],
      sourceIssues: [],
      reductionReasons: {},
    });
    expect(coverage.issues).toContain(
      'infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-value: missing binding for integration',
    );
    expect(coverage.issues).toContain(
      'infra.trade.v1.QueryTrade#response-mapping#review_probe/decoded-default: missing binding for weapp',
    );
  });

  it('keeps unreviewed request fields and unknown encodings visible as pending issues', async () => {
    const { root, file } = await copyGenerated('template-contract-pending-field-');
    const original = await readFile(file, 'utf8');
    await writeFile(
      file,
      original
        .replace(
          'export interface QueryTradeRequest {',
          'export interface QueryTradeRequest {\n  reviewProbe: string;',
        )
        .replace(
          'export interface QueryTradeResponse {',
          'export interface QueryTradeResponse {\n  cycle?: QueryTradeResponse;\n  opaqueProbe: unknown;',
        ),
    );
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
    expect(inventory.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'request',
          path: 'review_probe',
          applicability: 'pending',
          authority: null,
        }),
        expect.objectContaining({
          direction: 'response',
          path: 'opaque_probe',
          applicability: 'pending',
          encoding: null,
        }),
        expect.objectContaining({
          direction: 'response',
          path: 'cycle',
          applicability: 'applicable',
          encoding: 'nested-object',
        }),
      ]),
    );
    expect(inventory.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('review_probe has no reviewed applicability rule'),
        expect.stringContaining('opaque_probe has no approved encoding rule'),
      ]),
    );
    expect(
      inventory.obligations.some(
        (item) => item.id.includes('review_probe') || item.id.includes('opaque_probe'),
      ),
    ).toBe(false);
  });

  it('treats a single-params union as oneof branches and rejects malformed shapes', async () => {
    const { root, file } = await copyGenerated('template-contract-oneof-');
    const original = await readFile(file, 'utf8');
    const probes = [
      'interface OneofProbe { params: { $case: "alpha"; alpha: string } | { $case: "beta"; beta: string } | { $case: "gamma"; gamma: { nested: string } } }',
      'interface SingleFieldProbe { only: string }',
    ].join('\n');
    const patched = original.replace(
      'export interface QueryTradeResponse {',
      `${probes}\nexport interface QueryTradeResponse {\n  probe?: OneofProbe | undefined;\n  single?: SingleFieldProbe | undefined;`,
    );
    await writeFile(file, patched);
    const inventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(root, 'generated'),
    });
    expect(inventory.discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'probe',
          encoding: 'oneof-object',
          oneofBranch: false,
          applicability: 'applicable',
        }),
        expect.objectContaining({
          path: 'probe.alpha',
          oneofBranch: true,
          encoding: 'json-string',
        }),
        expect.objectContaining({
          path: 'single.only',
          oneofBranch: false,
          encoding: 'json-string',
        }),
      ]),
    );
    expect(inventory.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#response-mapping#probe',
          cases: ['decoded-value', 'decoded-absence', 'wire-present', 'wire-absent'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#response-mapping#probe.alpha',
          cases: ['decoded-branch', 'wire-present', 'wire-absent'],
        }),
        expect.objectContaining({
          id: 'infra.trade.v1.QueryTrade#encoding-boundary#response.probe',
          cases: ['response-oneof-object', 'response-optional-absence'],
        }),
      ]),
    );
    expect(inventory.issues).toEqual([]);

    const malformed = await copyGenerated('template-contract-malformed-oneof-');
    await writeFile(
      malformed.file,
      patched.replace('alpha: string }', 'alpha: string; unexpected: string }'),
    );
    const malformedInventory = await buildContractInventory(repositoryRoot, {
      generatedRoot: join(malformed.root, 'generated'),
    });
    expect(malformedInventory.issues).toContain(
      'QueryTrade response field probe.params has no approved encoding rule',
    );
  });

  it('fails loudly when a declared type is missing from generated output', async () => {
    const root = declarationRoot({
      generated: [
        {
          relative: 'idl/infra/trade/v1/trade.ts',
          content: customMethodFile('CreateTrade', {
            meta: [
              '  {',
              "    method: 'POST',",
              "    path: '/api/base/trade/create',",
              "    name: 'CreateTrade',",
              "    requestType: 'CreateTradeRequest',",
              "    responseType: 'MissingResponse',",
              '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '  }',
            ].join('\n'),
          }),
        },
      ],
      declaration: [
        "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
        'export const consumedOperations = [',
        "  { method: CreateTrade, requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
        '];',
        '',
      ].join('\n'),
      caller: null,
    });
    try {
      await expect(buildContractInventory(root.root)).rejects.toThrow(
        'missing type MissingResponse',
      );
    } finally {
      root.cleanup();
    }
  });

  it(
    'reports each invalid declaration instead of deriving silently',
    { timeout: 30_000 },
    async () => {
      const root = declarationRoot({ caller: null, prefix: 'template-contract-invalid-' });
      const paths = controlled(root.root);
      const write = (relative: string, content: string) =>
        writeFixtureFile(root.root, join(relative), content);
      const generatedFile = (relative: string, content: string) =>
        write(join(paths.generated, relative), content);
      try {
        generatedFile('idl/infra/pay/v1/pay.ts', customMethodFile('FastCharge'));
        generatedFile(
          'other/not-idl.ts',
          customMethodFile('NotIdl', {
            meta: [
              '  {',
              "    method: 'POST',",
              "    path: '/api/base/other',",
              "    name: 'NotIdl',",
              "    requestType: 'NotIdlRequest',",
              "    responseType: 'NotIdlResponse',",
              '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '  } as never',
            ].join('\n'),
          }),
        );
        generatedFile(
          'idl/infra/trade/v1/extra.ts',
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
            extra: [
              'const NAME = "Renamed";',
              'export const Renamed = createMethod({',
              "  method: 'POST',",
              "  path: '/api/base/renamed',",
              '  name: NAME,',
              "  requestType: 'RenamedRequest',",
              "  responseType: 'RenamedResponse',",
              '  responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '} as never);',
              'export interface RenamedRequest {',
              '  user_id?: string;',
              '}',
              'export interface RenamedResponse {',
              '  trade_no?: string;',
              '}',
              'export const PlainValue = 1;',
              'const factory = { createMethod };',
              'export const WeirdFactory = factory.createMethod({',
              "  method: 'POST',",
              "  path: '/api/base/weird',",
              "  name: 'WeirdFactory',",
              "  requestType: 'WeirdFactoryRequest',",
              "  responseType: 'WeirdFactoryResponse',",
              '  responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '} as never);',
            ].join('\n'),
          }),
        );
        generatedFile(
          'idl/infra/trade/v1/spec-only.ts',
          customMethodFile('SpecOnly', { factory: 'defineMethodSpec' }),
        );
        generatedFile(
          'idl/infra/trade/v1/bare.ts',
          customMethodFile('Bare', { meta: '  undefined as never' }),
        );
        generatedFile(
          'idl/infra/trade/v1/partial.ts',
          customMethodFile('Partial', { meta: "  { name: 'Partial' }" }),
        );
        generatedFile(
          'idl/infra/trade/v1/numeric-name.ts',
          customMethodFile('NumericName', {
            meta: [
              '  {',
              "    method: 'POST',",
              "    path: '/api/base/numeric',",
              '    name: 42,',
              "    requestType: 'NumericNameRequest',",
              "    responseType: 'NumericNameResponse',",
              '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '  } as never',
            ].join('\n'),
          }),
        );
        generatedFile(
          'idl/infra/trade/v1/function-name.ts',
          customMethodFile('FunctionName', {
            meta: [
              '  {',
              "    method: 'POST',",
              "    path: '/api/base/function-name',",
              '    name: NAME_FN,',
              "    requestType: 'FunctionNameRequest',",
              "    responseType: 'FunctionNameResponse',",
              '    responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
              '  } as never',
            ].join('\n'),
            extra: 'function NAME_FN(): string {\n  return "FunctionName";\n}',
          }),
        );

        const cases: ReadonlyArray<{ declaration: string; expected: string }> = [
          { declaration: 'export const consumedOperations = {};', expected: '未导出数组' },
          {
            declaration: 'const consumedOperations = [];',
            expected: '未导出数组',
          },
          {
            declaration: 'export const consumedOperations = [1 as never];',
            expected: '声明元素不是 { method, requestFields } 对象',
          },
          {
            declaration:
              "export const consumedOperations = [{ method: 'CreateTrade', requestFields: {} }];",
            expected: '无法解析到 generated 方法常量',
          },
          {
            declaration: [
              "import { PlainValue } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
              'export const consumedOperations = [{ method: PlainValue, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '无法解析到 generated 方法常量',
          },
          {
            declaration: [
              "import { WeirdFactory } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
              'export const consumedOperations = [{ method: WeirdFactory, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '不是 createMethod 常量',
          },
          {
            declaration: [
              "import { SpecOnly } from '@daqian/template-protocol/generated/idl/infra/trade/v1/spec-only';",
              'export const consumedOperations = [{ method: SpecOnly, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '不是 createMethod 常量（defineMethodSpec）',
          },
          {
            declaration: [
              "import { NotIdl } from '@daqian/template-protocol/generated/other/not-idl';",
              'export const consumedOperations = [{ method: NotIdl, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '不在 generated/idl/ 下',
          },
          {
            declaration: [
              "import { Bare } from '@daqian/template-protocol/generated/idl/infra/trade/v1/bare';",
              'export const consumedOperations = [{ method: Bare, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '没有可读的 meta 对象',
          },
          {
            declaration: [
              "import { Partial } from '@daqian/template-protocol/generated/idl/infra/trade/v1/partial';",
              'export const consumedOperations = [{ method: Partial, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '缺少 name、method、path、requestType 或 responseType',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              '  { method: CreateTrade, requestFields: [] as never },',
              '];',
              '',
            ].join('\n'),
            expected: 'requestFields 不是对象字面量',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              '  { method: CreateTrade, requestFields: { user_id: 3 as never } },',
              '];',
              '',
            ].join('\n'),
            expected: 'CreateTrade request field user_id has no reviewed applicability rule',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              "  { method: CreateTrade, requestFields: { user_id: { authority: 'PC-01' } as never } },",
              '];',
              '',
            ].join('\n'),
            expected: 'CreateTrade request field user_id has no reviewed applicability rule',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              "  { method: CreateTrade, requestFields: { user_id: { cases: [1] as never, authority: 'PC-01' } } },",
              '];',
              '',
            ].join('\n'),
            expected: 'CreateTrade request field user_id has no reviewed applicability rule',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              "  { method: CreateTrade, requestFields: { ['user_id']: { cases: ['mapped-value'], authority: 'PC-01' } } },",
              '];',
              '',
            ].join('\n'),
            expected: 'CreateTrade request field user_id has no reviewed applicability rule',
          },
          {
            declaration: [
              "import { ExtraMethod } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
              'export const consumedOperations = [',
              "  { method: ExtraMethod, requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
              '];',
              '',
            ].join('\n'),
            expected: '未使用的声明：ExtraMethod',
          },
          {
            declaration: [
              "import { Renamed } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
              'export const consumedOperations = [',
              "  { method: Renamed, requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
              '];',
              '',
            ].join('\n'),
            expected: '未使用的声明：Renamed',
          },
          {
            declaration: 'export const consumedOperations = [{ requestFields: {} }];',
            expected: '无法解析到 generated 方法常量',
          },
          {
            declaration:
              'export const consumedOperations = [{ method: NotImported, requestFields: {} }];',
            expected: '无法解析到 generated 方法常量',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [{ method: CreateTrade }];',
              '',
            ].join('\n'),
            expected: '未使用的声明：CreateTrade',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              "  { method: CreateTrade, requestFields: { user_id: { cases: ['mapped-value'] } } },",
              '];',
              '',
            ].join('\n'),
            expected: 'CreateTrade request field user_id has no reviewed applicability rule',
          },
          {
            declaration: [
              "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
              'export const consumedOperations = [',
              '  {',
              '    method: CreateTrade,',
              "    requestFields: { ...{ user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
              '  },',
              '];',
              '',
            ].join('\n'),
            expected: 'requestFields 的键必须是字段路径',
          },
          {
            declaration: [
              "import { NumericName } from '@daqian/template-protocol/generated/idl/infra/trade/v1/numeric-name';",
              'export const consumedOperations = [{ method: NumericName, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '缺少 name、method、path、requestType 或 responseType',
          },
          {
            declaration: [
              "import { FunctionName } from '@daqian/template-protocol/generated/idl/infra/trade/v1/function-name';",
              'export const consumedOperations = [{ method: FunctionName, requestFields: {} }];',
              '',
            ].join('\n'),
            expected: '缺少 name、method、path、requestType 或 responseType',
          },
        ];
        for (const item of cases) {
          write(paths.declaration, item.declaration);
          const inventory = await buildContractInventory(root.root);
          expect(inventory.issues.join('\n'), item.declaration).toContain(item.expected);
        }

        write(
          paths.declaration,
          [
            "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
            'export const consumedOperations = [',
            "  { method: CreateTrade, requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } } },",
            '];',
            '',
          ].join('\n'),
        );
        writeFixtureFile(
          root.root,
          paths.caller,
          [
            "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
            "import { ExtraMethod } from '@daqian/template-protocol/generated/idl/infra/trade/v1/extra';",
            'declare const client: { request(meta: unknown, request: unknown, context: unknown): Promise<unknown> };',
            'const meta = CreateTrade.meta;',
            'export const declared = () => client.request(meta, {}, {});',
            'export const undeclared = () => client.request(ExtraMethod, {}, {});',
            '',
          ].join('\n'),
        );
        const withCalls = await buildContractInventory(root.root);
        expect(withCalls.issues.join('\n')).toContain('未声明的调用：ExtraMethod');
      } finally {
        root.cleanup();
      }
    },
  );

  it('reports a missing declaration module and treats a missing registration as empty', async () => {
    const missing = declarationRoot({
      consumedOperations: ['packages/sdk/src/absent.ts'],
      caller: null,
      prefix: 'template-contract-missing-module-',
    });
    try {
      const inventory = await buildContractInventory(missing.root);
      expect(inventory.issues).toEqual([expect.stringContaining('声明模块不存在或未进入分析范围')]);
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
  });

  it('reads the business error catalog from a frozen or plain object literal', async () => {
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
  });

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

test(
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
    const inventory = await buildContractInventory(repositoryRoot);
    const declarationSource = await readFile(
      join(repositoryRoot, 'packages/sdk/src/consumed-operations.ts'),
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
      const { root, file } = await copyGenerated('template-contract-derivation-');
      const original = await readFile(file, 'utf8');
      await writeFile(
        file,
        original.replace(
          'export interface QueryTradeRequest {',
          'export interface QueryTradeRequest {\n  reviewProbe: string;',
        ),
      );
      const mutated = await buildContractInventory(repositoryRoot, {
        generatedRoot: join(root, 'generated'),
      });
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
  },
);

test(
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
