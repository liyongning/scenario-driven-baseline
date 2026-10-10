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
import { matrixContext, type MatrixFixture } from './matrix-support.ts';

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

/** 调用方源码：只为真正登记在声明里的方法发请求，保证双向对账在两种状态下都是 0 问题。 */
function callerSourceFor(exampleNames: ReadonlyArray<string>): string {
  const names = [...exampleNames, 'CreateTradePay'];
  const calls = names.map(
    (name) =>
      `export const ${name[0]!.toLowerCase()}${name.slice(1)} = () => protocol.request(${name}.meta, request, {});`,
  );
  return [
    `import { ${names.join(', ')} } from '${generatedModule}';`,
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

/**
 * 真实声明 + 标记外新增条目：模拟使用方只改声明模块，不碰示例片段。
 * 示例片段已被删除的副本里没有结束标记，此时直接把使用方条目追加到声明数组末尾。
 */
function extendedDeclaration(source: string): string {
  const withImport = `import { CreateTradePay } from '${generatedModule}';\n${source}`;
  // 条目写在示例片段的结束标记之后：模拟使用方在标记外新增，不碰示例片段。
  const marker = '  // template-example:end\n];';
  if (withImport.includes(marker))
    return withImport.replace(
      marker,
      `  // template-example:end\n${extensionEntry}\n];${extensionAuthorityDeclaration}`,
    );
  // 副本在删除片段后运行过 `pnpm format`：声明数组可能保留多行（`\n];`），
  // 也可能被折叠成一行空数组（`[];`），两种结尾都要能追加。
  const multiLine = withImport.lastIndexOf('\n];');
  if (multiLine !== -1)
    return `${withImport.slice(0, multiLine)}\n${extensionEntry}${withImport.slice(multiLine)}${extensionAuthorityDeclaration}`;
  const emptyArray = withImport.lastIndexOf('[]');
  if (emptyArray !== -1)
    return `${withImport.slice(0, emptyArray)}[\n${extensionEntry}\n]${withImport.slice(emptyArray + 2)}${extensionAuthorityDeclaration}`;
  throw new Error('声明模块的数组结尾未按预期匹配');
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
    // 声明与调用都由仓库当前内容派生：示例保留时含示例条目，示例删除后只剩使用方新增的接口。
    const declarationSource = readFileSync(resolve(repositoryRoot, declarationPath), 'utf8');
    const exampleNames = markedExampleMethods(declarationSource);
    const declaredNames = [...exampleNames, 'CreateTradePay'];
    const methods = allMethods.filter((method) => declaredNames.includes(method.meta.name));
    expect(methods.map((method) => method.meta.name)).toContain('CreateTradePay');
    const operations = methods.map((method) => ({ method }));
    const routes = discoverDeclaredRoutes(methods);
    const controlled = declarationRoot({
      generatedFromRepository: true,
      declaration: extendedDeclaration(declarationSource),
      caller: callerSourceFor(exampleNames),
      prefix: 'protocol-declaration-extension-',
    });
    const root = controlled.root;
    try {
      const baseFixture = JSON.parse(
        readFileSync(resolve(repositoryRoot, fixturePath), 'utf8'),
      ) as Record<string, unknown>;
      writeFixtureFile(
        root,
        fixturePath,
        `${JSON.stringify({ ...baseFixture, CreateTradePay: extensionFixture }, null, 2)}\n`,
      );
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
