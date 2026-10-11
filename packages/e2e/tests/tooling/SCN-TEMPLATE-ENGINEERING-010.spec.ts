import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { format as formatCode } from 'prettier';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createControlledRoot, minimalManifest, type ControlledRoot } from './controlled-root.ts';
import { repositoryRoot } from './helpers.ts';

const prettier = resolve(repositoryRoot, 'node_modules/.bin/prettier');
const eslint = resolve(repositoryRoot, 'node_modules/.bin/eslint');
const eslintConfig = resolve(repositoryRoot, 'eslint.config.js');

/** 复制模板自身的格式基线文件，保证受控根与仓库用同一份 Prettier 配置与忽略清单。 */
const formatBaseline = (): Record<string, string> => ({
  '.prettierrc.json': readFileSync(join(repositoryRoot, '.prettierrc.json'), 'utf8'),
  '.prettierignore': readFileSync(join(repositoryRoot, '.prettierignore'), 'utf8'),
});

/**
 * 受控临时根：清单写成 `format:check` 认得的样式，保证夹具自身不干扰格式判据。
 * 这是夹具细节，不在断言面内，也不改变任何门禁语义。
 */
async function baselineRoot(
  files: Record<string, string>,
  manifest: unknown = minimalManifest(),
): Promise<ControlledRoot> {
  const fixture = createControlledRoot({ files: { ...formatBaseline(), ...files }, manifest });
  const manifestPath = join(fixture.root, 'project.manifest.json');
  writeFileSync(
    manifestPath,
    await formatCode(JSON.stringify(manifest, null, 2), { filepath: manifestPath }),
  );
  return fixture;
}

/** 生成 n 行有效代码：每行一条导出语句，不触发 max-lines 之外的规则。 */
const codeLines = (count: number): string =>
  `${Array.from({ length: count }, (_, index) => `export const value${index} = ${index};`).join('\n')}\n`;

/** 总行数 360、有效行 240：多出来的行只有空行与注释，不应计入 max-lines。 */
const paddedLines = (): string => {
  const body = Array.from({ length: 240 }, (_, index) => `export const pad${index} = ${index};`);
  const padding = Array.from({ length: 120 }, (_, index) =>
    index % 2 === 0 ? '' : `// 填充注释 ${index}`,
  );
  return `${[...body, ...padding].join('\n')}\n`;
};

function runPrettier(root: string, patterns: ReadonlyArray<string> = ['.']) {
  const result = spawnSync(prettier, ['--check', ...patterns], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function runEslint(root: string, patterns: ReadonlyArray<string> = ['.']) {
  const result = spawnSync(eslint, ['--config', eslintConfig, ...patterns], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-010',
  'format-check-cli',
  ['format-enforced', 'format-ignore-list', 'baseline-restorable'],
  async (context, check) => {
    await check('format-enforced', async () => {
      const fixture = await baselineRoot({ 'src/unformatted.ts': 'const a=1\n' });
      try {
        const result = runPrettier(fixture.root);
        context.expect(result.status).not.toBe(0);
        context.expect(result.output).toContain('src/unformatted.ts');
        // check:fast 必须包含 format:check，否则格式基线不进快速门禁。
        const root = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
          scripts: Record<string, string>;
        };
        context
          .expect((root.scripts['check:fast'] ?? '').split('&&').map((step) => step.trim()))
          .toContain('pnpm format:check');
      } finally {
        fixture.cleanup();
      }
    });

    await check('format-ignore-list', async () => {
      const fixture = await baselineRoot({
        'src/unformatted.ts': 'const a=1\n',
        '.local/unformatted.ts': 'const local=1\n',
        'openspec/specs/unformatted.ts': 'const spec=1\n',
      });
      const ignoredOnly = await baselineRoot({
        '.local/unformatted.ts': 'const local=1\n',
        'openspec/specs/unformatted.ts': 'const spec=1\n',
      });
      try {
        const result = runPrettier(fixture.root);
        context.expect(result.status).not.toBe(0);
        context.expect(result.output).toContain('src/unformatted.ts');
        context.expect(result.output).not.toContain('.local/unformatted.ts');
        context.expect(result.output).not.toContain('openspec/specs/unformatted.ts');
        context.expect(runPrettier(ignoredOnly.root).status).toBe(0);
      } finally {
        fixture.cleanup();
        ignoredOnly.cleanup();
      }
    });

    await check('baseline-restorable', async () => {
      const fixture = await baselineRoot({ 'src/formatted.ts': 'export const value = 1;\n' });
      try {
        const result = runPrettier(fixture.root);
        context
          .expect(result.output, result.output)
          .toContain('All matched files use Prettier code style!');
        context.expect(result.status).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-010',
  'max-lines-cli',
  ['max-lines-enforced', 'exemptions-by-manifest', 'ignore-entries', 'baseline-restorable'],
  async (context, check) => {
    await check('max-lines-enforced', async () => {
      const fixture = await baselineRoot({
        'src/ok-300.ts': codeLines(300),
        'src/padded.ts': paddedLines(),
        'src/over-301.ts': codeLines(301),
        'src/over-601.test.ts': codeLines(601),
        'src/at-600.test.ts': codeLines(600),
      });
      try {
        const result = runEslint(fixture.root);
        context.expect(result.status).not.toBe(0);
        context.expect(result.output).toContain('src/over-301.ts');
        context
          .expect(result.output)
          .toContain('File has too many lines (301). Maximum allowed is 300');
        context.expect(result.output).toContain('src/over-601.test.ts');
        context
          .expect(result.output)
          .toContain('File has too many lines (601). Maximum allowed is 600');
        // 恰好到限、只因空行与注释超出的文件都不报。
        context.expect(result.output).not.toContain('src/ok-300.ts');
        context.expect(result.output).not.toContain('src/at-600.test.ts');
        context.expect(result.output).not.toContain('src/padded.ts');
      } finally {
        fixture.cleanup();
      }
    });

    await check('exemptions-by-manifest', async () => {
      const exemptManifest = {
        ...minimalManifest(),
        quality: {
          coverageExclusions: [],
          maxLinesExemptions: [{ path: 'src/legacy.ts', reason: '历史文件待拆分' }],
        },
      };
      const exempted = await baselineRoot({ 'src/legacy.ts': codeLines(301) }, exemptManifest);
      const strict = await baselineRoot({ 'src/legacy.ts': codeLines(301) });
      try {
        context.expect(runEslint(exempted.root).status).toBe(0);
        const strictResult = runEslint(strict.root);
        context.expect(strictResult.status).not.toBe(0);
        context.expect(strictResult.output).toContain('File has too many lines (301)');
        // 模板自身的豁免登记为空：超限只能拆分，没有整文件豁免。
        const own = JSON.parse(
          readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
        ) as { quality: { maxLinesExemptions: unknown[] } };
        context.expect(own.quality.maxLinesExemptions).toEqual([]);
      } finally {
        exempted.cleanup();
        strict.cleanup();
      }
    });

    await check('ignore-entries', async () => {
      const fixture = await baselineRoot({
        '.local/over.ts': codeLines(301),
        'src/over.ts': codeLines(301),
      });
      try {
        // 显式指向 .local 下的超限文件：被 ESLint ignores 跳过（只留忽略警告）。
        const ignored = runEslint(fixture.root, ['.local/over.ts']);
        context.expect(ignored.output).toContain('matching ignore pattern');
        context.expect(ignored.status).toBe(0);
        const listed = runEslint(fixture.root, ['src/over.ts']);
        context.expect(listed.status).not.toBe(0);
        context
          .expect(listed.output)
          .toContain('File has too many lines (301). Maximum allowed is 300');
        // .gitignore 不再忽略 openspec/schemas/（本地工作流 schema 走 .git/info/exclude）。
        const gitignore = readFileSync(join(repositoryRoot, '.gitignore'), 'utf8')
          .split('\n')
          .map((line) => line.trim());
        context.expect(gitignore).not.toContain('openspec/schemas/');
      } finally {
        fixture.cleanup();
      }
    });

    await check('baseline-restorable', async () => {
      const fixture = await baselineRoot({ 'src/ok.ts': codeLines(12) });
      try {
        const result = runEslint(fixture.root);
        context.expect(result.output.trim()).toBe('');
        context.expect(result.status).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });
  },
);
