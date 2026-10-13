import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type {} from '../../packages/e2e/src/vitest.d.ts';
import {
  commentModeForProduct,
  sourceModeIssues,
} from '../../packages/e2e/tests/tooling/public-doc.ts';

function sourceFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'source-doc-'));
  const files: Record<string, string> = {
    'src/core/model.ts': [
      '/** 核心模型。 */',
      'export interface CoreModel {',
      '  /** 值。 */',
      '  value: string;',
      '}',
      '',
    ].join('\n'),
    'src/ports/first.ts': [
      '/** 第一端口。 */',
      'export interface FirstPort {',
      '  /** 同名字段。 */',
      '  shared: string;',
      '}',
      '',
    ].join('\n'),
    'src/ports/second.ts': [
      '/** 第二端口。 */',
      'export interface SecondPort {',
      '  /** 同名字段。 */',
      '  shared: string;',
      '}',
      '',
    ].join('\n'),
    'src/stores/global.ts': [
      '/** 全局状态。 */',
      'export interface GlobalState {',
      '  /** 当前值。 */',
      '  value: number;',
      '}',
      '',
    ].join('\n'),
    'src/context.ts': [
      '/** 模块上下文。 */',
      'export interface ModuleContext {',
      '  /** 名称。 */',
      '  name: string;',
      '}',
      '/** 模块上下文键。 */',
      'export const contextKey: InjectionKey<ModuleContext> = Symbol();',
      '',
    ].join('\n'),
    'src/consumed.ts': [
      '/** 消费接口。 */',
      'export interface ConsumedOperation {',
      '  /** 接口名。 */',
      '  name: string;',
      '}',
      '',
    ].join('\n'),
    'src/ui/Internal.vue': 'export type Internal = { value: string };\n',
    'src/generated/model.ts': 'export interface Generated { value: string }\n',
  };
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

test(
  'SCN-TEMPLATE-ENGINEERING-016 source-mode-rules',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-ENGINEERING-016',
        caseId: 'source-mode-rules',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-TEMPLATE-ENGINEERING-016',
            caseKey: 'source-mode-rules',
            checks: [
              'source-mode-scope',
              'source-mode-structure',
              'no-declaration-required',
              'mode-by-form',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const root = sourceFixture();
    const discover = () =>
      sourceModeIssues({
        root,
        packageRoot: root,
        globalStore: 'src/stores/global.ts',
        consumedOperations: ['src/consumed.ts'],
      });
    try {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      const checkpoint = async (name: string, assertion: () => void | Promise<void>) => {
        await assertion();
        executed.push(name);
      };

      await checkpoint('source-mode-scope', () => {
        context.expect(discover()).toEqual([]);
      });

      await checkpoint('mode-by-form', () => {
        context.expect(commentModeForProduct('sdk')).toBe('entry');
        context.expect(commentModeForProduct('web-app')).toBe('source');
      });

      await checkpoint('source-mode-structure', () => {
        const core = join(root, 'src/core/model.ts');
        writeFileSync(core, 'export interface CoreModel { value: string }\n');
        context.expect(discover().join('\n')).toContain('src/core/model.ts');

        writeFileSync(
          join(root, 'src/context.ts'),
          'export interface ModuleContext { name: string }\n' +
            '/** 模块上下文键。 */\n' +
            'export const contextKey: InjectionKey<ModuleContext> = Symbol();\n',
        );
        context.expect(discover().join('\n')).toContain('src/context.ts');

        writeFileSync(
          join(root, 'src/ui/Internal.vue'),
          'export type Internal = { value: string };\n',
        );
        writeFileSync(
          join(root, 'src/generated/model.ts'),
          'export interface Generated { value: string }\n',
        );
        context.expect(discover().join('\n')).not.toContain('src/ui/');
        context.expect(discover().join('\n')).not.toContain('src/generated/');
      });

      await checkpoint('no-declaration-required', () => {
        writeFileSync(
          join(root, 'src/stores/global.ts'),
          '/** 全局状态。 */\nexport interface GlobalState { value: number }\n',
        );
        context.expect(discover().join('\n')).toContain('src/stores/global.ts');

        writeFileSync(
          join(root, 'src/consumed.ts'),
          'export interface ConsumedOperation { name: string }\n',
        );
        context.expect(discover().join('\n')).toContain('src/consumed.ts');
      });

      context
        .expect(executed.sort())
        .toEqual(
          [
            'source-mode-scope',
            'source-mode-structure',
            'no-declaration-required',
            'mode-by-form',
          ].sort(),
        );
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
