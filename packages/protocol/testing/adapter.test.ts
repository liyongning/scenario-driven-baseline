import { expect, test } from 'vitest';
import { CreateTrade } from '../src/generated/idl/infra/trade/v1/trade.ts';
import idlAdapter from './adapter.ts';

test(
  'IDL adapter rejects malformed method descriptions and accepts methods without response schemas',
  { timeout: 30_000 },
  () => {
    expect(() => idlAdapter.responseValidator(undefined)).toThrow(
      'IDL responseValidator requires a generated method description',
    );
    expect(idlAdapter.responseValidator({})).toBeUndefined();
    expect(idlAdapter.responseValidator(CreateTrade.meta)).toBeTypeOf('function');
    expect(idlAdapter.responseValidator(CreateTrade.meta)).toBeTypeOf('function');
  },
);
