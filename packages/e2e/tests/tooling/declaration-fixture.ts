import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * 合成 generated 运行时：只提供 `createMethod` 与 `defineMethodSpec`，
 * 使反例不引用仓库里真实的任何生成文件（PC-01 的受控临时根约束）。
 */
export const syntheticStdSource = [
  'export type JsonCodec<T> = { fromJSON(input: unknown): T; toJSON(value: T): unknown };',
  'export type RpcMethodMeta<Req, Resp> = {',
  '  name: string;',
  '  method: string;',
  '  path: string;',
  '  requestType: string;',
  '  responseType: string;',
  '  requestCodec?: JsonCodec<Req>;',
  '  responseCodec: JsonCodec<Resp>;',
  '  annotations?: { [key: string]: string[] };',
  '};',
  'export type MethodMeta<Req, Resp> = Omit<RpcMethodMeta<Req, Resp>, "method" | "path">;',
  'export type GeneratedMethod<Req, Resp> = { readonly meta: RpcMethodMeta<Req, Resp> };',
  'export type GeneratedMethodSpec<Req, Resp> = { readonly meta: MethodMeta<Req, Resp> };',
  'export function createMethod<Req, Resp>(meta: RpcMethodMeta<Req, Resp>) {',
  '  return Object.freeze({ meta }) as GeneratedMethod<Req, Resp>;',
  '}',
  'export function defineMethodSpec<Req, Resp>(meta: MethodMeta<Req, Resp>) {',
  '  return Object.freeze({ meta }) as GeneratedMethodSpec<Req, Resp>;',
  '}',
  '',
].join('\n');

/** 一个合成的 generated 文件：相对 `generated/` 的路径与内容。 */
export type SyntheticGeneratedFile = Readonly<{ relative: string; content: string }>;

export function syntheticMethodFile(
  options: Readonly<{
    name: string;
    path: string;
    factory?: 'createMethod' | 'defineMethodSpec';
    requestFields?: string;
    responseFields?: string;
    meta?: string;
    suffix?: string;
  }>,
): string {
  const request = options.requestFields ?? '  user_id?: string;';
  const response = options.responseFields ?? '  trade_no?: string;';
  const meta =
    options.meta ??
    [
      "  method: 'POST',",
      `  path: '${options.path}',`,
      `  name: '${options.name}',`,
      `  requestType: '${options.name}Request',`,
      `  responseType: '${options.name}Response',`,
      '  responseCodec: { fromJSON: (value) => value as never, toJSON: (value) => value },',
    ].join('\n');
  return [
    "import { createMethod, defineMethodSpec } from '../../../../std';",
    '',
    `export interface ${options.name}Request {`,
    request,
    '}',
    `export interface ${options.name}Response {`,
    response,
    '}',
    `export const ${options.name} = ${options.factory ?? 'createMethod'}({`,
    meta,
    '});',
    options.suffix ?? '',
    '',
  ].join('\n');
}

/** 默认的两个合成 generated 方法：一个 trade、一个非 trade，各自前缀独立。 */
export function defaultGeneratedFiles(): SyntheticGeneratedFile[] {
  return [
    {
      relative: 'idl/infra/trade/v1/trade.ts',
      content: syntheticMethodFile({ name: 'CreateTrade', path: '/api/base/trade/create' }),
    },
    {
      relative: 'idl/infra/pay/v1/pay.ts',
      content: syntheticMethodFile({
        name: 'FastCharge',
        path: '/api/base/pay/charge',
        requestFields: '  order_no?: string;',
      }),
    },
  ];
}

export const defaultDeclarationSource = [
  "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  "import { FastCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/pay';",
  '',
  'export const consumedOperations = [',
  '  {',
  '    method: CreateTrade,',
  "    requestFields: { user_id: { cases: ['mapped-value'], authority: 'PC-01' } },",
  '  },',
  '  {',
  '    method: FastCharge,',
  "    requestFields: { order_no: { cases: ['mapped-value'], authority: 'PC-01' } },",
  '  },',
  '];',
  '',
].join('\n');

/** 产品包中与声明一一对应的实际调用；两种调用形式都覆盖。 */
export const defaultCallerSource = [
  "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  "import { FastCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/pay';",
  '',
  'declare const client: {',
  '  request(meta: unknown, request: unknown, context: unknown): Promise<unknown>;',
  '};',
  '',
  'const tradeMeta = CreateTrade.meta;',
  '',
  'export const createTrade = () => client.request(tradeMeta, {}, {});',
  '',
  'export const fastCharge = () => client.request(FastCharge, {}, {});',
  '',
].join('\n');

/**
 * 示例协议的消费声明：受控输入，示例删除后受控根仍能派生同样的义务（ENG-06）。
 * 与仓库声明逐项一致，因此断言可以保持“示例协议”的口径。
 */
export const exampleDeclarationSource = [
  "import type { RpcMethodMeta } from '@daqian/template-protocol/generated/std';",
  'import {',
  '  CreateTrade,',
  '  QueryTrade,',
  "} from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  '',
  'type ConsumedMethod = Readonly<{',
  '  meta: RpcMethodMeta<unknown, unknown>;',
  '}>;',
  '',
  'type ConsumedRequestField = Readonly<{',
  '  cases: ReadonlyArray<string>;',
  '  authority: string;',
  '}>;',
  '',
  'type ConsumedOperation = Readonly<{',
  '  method: ConsumedMethod;',
  '  requestFields: Readonly<Record<string, ConsumedRequestField>>;',
  '}>;',
  '',
  '/** 请求字段策略的评审依据；门禁不再按方法名保存这张表。 */',
  'const requestAuthority =',
  "  'protocol-contract Spec PC-01；本 Change Design“IDL 义务派生改为针对示例接口（任务 2）”';",
  '',
  'export const consumedOperations: ReadonlyArray<ConsumedOperation> = [',
  '  {',
  '    method: CreateTrade,',
  '    requestFields: {',
  "      biz_type: { cases: ['mapped-value'], authority: requestAuthority },",
  "      biz_trade_no: { cases: ['mapped-value'], authority: requestAuthority },",
  "      user_id: { cases: ['mapped-value'], authority: requestAuthority },",
  "      goods_type: { cases: ['fixed-value'], authority: requestAuthority },",
  "      pay_amount: { cases: ['mapped-value'], authority: requestAuthority },",
  "      items: { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.biz_order_no': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.sku_id': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.sku_name': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.quantity': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.unit_price': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.pay_amount': { cases: ['mapped-value'], authority: requestAuthority },",
  "      'items.discount_amount': { cases: ['fixed-value'], authority: requestAuthority },",
  "      'items.sku_snapshot': { cases: ['omitted'], authority: requestAuthority },",
  "      'items.sku_snapshot.wechat_virtual_product_id': {",
  "        cases: ['omitted'],",
  '        authority: requestAuthority,',
  '      },',
  "      'items.sku_snapshot.biz_snapshot': { cases: ['omitted'], authority: requestAuthority },",
  "      original_amount: { cases: ['mapped-value'], authority: requestAuthority },",
  "      discount_amount: { cases: ['fixed-value'], authority: requestAuthority },",
  "      base_req: { cases: ['generated-value'], authority: requestAuthority },",
  "      'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },",
  "      'base_req.product_id': {",
  "        cases: ['configured-value', 'omitted'],",
  '        authority: requestAuthority,',
  '      },',
  '    },',
  '  },',
  '  {',
  '    method: QueryTrade,',
  '    requestFields: {',
  "      trade_no: { cases: ['mapped-value'], authority: requestAuthority },",
  "      biz_type: { cases: ['omitted'], authority: requestAuthority },",
  "      biz_trade_no: { cases: ['omitted'], authority: requestAuthority },",
  "      sync_channel: { cases: ['omitted'], authority: requestAuthority },",
  "      base_req: { cases: ['generated-value'], authority: requestAuthority },",
  "      'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },",
  "      'base_req.product_id': {",
  "        cases: ['configured-value', 'omitted'],",
  '        authority: requestAuthority,',
  '      },',
  '    },',
  '  },',
  '];',
  '',
].join('\n');

/** 与示例声明一一对应的调用：双向对账要求声明都被实际使用。两种调用形式都覆盖。 */
export const exampleCallerSource = [
  "import { CreateTrade, QueryTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  '',
  'declare const protocol: {',
  '  request(meta: unknown, request: unknown, context: unknown): Promise<unknown>;',
  '};',
  '',
  'const request = {};',
  '',
  'export const createTrade = () => protocol.request(CreateTrade.meta, request, {});',
  '',
  'export const queryTrade = () => protocol.request(QueryTrade, request, {});',
  '',
].join('\n');

export type DeclarationFixtureOptions = Readonly<{
  /** 声明模块内容，相对产品包 `src/consumed-operations.ts`。 */
  declaration?: string;
  /** 合成 generated 文件；缺省用 `defaultGeneratedFiles()`。 */
  generated?: ReadonlyArray<SyntheticGeneratedFile>;
  /** 产品包调用文件内容；`null` 表示不写，用于“未使用的声明”反例。 */
  caller?: string | null;
  /** 清单中 product 的 `consumedOperations`；`null` 表示不登记该字段。 */
  consumedOperations?: ReadonlyArray<string> | null;
  /** 额外产品包源码文件，键为相对 `src/` 的路径。 */
  extraFiles?: Readonly<Record<string, string>>;
  /** 额外协议包源码文件，键为相对协议包 `src/` 的路径。 */
  protocolFiles?: Readonly<Record<string, string>>;
  /** 复制仓库协议包 generated 产物（不在示例删除白名单内），用于在受控根中复现示例协议。 */
  generatedFromRepository?: boolean;
  prefix?: string;
}>;

/** 仓库协议包 `src/` 下某个文件的内容：错误码表等随 generated 一同保留在白名单之外。 */
export function repositoryProtocolSource(relative: string): string {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as { packages: Array<Record<string, unknown>> };
  const protocol = manifest.packages.find((item) => item.role === 'protocol')!;
  return readFileSync(
    join(repositoryRoot, `packages/${protocol.directory as string}/src`, relative),
    'utf8',
  );
}

/** 递归列出目录下全部文件，键为相对该目录的路径。 */
function relativeFiles(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...relativeFiles(join(directory, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

/**
 * 受控临时根 + 合成 generated + 产品包声明模块与调用文件。
 * 清单沿用真实仓库的包目录与包名，只改 product 的 `consumedOperations`。
 */
export function declarationRoot(options: DeclarationFixtureOptions = {}): ControlledRoot {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as {
    packages: Array<Record<string, unknown>>;
    bindings: Array<Record<string, unknown>>;
  };
  const product = manifest.packages.find((item) => item.role === 'product' && item.form === 'sdk')!;
  const protocol = manifest.packages.find(
    (item) => item.role === 'protocol' && item.protocolKind === 'idl',
  )!;
  const test = manifest.packages.find((item) => item.role === 'test')!;
  manifest.packages = [product, protocol, test];
  manifest.bindings = [
    {
      name: 'sdk-idl-weapp',
      product: product.directory,
      protocol: protocol.directory,
      platforms: ['weapp'],
    },
  ];
  if (options.consumedOperations === null) delete product.consumedOperations;
  else
    product.consumedOperations = [
      ...(options.consumedOperations ?? ['packages/sdk/src/consumed-operations.ts']),
    ];
  const files: Record<string, string> = {};
  const productRoot = `packages/${product.directory as string}/src`;
  files[`${productRoot}/consumed-operations.ts`] = options.declaration ?? defaultDeclarationSource;
  if (options.caller !== null)
    files[`${productRoot}/caller.ts`] = options.caller ?? defaultCallerSource;
  for (const [relative, content] of Object.entries(options.extraFiles ?? {}))
    files[`${productRoot}/${relative}`] = content;
  const protocolRoot = `packages/${protocol.directory as string}/src`;
  if (options.generatedFromRepository) {
    const generated = join(repositoryRoot, `${protocolRoot}/generated`);
    for (const relative of relativeFiles(generated))
      files[`${protocolRoot}/generated/${relative}`] = readFileSync(
        join(generated, relative),
        'utf8',
      );
  } else {
    files[`${protocolRoot}/generated/std.ts`] = syntheticStdSource;
    for (const file of options.generated ?? defaultGeneratedFiles())
      files[`${protocolRoot}/generated/${file.relative}`] = file.content;
  }
  for (const [relative, content] of Object.entries(options.protocolFiles ?? {}))
    files[`${protocolRoot}/${relative}`] = content;
  const controlled = createControlledRoot({
    manifest,
    files,
    prefix: options.prefix ?? 'declaration-fixture-',
  });
  return controlled;
}

/** 往受控根写入额外文件（用于在 root 创建后补充反例）。 */
export function writeFixtureFile(root: string, relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
