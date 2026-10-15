import { test } from 'vitest';
import { CreateTrade } from '../src/generated/idl/infra/trade/v1/trade.ts';
import idlAdapter from './adapter.ts';

test(
  'SCN-PROTOCOL-CONTRACT-015 idl-adapter-validator',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-015',
        caseId: 'idl-adapter-validator',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-015',
            caseKey: 'idl-adapter-validator',
            checks: ['validator-unchanged'],
          },
        ],
      },
    },
  },
  async (context) => {
    const expect = context.expect;
    const assertionsBefore = expect.getState().assertionCalls;
    expect(() => idlAdapter.responseValidator(undefined)).toThrow(
      'IDL responseValidator requires a generated method description',
    );
    expect(idlAdapter.responseValidator({})).toBeUndefined();
    expect(idlAdapter.responseValidator(CreateTrade.meta)).toBeTypeOf('function');
    const validate = idlAdapter.responseValidator(CreateTrade.meta);
    expect(validate).toBeTypeOf('function');

    const valid = {
      tradeNo: 'SCN-015-trade',
      orderNos: ['SCN-015-order'],
      status: 'TRADE_STATUS_PAID',
    };
    expect(validate!(valid, 200)).toEqual([]);
    expect(validate!(valid, 503)).toEqual([]);
    expect(validate!(valid, 200)).toEqual(validate!(valid, 503));

    const unknown = validate!({ ...valid, unknownField: true }, 200);
    expect(unknown).not.toEqual([]);
    expect(unknown.join('\n')).toContain('响应类型中不存在的字段');

    const wrongType = validate!({ ...valid, tradeNo: 1 }, 200);
    expect(wrongType).not.toEqual([]);
    expect(wrongType.join('\n')).toContain('期望字符串');

    expect(validate!(undefined, 200)).not.toEqual([]);
    await context.annotate(
      JSON.stringify({
        assertions: expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['validator-unchanged'],
      }),
      'scenario-evidence',
    );
  },
);
