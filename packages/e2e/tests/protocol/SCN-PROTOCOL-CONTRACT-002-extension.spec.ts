// 一次性回归证据（PC-01）：使用方在示例保留的前提下于标记外新增一个含 oneof 响应的消费接口，
// 只需在声明里登记方法与请求字段策略、在矩阵 Fixture 里按分支补多条响应，
// 示例断言、声明与调用的双向对账、以及该接口派生的每条义务的取证都照常成立。
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'vitest';
import {
  CreateTrade,
  CreateTradePay,
  QueryTrade,
} from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';
import { discoverDeclaredRoutes, type RunningShadowServer } from '@template-test/protocol';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { lineInRanges, markedLineRanges } from '../../../../scripts/lib/example-markers.ts';
import { declarationRoot, writeFixtureFile } from '../tooling/declaration-fixture.ts';
import { declaredObligationKeys, executeMatrixEvidence } from './matrix-evidence.ts';
import { matrixContext, type MatrixEntry, type MatrixFixture } from './matrix-support.ts';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const declarationPath = 'packages/sdk/src/consumed-operations.ts';
const fixturePath = 'packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json';

/** 使用方在标记外新增的接口：请求字段策略含 omitted，响应是 oneof（三个分支）。 */
const extensionEntry = [
  '  {',
  '    method: CreateTradePay,',
  '    requestFields: {',
  "      trade_no: { cases: ['mapped-value'], authority: extensionAuthority },",
  "      channel: { cases: ['fixed-value'], authority: extensionAuthority },",
  "      open_id: { cases: ['omitted'], authority: extensionAuthority },",
  "      app_id: { cases: ['configured-value'], authority: extensionAuthority },",
  "      client_platform: { cases: ['configured-value'], authority: extensionAuthority },",
  "      xpay_env: { cases: ['mapped-value'], authority: extensionAuthority },",
  "      base_req: { cases: ['generated-value'], authority: extensionAuthority },",
  "      'base_req.request_id': { cases: ['generated-value'], authority: extensionAuthority },",
  "      'base_req.product_id': {",
  "        cases: ['configured-value', 'omitted'],",
  '        authority: extensionAuthority,',
  '      },',
  '    },',
  '  },',
].join('\n');

/** 声明模块与调用方共同引用的 generated 模块。 */
const generatedModule = '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';

/**
 * 声明里示例片段内登记的方法名（示例删除后为空）：从仓库当前声明机械读取，
 * 不在用例里另写一份名单，这样示例保留与删除两种状态下都成立。
 */
function markedExampleMethods(source: string): string[] {
  const ranges = markedLineRanges(declarationPath, source);
  return source.split('\n').flatMap((line, index) => {
    const match = /^\s*method: (\w+),/.exec(line);
    return match && lineInRanges(ranges, index + 1) ? [match[1]!] : [];
  });
}

/** 调用方源码：只为给定方法发请求，保证声明与调用的双向对账在每种状态下都是 0 问题。 */
function callerSourceFor(names: ReadonlyArray<string>): string {
  const unique = [...new Set(names)];
  const calls = unique.map(
    (name) =>
      `export const ${name[0]!.toLowerCase()}${name.slice(1)} = () => protocol.request(${name}.meta, request, {});`,
  );
  return [
    `import { ${unique.join(', ')} } from '${generatedModule}';`,
    '',
    'declare const protocol: {',
    '  request(meta: unknown, request: unknown, context: unknown): Promise<unknown>;',
    '};',
    '',
    'const request = {};',
    '',
    ...calls,
    '',
  ].join('\n');
}

/**
 * 使用方新增条目自带的评审依据：示例片段里的 `requestAuthority` 会随示例一起删除，
 * 所以使用方在标记外新增接口时必须自己声明，不能引用示例片段里的常量。
 */
const extensionAuthorityDeclaration = [
  '',
  '/** 使用方为示例外新增接口登记的评审依据。 */',
  'const extensionAuthority =',
  "  'protocol-contract Spec PC-01；第四轮回归证据：示例外新增的消费接口';",
  '',
].join('\n');

/** 声明源码的拆分结果：数组行（含）之前的头部、标记内条目与标记外条目。 */
type DeclarationParts = Readonly<{
  header: ReadonlyArray<string>;
  markedEntries: ReadonlyArray<string>;
  outsideEntries: ReadonlyArray<string>;
}>;

/**
 * 把声明源码拆成头部、标记内条目与标记外条目：条目边界按花括号层级判定，
 * 标记区间来自 example-markers 的共享实现，不在用例里另写一份标记语法。
 */
function declarationParts(source: string): DeclarationParts {
  const lines = source.split('\n');
  const ranges = markedLineRanges(declarationPath, source);
  const arrayLine = lines.findIndex((line) => line.includes('export const consumedOperations'));
  if (arrayLine < 0) throw new Error('声明模块未导出 consumedOperations 数组');
  const endLine = lines.findIndex((line, index) => index > arrayLine && line.trim() === '];');
  if (endLine < 0) throw new Error('声明模块的数组结尾未按预期匹配');
  const markedEntries: string[] = [];
  const outsideEntries: string[] = [];
  let current: string[] | null = null;
  let depth = 0;
  for (let index = arrayLine + 1; index < endLine; index += 1) {
    const line = lines[index]!;
    if (current === null) {
      if (line.trim() !== '{') continue;
      current = [line];
      depth = 1;
      continue;
    }
    current.push(line);
    depth += [...line].filter((character) => character === '{').length;
    depth -= [...line].filter((character) => character === '}').length;
    if (depth <= 0) {
      (lineInRanges(ranges, index + 1) ? markedEntries : outsideEntries).push(current.join('\n'));
      current = null;
    }
  }
  return { header: lines.slice(0, arrayLine + 1), markedEntries, outsideEntries };
}

/**
 * 合成声明：仓库声明的头部 + 指定条目 + 使用方评审依据；缺少 CreateTradePay 导入时补上。
 * 头部取自标记外（含 generated 导入与声明类型），因此合成结果与仓库声明的形态一致。
 */
function syntheticDeclaration(source: string, entries: ReadonlyArray<string>): string {
  const { header } = declarationParts(source);
  const text = [...header, ...entries, '];', extensionAuthorityDeclaration.trim(), ''].join('\n');
  const imported = new RegExp(`^import[^;]*\\bCreateTradePay\\b[^;]*from\\s`, 'm');
  return imported.test(source)
    ? text
    : `import { CreateTradePay } from '${generatedModule}';\n${text}`;
}

/**
 * A6 口径：合成声明只取**标记内**的示例条目，再追加使用方新增条目，
 * 不读使用方写在标记外的条目（重复声明同名接口会让路由与义务重复登记）。
 * 示例片段已被删除的副本里没有标记，此时合成声明只剩使用方新增条目。
 */
function extendedDeclaration(source: string): string {
  const { markedEntries } = declarationParts(source);
  const entries =
    markedEntries.length > 0
      ? [
          '  // template-example:begin',
          ...markedEntries,
          '  // template-example:end',
          extensionEntry,
        ]
      : [extensionEntry];
  return syntheticDeclaration(source, entries);
}

/** 与仓库 Fixture 同形的响应底座：公共响应字段都要有可取证的值（PC-01 的字段义务）。 */
const baseResponse = {
  tradeNo: 'pay-matrix',
  paymentNo: 'payment-matrix',
  channel: 'CHANNEL_WECHAT_VIRTUAL',
  expireTime: '1800000000000',
  baseResp: {
    requestId: 'matrix-response',
    success: false,
    error: {
      message: 'matrix-message',
      details: { field: 'value' },
      retryable: true,
      source: 'trade',
      canonicalCode: 'CANONICAL_ERROR_CODE_UNAVAILABLE',
      bizCode: '123',
      bizCodeName: 'MatrixError',
    },
    serverTimeMs: '1700000000000',
    statusCode: '123',
    statusMsg: 'matrix-status',
  },
};

/** 每个 oneof 分支一条响应：一条响应只带一个分支（PC-04 的同形校验会拒收多分支）。 */
const branchResponses = [
  {
    ...baseResponse,
    payParams: {
      wechatJsapi: {
        appId: 'wx-app',
        timeStamp: '1700000000',
        nonceStr: 'nonce-matrix',
        package: 'prepay_id=wx-matrix',
        signType: 'RSA',
        paySign: 'sign-matrix',
      },
    },
  },
  {
    ...baseResponse,
    payParams: { wechatNative: { codeUrl: 'weixin://wxpay/bizpayurl?pr=matrix' } },
  },
  {
    ...baseResponse,
    payParams: {
      wechatVirtual: {
        signData: '{"openid":"matrix"}',
        paySig: 'pay-sig-matrix',
        signature: 'signature-matrix',
        mode: 'short_series_goods',
      },
    },
  },
];

const extensionFixture = {
  request: {
    tradeNo: 'trade-matrix',
    channel: 'CHANNEL_WECHAT_VIRTUAL',
    openId: 'open-matrix',
    appId: 'wx-app',
    clientPlatform: 'android',
    xpayEnv: 'XPAY_ENV_SANDBOX',
    baseReq: { productId: 'matrix-product' },
  },
  responses: branchResponses,
  // 声明里 cases 含 omitted 的字段都要有逐字段省略样例。
  omitted: ['open_id', 'base_req.product_id'],
};

/** 仓库 generated 里与本次回归相关的全部方法常量：示例的两个接口与新增的 oneof 接口。 */
const allMethods = [CreateTrade, QueryTrade, CreateTradePay];
const running = new Set<RunningShadowServer>();
afterEach(async () => {
  await Promise.all([...running].map((server) => server.close()));
  running.clear();
});

test(
  'SCN-PROTOCOL-CONTRACT-002 protocol-matrix-extension',
  {
    timeout: 120_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-002',
        caseId: 'protocol-matrix-extension',
        environment: 'integration',
        binding: 'sdk-idl-weapp',
        fixtureCase: 'protocol-matrix',
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
        ],
      },
    },
  },
  async (context) => {
    const expect = context.expect;
    const before = expect.getState().assertionCalls;
    // 本用例的 checkpoint 必须在绑定登记的 checks 内（GATE-11）；义务级判定由共享实现完成，
    // 只做断言、不单独登记，避免报告里出现未登记的 checkpoint。
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void | Promise<void>) => {
      await assertion();
      executed.push(name);
    };
    const checkpoints = [
      'obligations-covered',
      'real-client-path',
      'routes-from-declaration',
      'matrix-iterates-declaration',
    ];
    // 声明与调用都由仓库当前内容派生（A6）：只取**标记内**的示例条目，再追加使用方新增的接口，
    // 不读使用方写在标记外的条目——同一接口声明两次会让方法与义务重复登记，双向对账随之为 1。
    const declarationSource = readFileSync(resolve(repositoryRoot, declarationPath), 'utf8');
    const exampleNames = markedExampleMethods(declarationSource);
    const declaredNames = [...new Set([...exampleNames, 'CreateTradePay'])];
    const methods = allMethods.filter((method) => declaredNames.includes(method.meta.name));
    expect(methods.map((method) => method.meta.name)).toContain('CreateTradePay');
    const operations = methods.map((method) => ({ method }));
    const routes = discoverDeclaredRoutes(methods);
    const controlled = declarationRoot({
      generatedFromRepository: true,
      declaration: extendedDeclaration(declarationSource),
      caller: callerSourceFor(declaredNames),
      prefix: 'protocol-declaration-extension-',
    });
    const root = controlled.root;
    try {
      const baseFixture = JSON.parse(
        readFileSync(resolve(repositoryRoot, fixturePath), 'utf8'),
      ) as Record<string, MatrixEntry>;
      // 矩阵数据同样只取示例键再加使用方新增键：使用方写在标记外的其他键不搬进来（A6）。
      const fixtureData: Record<string, MatrixEntry> = { CreateTradePay: extensionFixture };
      for (const name of exampleNames) {
        const entry = baseFixture[name];
        if (!entry) throw new Error(`示例键缺少接口 ${name} 的数据`);
        fixtureData[name] = entry;
      }
      writeFixtureFile(root, fixturePath, `${JSON.stringify(fixtureData, null, 2)}\n`);
      const fixture = JSON.parse(readFileSync(join(root, fixturePath), 'utf8')) as MatrixFixture;

      // declaration-registered（EX-012 的示例断言）：标记内的示例条目仍恰好是示例的两个接口；
      // 示例片段已被删除的副本里没有标记，示例条目自然也为空。
      const declarationFile = declarationPath;
      const extendedSource = readFileSync(join(root, declarationFile), 'utf8');
      const ranges = markedLineRanges(declarationFile, extendedSource);
      const entryLine = (name: string) => {
        const index = extendedSource.indexOf(`method: ${name},`);
        return index < 0 ? -1 : extendedSource.slice(0, index).split('\n').length;
      };
      expect(markedExampleMethods(extendedSource)).toEqual(
        ranges.length > 0 ? ['CreateTrade', 'QueryTrade'] : [],
      );
      expect(lineInRanges(ranges, entryLine('CreateTradePay'))).toBe(false);

      // declaration-matches-calls：使用方只改声明与 Fixture 后，双向对账为 0 问题。
      const inventory = await buildContractInventory(root);
      expect(inventory.issues).toEqual([]);
      expect(inventory.methods.map((item) => item.name).sort()).toEqual(
        methods.map((method) => method.meta.name).sort(),
      );

      // obligations-from-declaration：oneof 的每个分支各自派生义务（含分支子字段）。
      const branchObligations = [
        'pay_params.wechat_jsapi',
        'pay_params.wechat_native',
        'pay_params.wechat_virtual',
      ].map((path) => `infra.trade.v1.CreateTradePay#response-mapping#${path}`);
      for (const id of branchObligations)
        expect(inventory.obligations.map((item) => item.id)).toContain(id);
      expect(
        inventory.obligations.filter((item) => item.id.includes('#response-mapping#pay_params'))
          .length,
      ).toBeGreaterThan(branchObligations.length);

      await check('routes-from-declaration', () => {
        expect(routes.map((route) => route.methodName)).toEqual([
          ...methods.map((method) => method.meta.name),
        ]);
        expect(routes.length).toBe(methods.length);
        expect(routes.every((route) => typeof route.validateResponse === 'function')).toBe(true);
      });

      await check('matrix-iterates-declaration', () => {
        for (const method of methods)
          expect(Object.prototype.hasOwnProperty.call(fixture, method.meta.name)).toBe(true);
      });

      // 真实执行：三条响应各发一次请求、每个 omitted 字段一次省略请求、一条不配置上下文，
      // 再走通信错误/响应处理/超时分支；逐义务判定由共享实现给出。
      const summary = await executeMatrixEvidence({
        operations,
        fixture,
        inventory,
        routes,
        environmentClass: 'integration',
        context: matrixContext(),
        servers: running,
        checkpoint: async (_name, assertion) => assertion(),
      });
      const derived = declaredObligationKeys(
        inventory,
        methods.map((method) => method.meta.name),
      );

      await check('obligations-covered', () => {
        expect(summary.missingSamples, '声明 omitted 却没有省略样例的字段').toEqual([]);
        expect(summary.missingEvidence, '找不到取证响应的义务').toEqual([]);
        expect(summary.covered.length).toBe(derived.length);
        expect(derived.length).toBeGreaterThan(0);
        // 每条 oneof 分支义务都由分支对应的那条响应取证。
        for (const path of ['wechat_jsapi', 'wechat_native', 'wechat_virtual'])
          expect(summary.covered).toContain(
            `infra.trade.v1.CreateTradePay#response-mapping#pay_params.${path}/decoded-branch`,
          );
      });

      await check('real-client-path', () => {
        for (const name of methods.map((method) => method.meta.name)) {
          const entry = fixture[name]!;
          // 每条响应一条请求、每个 omitted 字段一条省略样例、一条不配置上下文。
          expect(summary.runs[name]!.records.length, name).toBe(
            entry.responses.length + (entry.omitted ?? []).length + 1,
          );
          expect(summary.runs[name]!.results.every((result) => result.ok)).toBe(true);
        }
      });

      // 反例：少一条分支响应时，门禁报出该分支缺证的义务（按义务 ID 指出）。
      const withoutNative = {
        ...fixture,
        CreateTradePay: {
          ...extensionFixture,
          responses: branchResponses.filter((response) => !('wechatNative' in response.payParams!)),
        },
      } as MatrixFixture;
      const missing = await executeMatrixEvidence({
        operations: [{ method: CreateTradePay }],
        fixture: withoutNative,
        inventory,
        routes,
        environmentClass: 'integration',
        context: matrixContext(),
        servers: running,
      });
      expect(missing.missingEvidence).toContain(
        'infra.trade.v1.CreateTradePay#response-mapping#pay_params.wechat_native/decoded-branch',
      );
      expect(missing.missingEvidence).toContain(
        'infra.trade.v1.CreateTradePay#response-mapping#pay_params.wechat_native/wire-present',
      );
      expect(missing.missingEvidence).toContain(
        'infra.trade.v1.CreateTradePay#response-mapping#pay_params.wechat_native.code_url/decoded-value',
      );
      // 其余分支的取证不受影响：报出的只有缺证的那条分支。
      expect(missing.missingEvidence.every((id) => id.includes('wechat_native'))).toBe(true);

      // 反例：声明了 omitted 却没有逐字段省略样例时，门禁按义务 ID 报出该字段。
      const withoutOmissionSample = {
        ...fixture,
        CreateTradePay: { ...extensionFixture, omitted: ['base_req.product_id'] },
      } as MatrixFixture;
      const unsampled = await executeMatrixEvidence({
        operations: [{ method: CreateTradePay }],
        fixture: withoutOmissionSample,
        inventory,
        routes,
        environmentClass: 'integration',
        context: matrixContext(),
        servers: running,
      });
      expect(unsampled.missingSamples).toContain('CreateTradePay#request-mapping#open_id');
      expect(unsampled.missingSamples.every((id) => id.endsWith('#open_id'))).toBe(true);

      expect(executed.sort()).toEqual([...checkpoints].sort());
      await context.annotate(
        JSON.stringify({
          assertions: expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    } finally {
      controlled.cleanup();
    }
  },
);
