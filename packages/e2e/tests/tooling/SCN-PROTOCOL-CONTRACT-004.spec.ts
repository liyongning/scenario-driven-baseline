import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';

function depcruise(root: string, target: string) {
  return spawnSync(
    resolve('node_modules/.bin/depcruise'),
    ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', target],
    { cwd: root, encoding: 'utf8' },
  );
}

test(
  'SCN-PROTOCOL-CONTRACT-004 engine-no-generated-cli',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-004',
        caseId: 'engine-no-generated-cli',
        environment: 'integration',
        fixtureCase: 'engine-no-generated',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-004',
            caseKey: 'engine-no-generated-cli',
            checks: ['engine-no-generated'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // 临时副本：绝不修改仓库中被跟踪的 server.ts。
    const root = mkdtempSync(join(tmpdir(), 'shadow-engine-cli-'));
    try {
      cpSync(resolve('package.json'), join(root, 'package.json'));
      cpSync(resolve('tsconfig.base.json'), join(root, 'tsconfig.base.json'));
      cpSync(resolve('.dependency-cruiser.cjs'), join(root, '.dependency-cruiser.cjs'));
      mkdirSync(join(root, 'packages/protocol'), { recursive: true });
      // 真实复制协议包源码与测试设施：依赖检查按相对路径前缀匹配规则，符号链接会让路径变成仓库绝对路径。
      cpSync(resolve('packages/protocol/testing'), join(root, 'packages/protocol/testing'), {
        recursive: true,
      });
      cpSync(resolve('packages/protocol/src'), join(root, 'packages/protocol/src'), {
        recursive: true,
      });
      cpSync(
        resolve('packages/protocol/package.json'),
        join(root, 'packages/protocol/package.json'),
      );
      symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');

      const engine = join(root, 'packages/protocol/testing/shadow/server.ts');
      writeFileSync(
        engine,
        `${readFileSync(engine, 'utf8')}\nimport type { RpcMethodMeta } from '../../src/generated/std.ts';\nvoid (null as unknown as RpcMethodMeta<unknown, unknown>);\n`,
      );
      const violated = depcruise(root, 'packages/protocol/testing/shadow/server.ts');
      context.expect(violated.status).not.toBe(0);
      context.expect(violated.stdout + violated.stderr).toContain('shadow-engine-no-generated');

      // 未修改的仓库中协议包源码通过依赖检查。
      const restored = depcruise(process.cwd(), 'packages/protocol/src');
      context.expect(restored.status).toBe(0);

      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - assertionsBefore,
          checkpoints: ['engine-no-generated'],
        }),
        'scenario-evidence',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
