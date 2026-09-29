import { describe, expect, it } from 'vitest';
import { compareJsonPresence } from './requests.ts';

describe('compareJsonPresence', () => {
  it('keeps an omitted field distinct from null, zero, and UNSPECIFIED', () => {
    expect(compareJsonPresence({ tradeNo: 't' }, { tradeNo: 't' })).toEqual([]);
    expect(compareJsonPresence({ tradeNo: 't' }, { tradeNo: 't', xpayEnv: null })).toEqual([
      '$.xpayEnv: unexpected key',
    ]);
    expect(compareJsonPresence({ tradeNo: 't', xpayEnv: 0 }, { tradeNo: 't' })).toEqual([
      '$.xpayEnv: missing key',
    ]);
    expect(compareJsonPresence({ tradeNo: 't', xpayEnv: 'XPAY_ENV_SANDBOX' }, { tradeNo: 't', xpayEnv: 'XPAY_ENV_UNSPECIFIED' })).toEqual([
      '$.xpayEnv: expected "XPAY_ENV_SANDBOX", received "XPAY_ENV_UNSPECIFIED"',
    ]);
  });

  it('reports nested values and array order without codec normalization', () => {
    expect(compareJsonPresence(
      { baseReq: { requestId: 'r-1' }, values: [1, 2] },
      { baseReq: { requestId: 'r-2' }, values: [2, 1] },
    )).toEqual([
      '$.baseReq.requestId: expected "r-1", received "r-2"',
      '$.values[0]: expected 1, received 2',
      '$.values[1]: expected 2, received 1',
    ]);
  });

  it('reports JSON shape, extra array entries, primitive mismatches, and undefined values', () => {
    expect(compareJsonPresence([], {})).toEqual(['$: expected array, received {}']);
    expect(compareJsonPresence({}, [])).toEqual(['$: expected object, received []']);
    expect(compareJsonPresence([1], [1, 2])).toEqual(['$[1]: unexpected value']);
    expect(compareJsonPresence(undefined, null)).toEqual(['$: expected undefined, received null']);
    expect(compareJsonPresence(undefined, undefined)).toEqual([]);
  });
});
