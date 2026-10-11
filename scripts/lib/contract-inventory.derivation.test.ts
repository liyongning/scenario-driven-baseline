import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  declarationRoot,
  writeFixtureFile,
} from '../../packages/e2e/tests/tooling/declaration-fixture.ts';
import {
  controlled,
  customMethodFile,
} from '../../packages/e2e/tests/tooling/contract-inventory-fixture.ts';
import { buildContractInventory } from './contract-inventory.ts';

describe('buildContractInventory', () => {
  it(
    'reports each invalid declaration instead of deriving silently',
    { timeout: 120_000 },
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
});
