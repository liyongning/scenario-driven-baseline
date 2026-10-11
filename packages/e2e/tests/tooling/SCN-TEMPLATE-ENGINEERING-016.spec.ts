import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import {
  commentModeForProduct,
  discoverSourceDocRequirements,
  sourceModeIssues,
} from './public-doc.ts';

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-016',
  'source-mode-cli',
  ['source-mode-scope', 'source-mode-structure', 'mode-by-form', 'source-mode-restorable'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      const packageRoot = join(root.root, 'packages/web-product');
      const files = {
        core: join(packageRoot, 'src/core/state.ts'),
        store: join(packageRoot, 'src/stores/global.ts'),
        context: join(packageRoot, 'src/context.ts'),
        consumed: join(packageRoot, 'src/consumed.ts'),
        secondPort: join(packageRoot, 'src/ports/second.ts'),
      };
      const original = Object.fromEntries(
        Object.entries(files).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
      ) as Record<keyof typeof files, string>;
      const discover = () =>
        sourceModeIssues({
          root: root.root,
          packageRoot,
          globalStore: 'src/stores/global.ts',
          consumedOperations: ['src/consumed.ts'],
        });

      await check('source-mode-scope', () => {
        context.expect(discover()).toEqual([]);
        const names = discoverSourceDocRequirements({
          root: root.root,
          packageRoot,
          globalStore: 'src/stores/global.ts',
          consumedOperations: ['src/consumed.ts'],
        }).map((item) => item.name);
        for (const name of [
          'State',
          'FirstPort',
          'SecondPort',
          'GlobalState',
          'ModuleContext',
          'WebOperation',
        ])
          context.expect(names).toContain(name);
      });
      await check('source-mode-structure', () => {
        writeFileSync(files.core, 'export interface State { value: number }\n');
        context.expect(discover().join('\n')).toContain('src/core/state.ts');
        writeFileSync(
          files.store,
          '/** 全局状态。 */\nexport interface GlobalState { value: number }\n',
        );
        context.expect(discover().join('\n')).toContain('src/stores/global.ts');
        writeFileSync(
          files.context,
          'export interface ModuleContext { name: string }\n' +
            '/** 模块上下文键。 */\n' +
            'export const contextKey: InjectionKey<ModuleContext> = Symbol();\n',
        );
        context.expect(discover().join('\n')).toContain('src/context.ts');
        writeFileSync(files.consumed, 'export interface WebOperation { name: string }\n');
        context.expect(discover().join('\n')).toContain('src/consumed.ts');
        writeFileSync(
          files.secondPort,
          '/** 第二端口。 */\nexport interface SecondPort { shared: string }\n',
        );
        context.expect(discover().join('\n')).toContain('SecondPort.shared');
      });
      await check('mode-by-form', () => {
        context.expect(commentModeForProduct('sdk')).toBe('entry');
        context.expect(commentModeForProduct('web-app')).toBe('source');
      });
      await check('source-mode-restorable', () => {
        for (const [key, path] of Object.entries(files))
          writeFileSync(path, original[key as keyof typeof files]);
        context.expect(discover()).toEqual([]);
      });
    } finally {
      root.cleanup();
    }
  },
);
