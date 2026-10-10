import { describe, expect, it } from 'vitest';
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
});
