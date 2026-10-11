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
import { repositoryRoot } from './helpers.ts';

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
            checks: ['engine-no-generated', 'engine-in-test-infra'],
          },
        ],
      },
    },
    timeout: 30_000,
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    // 临时副本：绝不修改仓库中被跟踪的 server.ts。
    const root = mkdtempSync(join(tmpdir(), 'shadow-engine-cli-'));
    try {
      cpSync(resolve('package.json'), join(root, 'package.json'));
      cpSync(resolve('project.manifest.json'), join(root, 'project.manifest.json'));
      cpSync(resolve('tsconfig.base.json'), join(root, 'tsconfig.base.json'));
      cpSync(resolve('.dependency-cruiser.cjs'), join(root, '.dependency-cruiser.cjs'));
      // 依赖规则由清单派生，配置 require 的共享模块必须一并复制到副本。
      mkdirSync(join(root, 'scripts/lib'), { recursive: true });
      cpSync(
        resolve('scripts/lib/dependency-rules.cjs'),
        join(root, 'scripts/lib/dependency-rules.cjs'),
      );
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
      mkdirSync(join(root, 'packages/e2e'), { recursive: true });
      cpSync(resolve('packages/e2e/src/shadow'), join(root, 'packages/e2e/src/shadow'), {
        recursive: true,
      });
      cpSync(resolve('packages/e2e/package.json'), join(root, 'packages/e2e/package.json'));
      symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');

      const engine = join(root, 'packages/e2e/src/shadow/server.ts');
      writeFileSync(
        engine,
        `${readFileSync(engine, 'utf8')}\nimport type { RpcMethodMeta } from '../../../protocol/src/generated/std.ts';\nvoid (null as unknown as RpcMethodMeta<unknown, unknown>);\n`,
      );
      const generatedViolation = depcruise(root, 'packages/e2e/src/shadow/server.ts');
      context.expect(generatedViolation.status).not.toBe(0);
      context
        .expect(generatedViolation.stdout + generatedViolation.stderr)
        .toContain('shadow-engine-no-generated');

      const routeConstructor = join(root, 'packages/e2e/src/shadow/route-import.ts');
      writeFileSync(
        routeConstructor,
        "import { routesFromRpcMethods } from '../../../protocol/testing/shadow/idl-routes.ts';\nvoid routesFromRpcMethods;\n",
      );
      const testingViolation = depcruise(root, 'packages/e2e/src/shadow/route-import.ts');
      context.expect(testingViolation.status).not.toBe(0);
      context
        .expect(testingViolation.stdout + testingViolation.stderr)
        .toContain('shadow-engine-no-generated');

      // 反例：业务路由目录是路由来源，不受引擎约束——导入 generated 时依赖检查通过（PC-03 只约束引擎文件）。
      const businessRoute = join(root, 'packages/protocol/testing/shadow/payment/routes.ts');
      mkdirSync(join(root, 'packages/protocol/testing/shadow/payment'), { recursive: true });
      writeFileSync(
        businessRoute,
        "import type { RpcMethodMeta } from '../../../src/generated/std.ts';\nexport const paymentRoute = null as unknown as RpcMethodMeta<unknown, unknown>;\n",
      );
      const allowed = depcruise(root, 'packages/protocol/testing/shadow/payment/routes.ts');
      context.expect(allowed.status, allowed.stdout + allowed.stderr).toBe(0);

      const protocolFile = join(root, 'packages/protocol/testing/reverse.ts');
      writeFileSync(
        protocolFile,
        "import { createShadowServer } from '../../e2e/src/shadow/server.ts';\nvoid createShadowServer;\n",
      );
      const reverseViolation = depcruise(root, 'packages/protocol/testing/reverse.ts');
      context.expect(reverseViolation.status).not.toBe(0);
      context
        .expect(reverseViolation.stdout + reverseViolation.stderr)
        .toContain('protocol-no-reverse-import');

      const testingEntry = (await import('@template-test/protocol')) as Record<string, unknown>;
      context.expect(testingEntry.createShadowServer).toBeUndefined();
      context.expect(testingEntry.compareJsonPresence).toBeUndefined();

      // 未修改的仓库中协议包源码通过依赖检查。
      const restored = depcruise(repositoryRoot, 'packages/protocol/src');
      context.expect(restored.status).toBe(0);

      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - assertionsBefore,
          checkpoints: ['engine-no-generated', 'engine-in-test-infra'],
        }),
        'scenario-evidence',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
