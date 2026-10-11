// @SCN-PROTOCOL-CONTRACT-006/007: Shadow 响应与协议同形校验、非法响应显式认领的 module 证据。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { test } from 'vitest';
import {
  CreateTrade,
  CreateTradePay,
  QueryTrade,
} from '../src/generated/idl/infra/trade/v1/trade.ts';
import { collectReachableFields, validateResponseShape } from './idl/response-shape.ts';
import { routesFromRpcMethods } from './shadow/idl-routes.ts';

/** 共用的响应上下文样本，与协议矩阵 Fixture 的字段形态一致。 */
const baseResp = {
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
};

/**
 * 自供的响应样本：第一组代表“Fixture JSON”来源、`{}` 代表缺省字段、测试代码里的字面量
 * 代表“内联 body”来源。校验的是 Shadow 的公共构造规则，不读取示例的协议矩阵 Fixture（ENG-06）。
 */
const fixtureSamples = {
  CreateTrade: [
    {
      tradeNo: 'trade-matrix',
      orderNos: ['order-matrix'],
      status: 'TRADE_STATUS_PAID',
      baseResp,
    },
    {},
  ],
  QueryTrade: [
    {
      trade: {
        tradeNo: 'trade-matrix',
        userId: '9007199254740993',
        status: 'TRADE_STATUS_PAID',
        payAmount: '101',
        channel: 'CHANNEL_WECHAT_VIRTUAL',
        paidTime: '1700000000000',
        orders: [
          {
            orderNo: 'order-matrix',
            bizType: 'sku',
            bizOrderNo: 'biz-order',
            skuId: 'sku-id',
            skuName: 'sample-sku',
            quantity: 2,
            unitPrice: '100',
            payAmount: '190',
            refundedAmount: '10',
            status: 'ORDER_STATUS_PAID',
            refundStatus: 'REFUND_STATUS_PARTIAL_REFUNDED',
            originalAmount: '200',
            discountAmount: '10',
          },
        ],
        expireTime: '1800000000000',
        originalAmount: '111',
        discountAmount: '10',
      },
      baseResp,
    },
  ],
};

type MethodSource = Parameters<typeof routesFromRpcMethods>[0][number];

/** 用 generated 方法常量派生响应结构校验器：与 Shadow 构造期注入的是同一函数。 */
function validatorFor(method: MethodSource): (body: unknown, status?: number) => string[] {
  const route = routesFromRpcMethods([method], [method]).find(
    (candidate) => candidate.methodName === method.name,
  );
  if (!route?.validateResponse) throw new Error(`missing response validator for ${method.name}`);
  return (body, status = 200) => route.validateResponse!(body, status);
}

/**
 * 合成协议描述：覆盖 generated 示例协议里没有出现的编码与动态类型（Any/未知类型、空对象、
 * 自引用、非法 oneof 形态），用于核验同一套派生与校验规则的全部判定分支。
 */
const syntheticSource = [
  'export enum SampleEnum { SAMPLE_A = "SAMPLE_A", SAMPLE_B = "SAMPLE_B" }',
  'export interface Leaf { leafName: string }',
  'export interface Empty {}',
  'export interface Cyclic { next?: Cyclic }',
  'export interface Single { only: string }',
  'export interface GoodOneof {',
  '  params?:',
  '    | { $case: "alpha"; alpha: Leaf }',
  '    | { $case: "betaPayload"; betaPayload: string }',
  '    | undefined;',
  '}',
  'export interface BadOneof {',
  '  params?: { $case: "two"; first: Leaf; second: Leaf } | undefined;',
  '}',
  'export interface HalfOneof {',
  '  params?: { $case: "empty" } | undefined;',
  '}',
  'export interface ListOneof {',
  '  params?:',
  '    | { $case: "list"; list: string[] }',
  '    | { $case: "status"; status: SampleEnum }',
  '    | undefined;',
  '}',
  'export interface SampleResponse {',
  '  textField: string;',
  '  numberField: number;',
  '  bigintField: bigint;',
  '  boolField: boolean;',
  '  enumField: SampleEnum;',
  '  literalEnum: SampleEnum.SAMPLE_A;',
  '  leafField?: Leaf;',
  '  emptyField?: Empty;',
  '  cyclicField?: Cyclic;',
  '  singleField?: Single;',
  '  mapField: { [key: string]: string };',
  '  scalarList: string[];',
  '  objectList: Leaf[];',
  '  oneofList: GoodOneof[];',
  '  dynamicList: any[];',
  '  dynamicField?: unknown;',
  '  unionField?: string | number;',
  '  good?: GoodOneof;',
  '  bad?: BadOneof;',
  '  half?: HalfOneof;',
  '  listOneof?: ListOneof;',
  '}',
].join('\n');

/** 从合成 TS 描述派生可达字段：只依赖编译器 API，不引用仓库真实生成文件。 */
function syntheticFields(): ReturnType<typeof collectReachableFields> {
  const directory = mkdtempSync(join(tmpdir(), 'response-shape-'));
  try {
    const file = join(directory, 'sample.ts');
    writeFileSync(file, syntheticSource, 'utf8');
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    const symbol =
      module && checker.getExportsOfModule(module).find((item) => item.name === 'SampleResponse');
    if (!symbol) throw new Error('synthetic SampleResponse is missing');
    return collectReachableFields(checker, checker.getDeclaredTypeOfSymbol(symbol));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const syntheticShape = syntheticFields();
const syntheticField = (path: string) =>
  syntheticShape.find((field) => field.path === path) ?? ({} as never);

test(
  'SCN-PROTOCOL-CONTRACT-006 idl-validator-rules',
  {
    // 派生校验器要编译 generated 与合成 TS 类型：副本/负载下默认 5s 易误判超时。
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-006',
        caseId: 'idl-validator-rules',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-006',
            caseKey: 'idl-validator-rules',
            checks: [
              'conforming-accepted',
              'absent-default-accepted',
              'unknown-field-rejected',
              'encoding-rejected',
              'oneof-conflict-rejected',
              'idl-issue-path',
              'idl-ignores-status',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const createTrade = validatorFor(CreateTrade.meta);
    const queryTrade = validatorFor(QueryTrade.meta);

    // conforming-accepted：真实 Fixture 响应与 generated 描述同形。
    context.expect(createTrade(fixtureSamples.CreateTrade[0])).toEqual([]);
    context.expect(queryTrade(fixtureSamples.QueryTrade[0])).toEqual([]);
    context.expect(createTrade({ status: 'TRADE_STATUS_PAID' })).toEqual([]);

    // absent-default-accepted：缺少非 presence 字段不判错（空对象与部分字段都接受）。
    context.expect(createTrade({})).toEqual([]);
    context.expect(createTrade(fixtureSamples.CreateTrade[1])).toEqual([]);
    context.expect(queryTrade({})).toEqual([]);
    context.expect(createTrade({ tradeNo: 'TN-1' })).toEqual([]);

    // unknown-field-rejected：顶层与嵌套数组元素里的未知字段都被报出。
    context
      .expect(createTrade({ tradeNo: 'TN-1', unknownField: 'x' }))
      .toEqual(['$.unknownField: 响应类型中不存在的字段']);
    context
      .expect(queryTrade({ trade: { orders: [{ orderNo: 'ON-1', unknownField: 1 }] } }))
      .toEqual(['$.trade.orders[0].unknownField: 响应类型中不存在的字段']);
    // idl-issue-path：结构问题逐条带字段路径。
    context
      .expect(
        [...createTrade({ tradeNo: 1 }), ...queryTrade({ trade: { payAmount: 190 } })].every(
          (issue) => /^\$[.[]/.test(issue),
        ),
      )
      .toBe(true);

    // encoding-rejected：int64 必须是十进制字符串，枚举必须是合法名称，字符串字段不能给别的类型。
    context
      .expect(queryTrade({ trade: { payAmount: 190 } }))
      .toEqual(['$.trade.payAmount: int64 期望十进制字符串，收到 190']);
    context
      .expect(queryTrade({ trade: { payAmount: '19.0' } }))
      .toEqual(['$.trade.payAmount: int64 期望十进制字符串，收到 "19.0"']);
    context
      .expect(createTrade({ status: 'NOT_A_TRADE_STATUS' }))
      .toEqual(['$.status: 期望合法枚举名称，收到 "NOT_A_TRADE_STATUS"']);
    context
      .expect(createTrade({ tradeNo: undefined }))
      .toEqual(['$.tradeNo: 期望字符串，收到 undefined']);

    // oneof-conflict-rejected：同一 oneof 出现两个分支。
    const createTradePay = validatorFor(CreateTradePay.meta);
    context
      .expect(createTradePay({ payParams: { wechatJsapi: {}, wechatNative: {} } }))
      .toEqual(['$.payParams: 同一 oneof 出现多个分支 wechat_jsapi、wechat_native']);

    // idl-ignores-status：同一响应体在不同 HTTP 状态码下得到相同结论。
    const statusBodies = [fixtureSamples.CreateTrade[0], { tradeNo: 'TN-1', unknownField: 'x' }];
    for (const body of statusBodies) {
      context.expect(createTrade(body, 200)).toEqual(createTrade(body, 503));
    }

    // 合成描述的派生结果：每类编码各就各位，动态类型没有编码类别（待定）。
    context.expect(syntheticField('text_field').encoding).toBe('json-string');
    context.expect(syntheticField('number_field').encoding).toBe('json-number');
    context.expect(syntheticField('bigint_field').encoding).toBe('json-int64-string');
    context.expect(syntheticField('bool_field').encoding).toBe('json-boolean');
    context.expect(syntheticField('enum_field').enumValues).toEqual(['SAMPLE_A', 'SAMPLE_B']);
    // 单个枚举字面量（非联合）同样取到合法名称，且只接受该名称。
    context.expect(syntheticField('literal_enum').enumValues).toEqual(['SAMPLE_A']);
    context.expect(syntheticField('list_oneof.list').elementEncoding).toBe('json-string');
    context
      .expect(syntheticField('list_oneof.status').enumValues)
      .toEqual(['SAMPLE_A', 'SAMPLE_B']);
    context.expect(syntheticField('map_field').encoding).toBe('string-map');
    context.expect(syntheticField('leaf_field').encoding).toBe('nested-object');
    context.expect(syntheticField('leaf_field.leaf_name').encoding).toBe('json-string');
    context.expect(syntheticField('empty_field').encoding).toBe('nested-object');
    context.expect(syntheticField('single_field').encoding).toBe('nested-object');
    context.expect(syntheticField('scalar_list').elementEncoding).toBe('json-string');
    context.expect(syntheticField('object_list').elementEncoding).toBe('nested-object');
    context.expect(syntheticField('oneof_list').elementEncoding).toBe('oneof-object');
    context.expect(syntheticField('dynamic_list').elementEncoding).toBeUndefined();
    context.expect(syntheticField('dynamic_field').encoding).toBeUndefined();
    context.expect(syntheticField('union_field').encoding).toBeUndefined();
    context.expect(syntheticField('good.alpha').oneofBranch).toBe(true);
    context.expect(syntheticField('good.alpha.leaf_name').encoding).toBe('json-string');
    context.expect(syntheticField('good.beta_payload').encoding).toBe('json-string');
    context.expect(syntheticField('text_field').optional).toBe(false);
    context.expect(syntheticField('leaf_field').optional).toBe(true);
    // 自引用类型不无限展开，非法 oneof 形态降级为普通对象字段。
    context.expect(syntheticField('cyclic_field.next').encoding).toBe('nested-object');
    context
      .expect(syntheticShape.some((field) => field.path.startsWith('cyclic_field.next.')))
      .toBe(false);
    context.expect(syntheticShape.some((field) => field.path.startsWith('bad.'))).toBe(true);
    context.expect(syntheticShape.some((field) => field.path.startsWith('half.'))).toBe(true);

    // 合成描述上的校验规则：每类编码都覆盖“同形通过 / 不同形报错”。
    const validate = (body: unknown) => validateResponseShape(syntheticShape, body);
    context
      .expect(
        validate({
          textField: 't',
          numberField: 1,
          bigintField: '-12',
          boolField: true,
          enumField: 'SAMPLE_A',
          leafField: { leafName: 'n' },
          emptyField: {},
          cyclicField: { next: {} },
          singleField: { only: 'o' },
          mapField: { key: 'value' },
          scalarList: ['a'],
          objectList: [{ leafName: 'n' }],
          oneofList: [{ alpha: { leafName: 'n' } }],
          good: { alpha: { leafName: 'n' } },
        }),
      )
      .toEqual([]);
    context.expect(validate({ textField: 1 })).toEqual(['$.textField: 期望字符串，收到 1']);
    context.expect(validate({ numberField: 'x' })).toEqual(['$.numberField: 期望数字，收到 "x"']);
    context
      .expect(validate({ bigintField: 1 }))
      .toEqual(['$.bigintField: int64 期望十进制字符串，收到 1']);
    context
      .expect(validate({ boolField: 'true' }))
      .toEqual(['$.boolField: 期望布尔值，收到 "true"']);
    context
      .expect(validate({ enumField: 'SAMPLE_C' }))
      .toEqual(['$.enumField: 期望合法枚举名称，收到 "SAMPLE_C"']);
    context.expect(validate({ enumField: 3 })).toEqual(['$.enumField: 期望合法枚举名称，收到 3']);
    context
      .expect(
        validate({
          literalEnum: 'SAMPLE_A',
          listOneof: { list: ['a'] },
        }),
      )
      .toEqual([]);
    context.expect(validate({ listOneof: { status: 'SAMPLE_B' } })).toEqual([]);
    context
      .expect(validate({ literalEnum: 'SAMPLE_B' }))
      .toEqual(['$.literalEnum: 期望合法枚举名称，收到 "SAMPLE_B"']);
    context.expect(validate({ mapField: [] })).toEqual(['$.mapField: 期望对象（map），收到 []']);
    context.expect(validate({ scalarList: 'x' })).toEqual(['$.scalarList: 期望数组，收到 "x"']);
    context.expect(validate({ scalarList: [1] })).toEqual(['$.scalarList[0]: 期望字符串，收到 1']);
    context
      .expect(validate({ objectList: [{ leafName: 1 }] }))
      .toEqual(['$.objectList[0].leafName: 期望字符串，收到 1']);
    context
      .expect(validate({ objectList: ['x'] }))
      .toEqual(['$.objectList[0]: 期望对象，收到 "x"']);
    context
      .expect(validate({ oneofList: [{ alpha: {}, betaPayload: 'x' }] }))
      .toEqual(['$.oneofList[0]: 同一 oneof 出现多个分支 alpha、beta_payload']);
    context.expect(validate({ leafField: 'x' })).toEqual(['$.leafField: 期望对象，收到 "x"']);
    context
      .expect(validate({ dynamicField: { any: 1 } }))
      .toEqual(['$.dynamicField: 字段类型无法判定（待定），不得放行']);
    context
      .expect(validate({ dynamicList: [1] }))
      .toEqual(['$.dynamicList[0]: 字段类型无法判定（待定），不得放行']);
    context
      .expect(validate({ unionField: 'x' }))
      .toEqual(['$.unionField: 字段类型无法判定（待定），不得放行']);
    context.expect(validate('not-an-object')).toEqual(['$: 期望对象，收到 "not-an-object"']);
    // 未携带合法名称列表的枚举字段：任何取值都不放行（不是"缺省即放行"）。
    context
      .expect(
        validateResponseShape(
          [{ path: 'status', encoding: 'enum-name', optional: false, oneofBranch: false }],
          { status: 'ANY' },
        ),
      )
      .toEqual(['$.status: 期望合法枚举名称，收到 "ANY"']);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: [
          'conforming-accepted',
          'absent-default-accepted',
          'unknown-field-rejected',
          'encoding-rejected',
          'oneof-conflict-rejected',
          'idl-issue-path',
          'idl-ignores-status',
          'idl-ignores-status',
        ],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-PROTOCOL-CONTRACT-007 idl-dynamic-pending',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-007',
        caseId: 'idl-dynamic-pending',
        environment: 'protocol-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-007',
            caseKey: 'idl-dynamic-pending',
            checks: ['dynamic-pending'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const dynamicShape = syntheticShape.filter((field) => field.path === 'dynamic_field');
    context
      .expect(validateResponseShape(dynamicShape, { dynamicField: 1 }))
      .toEqual(['$.dynamicField: 字段类型无法判定（待定），不得放行']);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['dynamic-pending'],
      }),
      'scenario-evidence',
    );
  },
);
