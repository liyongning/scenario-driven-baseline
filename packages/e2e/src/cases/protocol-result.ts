import { isDeepStrictEqual } from 'node:util';

type ExpectedProtocolProjection = Readonly<{
  wire: unknown;
  decoded: unknown;
}>;

/** 同时核对独立 wire oracle 与 generated codec 暴露的公开 decoded 表示。 */
export function protocolResultIssues(
  result: unknown,
  expected: ExpectedProtocolProjection,
): string[] {
  if (!result || typeof result !== 'object') return ['protocol result is not an object'];
  const value = result as Record<string, unknown>;
  const issues: string[] = [];
  if (value.ok !== true) issues.push('protocol request did not succeed');
  if (value.httpStatus !== 200) issues.push('protocol HTTP status is not 200');
  if (!isDeepStrictEqual(value.wire, expected.wire))
    issues.push('wire response does not match the independent fixture oracle');
  if (!isDeepStrictEqual(value.decoded, expected.decoded))
    issues.push('decoded response does not match the generated public projection');
  return issues;
}
