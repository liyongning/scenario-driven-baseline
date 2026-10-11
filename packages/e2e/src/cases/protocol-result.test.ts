import { describe, expect, it } from 'vitest';
import { protocolResultIssues } from './protocol-result.ts';

describe('protocolResultIssues', () => {
  const expected = {
    wire: { tradeNo: 'trade-1', baseResp: { statusCode: '0' } },
    decoded: { tradeNo: 'trade-1', baseResp: { statusCode: '0' } },
  };

  it('accepts the public wire and decoded projections together', () => {
    expect(protocolResultIssues({ ok: true, httpStatus: 200, ...expected }, expected)).toEqual([]);
  });

  it.each([
    { name: 'missing', result: { ok: true, httpStatus: 200, wire: expected.wire } },
    { name: 'empty', result: { ok: true, httpStatus: 200, wire: expected.wire, decoded: {} } },
    {
      name: 'wrong',
      result: { ok: true, httpStatus: 200, wire: expected.wire, decoded: { tradeNo: 'wrong' } },
    },
  ])('rejects $name decoded output even when the independent wire oracle matches', ({ result }) => {
    expect(protocolResultIssues(result, expected)).toContain(
      'decoded response does not match the generated public projection',
    );
  });

  it('reports malformed status and wire output independently', () => {
    expect(protocolResultIssues(null, expected)).toEqual(['protocol result is not an object']);
    expect(
      protocolResultIssues(
        { ok: false, httpStatus: 500, wire: {}, decoded: expected.decoded },
        expected,
      ),
    ).toEqual([
      'protocol request did not succeed',
      'protocol HTTP status is not 200',
      'wire response does not match the independent fixture oracle',
    ]);
  });
});
