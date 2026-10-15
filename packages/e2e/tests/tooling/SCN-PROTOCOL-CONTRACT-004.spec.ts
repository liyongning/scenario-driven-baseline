import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { repositoryRoot } from './helpers.ts';
import {
  loadProjectManifest,
  packagesByRole,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';

function sourceRoot(pkg: ProjectManifest['packages'][number]) {
  return pkg.moduleRoots?.[0] ?? 'src';
}

function packageRoots(pkg: ProjectManifest['packages'][number]) {
  return [...new Set([...(pkg.moduleRoots ?? ['src']), 'testing'])];
}

function depcruise(root: string, target: string | ReadonlyArray<string>) {
  return spawnSync(
    resolve('node_modules/.bin/depcruise'),
    ['--config', '.dependency-cruiser.cjs', '--output-type', 'err-long', ...[target].flat()],
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
      const protocols = packagesByRole(loadProjectManifest(repositoryRoot), 'protocol');
      cpSync(resolve('package.json'), join(root, 'package.json'));
      cpSync(resolve('project.manifest.json'), join(root, 'project.manifest.json'));
      cpSync(resolve('tsconfig.base.json'), join(root, 'tsconfig.base.json'));
      cpSync(resolve('.dependency-cruiser.cjs'), join(root, '.dependency-cruiser.cjs'));
      // 依赖规则和协议测试设施都由共享脚本派生；副本必须保留同一套公共模块。
      cpSync(resolve('scripts/lib'), join(root, 'scripts/lib'), { recursive: true });
      for (const protocol of protocols) {
        const packageRoot = join(root, 'packages', protocol.directory);
        mkdirSync(packageRoot, { recursive: true });
        for (const directory of packageRoots(protocol)) {
          const source = resolve('packages', protocol.directory, directory);
          if (existsSync(source)) cpSync(source, join(packageRoot, directory), { recursive: true });
        }
        const dist = resolve('packages', protocol.directory, 'dist');
        if (existsSync(dist)) cpSync(dist, join(packageRoot, 'dist'), { recursive: true });
        cpSync(
          resolve('packages', protocol.directory, 'package.json'),
          join(packageRoot, 'package.json'),
        );
      }
      mkdirSync(join(root, 'packages/e2e'), { recursive: true });
      cpSync(resolve('packages/e2e/src/shadow'), join(root, 'packages/e2e/src/shadow'), {
        recursive: true,
      });
      cpSync(resolve('packages/e2e/package.json'), join(root, 'packages/e2e/package.json'));
      symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');

      const engine = join(root, 'packages/e2e/src/shadow/server.ts');
      for (const protocol of protocols) {
        const generated = join(
          root,
          'packages',
          protocol.directory,
          sourceRoot(protocol),
          'generated/probe.ts',
        );
        mkdirSync(join(root, 'packages', protocol.directory, sourceRoot(protocol), 'generated'), {
          recursive: true,
        });
        writeFileSync(generated, 'export {};\n');
        writeFileSync(
          engine,
          `${readFileSync(engine, 'utf8')}\nimport '../../../${protocol.directory}/${sourceRoot(protocol)}/generated/probe.ts';\n`,
        );
        const generatedViolation = depcruise(root, 'packages/e2e/src/shadow/server.ts');
        context.expect(generatedViolation.status).not.toBe(0);
        context
          .expect(generatedViolation.stdout + generatedViolation.stderr)
          .toContain('shadow-engine-no-generated');

        const routeConstructor = join(root, 'packages/e2e/src/shadow/route-import.ts');
        writeFileSync(
          routeConstructor,
          `import '../../../${protocol.directory}/testing/adapter.ts';\n`,
        );
        const testingViolation = depcruise(root, 'packages/e2e/src/shadow/route-import.ts');
        context.expect(testingViolation.status).not.toBe(0);
        context
          .expect(testingViolation.stdout + testingViolation.stderr)
          .toContain('shadow-engine-no-generated');
      }

      // 反例：业务路由目录是路由来源，不受引擎约束——导入 generated 时依赖检查通过（PC-03 只约束引擎文件）。
      for (const protocol of protocols) {
        const businessRoute = join(
          root,
          'packages',
          protocol.directory,
          'testing/shadow/payment/routes.ts',
        );
        mkdirSync(join(businessRoute, '..'), { recursive: true });
        writeFileSync(
          businessRoute,
          `import '../../../${sourceRoot(protocol)}/generated/probe.ts';\n`,
        );
        const allowed = depcruise(
          root,
          `packages/${protocol.directory}/testing/shadow/payment/routes.ts`,
        );
        context.expect(allowed.status, allowed.stdout + allowed.stderr).toBe(0);

        const protocolFile = join(root, 'packages', protocol.directory, 'testing/reverse.ts');
        writeFileSync(protocolFile, "import '../../e2e/src/shadow/server.ts';\n");
        const reverseViolation = depcruise(
          root,
          `packages/${protocol.directory}/testing/reverse.ts`,
        );
        context.expect(reverseViolation.status).not.toBe(0);
        context
          .expect(reverseViolation.stdout + reverseViolation.stderr)
          .toContain('protocol-no-reverse-import');

        const testingEntry = join(root, 'packages', protocol.directory, 'testing/index.ts');
        if (existsSync(testingEntry)) {
          const exports = (await import(pathToFileURL(testingEntry).href)) as Record<
            string,
            unknown
          >;
          context.expect(exports.createShadowServer).toBeUndefined();
          context.expect(exports.compareJsonPresence).toBeUndefined();
        }
      }

      // 未修改的仓库中协议包源码通过依赖检查。
      const restored = depcruise(
        repositoryRoot,
        protocols.map((protocol) => `packages/${protocol.directory}/${sourceRoot(protocol)}`),
      );
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
