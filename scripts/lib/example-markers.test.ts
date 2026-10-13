import { describe, expect, it } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import { lineInRanges, markedLineRanges, scanExampleMarkers } from './example-markers.ts';

describe('example marker ranges', () => {
  it('returns the line range of paired comment markers and ignores string literals', () => {
    const source = [
      "const literal = '// template-example:begin';",
      '// template-example:begin',
      'const inside = 1;',
      '// template-example:end',
      'const after = 2;',
    ].join('\n');
    const ranges = markedLineRanges('sample.ts', source);
    expect(ranges).toEqual([{ begin: 2, end: 4 }]);
    expect(lineInRanges(ranges, 2)).toBe(true);
    expect(lineInRanges(ranges, 3)).toBe(true);
    expect(lineInRanges(ranges, 5)).toBe(false);
  });

  it('treats an unclosed begin as extending to the end of the file', () => {
    const source = ['// 无标记的注释', '// template-example:begin', 'const kept = 1;'].join('\n');
    expect(markedLineRanges('sample.ts', source)).toEqual([
      { begin: 2, end: Number.MAX_SAFE_INTEGER },
    ]);
  });

  it('ignores an end without a begin and extra begins inside an open range', () => {
    const source = [
      '// template-example:end',
      '// template-example:begin',
      '// template-example:begin',
      '// template-example:end',
    ].join('\n');
    expect(markedLineRanges('sample.ts', source)).toEqual([{ begin: 2, end: 4 }]);
  });

  it('reads Markdown markers and reports unpaired ones', () => {
    const markdown = [
      '<!-- template-example:begin -->',
      'body',
      '<!-- template-example:end -->',
    ].join('\n');
    expect(markedLineRanges('README.md', markdown)).toEqual([{ begin: 1, end: 3 }]);
    expect(scanExampleMarkers('README.md', markdown)).toEqual([]);
    expect(scanExampleMarkers('README.md', '<!-- template-example:end -->')).toEqual([
      'README.md:1: template-example:end 没有对应的 begin',
    ]);
  });

  it('validates web-example markers and rejects cross-stem nesting', () => {
    const valid = ['// web-example:begin', 'const example = true;', '// web-example:end'].join(
      '\n',
    );
    expect(scanExampleMarkers('sample.ts', valid)).toEqual([]);
    expect(markedLineRanges('sample.ts', valid, 'web-example')).toEqual([{ begin: 1, end: 3 }]);
    expect(
      scanExampleMarkers(
        'sample.ts',
        [
          '// template-example:begin',
          '// web-example:begin',
          '// template-example:end',
          '// web-example:end',
        ].join('\n'),
      ),
    ).toEqual([
      'sample.ts:2: web-example 标记不允许嵌套',
      'sample.ts:3: template-example:end 与 web-example:begin 交叉嵌套',
      'sample.ts:1: template-example:begin 没有对应的 end',
    ]);
  });
});

// web-example:begin
it(
  'SCN-WEB-EXAMPLE-014 marker-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-WEB-EXAMPLE-014',
        caseId: 'marker-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-WEB-EXAMPLE-014',
            caseKey: 'marker-rules',
            checks: ['marker-pairing'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const executed: string[] = [];
    const check = async (name: string, assertion: () => void) => {
      assertion();
      executed.push(name);
    };

    await check('marker-pairing', () => {
      // 正例：代码与 Markdown 的成对 web-example 标记都被接受。
      const code = ['// web-example:begin', 'const example = 1;', '// web-example:end'].join('\n');
      const markdown = ['<!-- web-example:begin -->', '正文', '<!-- web-example:end -->'].join(
        '\n',
      );
      context.expect(scanExampleMarkers('sample.ts', code)).toEqual([]);
      context.expect(scanExampleMarkers('README.md', markdown)).toEqual([]);

      // 反例一：只有 begin 没有 end，必须指出文件与行号。
      context
        .expect(
          scanExampleMarkers('sample.ts', ['const a = 1;', '// web-example:begin'].join('\n')),
        )
        .toEqual(['sample.ts:2: web-example:begin 没有对应的 end']);

      // 反例二：多余的 end，必须指出文件与行号。
      context
        .expect(scanExampleMarkers('README.md', '<!-- web-example:end -->'))
        .toEqual(['README.md:1: web-example:end 没有对应的 begin']);

      // 反例三：嵌套的两对标记，必须指出嵌套行。
      context
        .expect(
          scanExampleMarkers(
            'sample.ts',
            [
              '// web-example:begin',
              '// web-example:begin',
              '// web-example:end',
              '// web-example:end',
            ].join('\n'),
          ),
        )
        .toEqual(['sample.ts:2: web-example 标记不允许嵌套']);
    });

    context.expect(executed).toEqual(['marker-pairing']);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: executed,
      }),
      'scenario-evidence',
    );
  },
);
// web-example:end
