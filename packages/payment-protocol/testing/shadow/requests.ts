function printable(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 精确比较原始 JSON，同时把字段缺失与显式空值/零值分开。 */
export function compareJsonPresence(expected: unknown, actual: unknown, path = '$'): string[] {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array, received ${printable(actual)}`];
    const issues = expected.flatMap((value, index) => compareJsonPresence(value, actual[index], `${path}[${index}]`));
    if (actual.length > expected.length) {
      for (let index = expected.length; index < actual.length; index += 1) issues.push(`${path}[${index}]: unexpected value`);
    }
    return issues;
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) return [`${path}: expected object, received ${printable(actual)}`];
    const issues: string[] = [];
    for (const key of Object.keys(expected)) {
      if (!Object.prototype.hasOwnProperty.call(actual, key)) issues.push(`${path}.${key}: missing key`);
      else issues.push(...compareJsonPresence(expected[key], actual[key], `${path}.${key}`));
    }
    for (const key of Object.keys(actual)) {
      if (!Object.prototype.hasOwnProperty.call(expected, key)) issues.push(`${path}.${key}: unexpected key`);
    }
    return issues;
  }
  return Object.is(expected, actual) ? [] : [`${path}: expected ${printable(expected)}, received ${printable(actual)}`];
}
