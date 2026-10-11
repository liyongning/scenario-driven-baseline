import { describe, expect, it } from 'vitest';
import { extractScenarioIds, unregisteredScenarioIds } from './scenario-ids.ts';

const patterns = ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'];
const ids = (text: string): string[] => extractScenarioIds(text, patterns);

describe('scenario id extraction', () => {
  it('skips ids that are file or directory names inside a path', () => {
    expect(ids('`packages/e2e/tests/tooling/SCN-X-001.spec.ts`')).toEqual([]);
    expect(ids('`packages/e2e/tests/fixtures/SCN-X-001/`')).toEqual([]);
    expect(ids('`packages/e2e/tests/fixtures/SCN-X-001/evidence.json`')).toEqual([]);
    expect(ids('packages/e2e/tests/fixtures/SCN-X-001/protocol-matrix.json')).toEqual([]);
  });

  it('keeps checking ids at sentence end, in slash shorthand and at path end', () => {
    expect(ids('参见 SCN-FOO-999.')).toEqual(['SCN-FOO-999']);
    expect(ids('SCN-FOO-999/010')).toEqual(['SCN-FOO-999']);
    expect(ids('SCN-FOO-999/010/011 简写')).toEqual(['SCN-FOO-999']);
    expect(ids('`packages/e2e/tests/fixtures/SCN-FOO-999`')).toEqual(['SCN-FOO-999']);
    expect(ids('packages/e2e/tests/fixtures/SCN-FOO-999')).toEqual(['SCN-FOO-999']);
  });

  it('keeps checking ids followed by punctuation, backticks, spaces or line end', () => {
    expect(ids('后面跟中文标点 SCN-FOO-999。')).toEqual(['SCN-FOO-999']);
    expect(ids('`SCN-FOO-999` 的引用')).toEqual(['SCN-FOO-999']);
    expect(ids('后面跟空格 SCN-FOO-999 的引用')).toEqual(['SCN-FOO-999']);
    expect(ids('行尾 SCN-FOO-999')).toEqual(['SCN-FOO-999']);
    expect(ids('SCN-FOO-999\n')).toEqual(['SCN-FOO-999']);
  });

  it('does not treat extension-like text without a path separator as a file', () => {
    expect(ids('SCN-FOO-999.md5')).toEqual(['SCN-FOO-999']);
    expect(ids('/SCN-FOO-999.spec.ts')).toEqual([]);
  });

  it('reports only unregistered ids and keeps the document suffix rule', () => {
    const registered = new Set(['SCN-X-001']);
    expect(
      unregisteredScenarioIds(
        '`packages/e2e/tests/fixtures/SCN-X-001/`\n参见 SCN-FOO-999.',
        'docs/architecture.md',
        patterns,
        registered,
      ),
    ).toEqual(['unregistered Scenario ID SCN-FOO-999 (docs/architecture.md)']);
    expect(
      unregisteredScenarioIds('参见 SCN-FOO-999.', 'docs/template-guide.md', patterns, registered),
    ).toEqual(['unregistered Scenario ID SCN-FOO-999']);
  });
});
