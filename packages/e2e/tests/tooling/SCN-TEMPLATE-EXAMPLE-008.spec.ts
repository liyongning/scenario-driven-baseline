import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, test } from 'vitest';
import { loadProjectManifest, packageByRole } from '../../../../scripts/lib/project-manifest.ts';
import { createBuildCopy, type RepositoryCopy } from './repository-copy.ts';

const manifest = loadProjectManifest(process.cwd());
const productPackage = packageByRole(manifest, 'product');
const protocolPackage = packageByRole(manifest, 'protocol');
const exampleCore = `packages/${productPackage.directory}/src/example/core`;

let copy: RepositoryCopy;

/** 在受控临时副本中执行门禁工具，副本才是被测对象，原仓库只作为复制来源。 */
function execute(command: string, args: string[]) {
  return spawnSync(resolve(copy.root, 'node_modules/.bin', command), args, {
    cwd: copy.root,
    encoding: 'utf8',
  });
}

beforeAll(() => {
  copy = createBuildCopy({ prefix: 'template-example-008-' });
  const built = spawnSync('pnpm', ['--filter', protocolPackage.name, 'build'], {
    cwd: copy.root,
    encoding: 'utf8',
  });
  if (built.status !== 0) throw new Error(`协议包副本构建失败: ${built.stderr}`);
}, 120_000);

afterAll(() => copy?.cleanup());

// 单文件内串行启动多个 depcruise/eslint 子进程，高负载下可能超过默认超时；单独放宽断言不变。
test(
  'SCN-TEMPLATE-EXAMPLE-008 dependency-violations',
  {
    timeout: 120_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-008',
        caseId: 'dependency-violations',
        environment: 'integration',
        fixtureCase: 'dependency-violations',
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-008',
            caseKey: 'dependency-violations',
            checks: ['example-core-isolated', 'restored-passes'],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const temporaryFiles = [
      resolve(copy.root, exampleCore, 'example-rule-generated.ts'),
      resolve(copy.root, exampleCore, 'example-rule-wx.ts'),
      resolve(copy.root, exampleCore, 'example-rule-node.ts'),
    ];
    try {
      writeFileSync(
        temporaryFiles[0]!,
        `import { BaseReq } from '${protocolPackage.name}/generated/idl/base';\nvoid BaseReq;\n`,
      );
      const generated = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        `${exampleCore}/example-rule-generated.ts`,
      ]);
      context.expect(generated.status).not.toBe(0);
      context.expect(generated.stdout + generated.stderr).toContain('domain-core-no-generated');
      writeFileSync(temporaryFiles[1]!, 'void wx;\n');
      const wx = execute('eslint', [`${exampleCore}/example-rule-wx.ts`]);
      context.expect(wx.status).not.toBe(0);
      context.expect(wx.stdout + wx.stderr).toContain('no-restricted-globals');
      writeFileSync(
        temporaryFiles[2]!,
        "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n",
      );
      const node = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        `${exampleCore}/example-rule-node.ts`,
      ]);
      context.expect(node.status).not.toBe(0);
      context.expect(node.stdout + node.stderr).toContain('core-no-platform-or-node');
      for (const path of temporaryFiles) rmSync(path, { force: true });
      const restored = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        `packages/${productPackage.directory}/src`,
        `packages/${protocolPackage.directory}/src`,
      ]);
      context.expect(restored.status).toBe(0);
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: ['example-core-isolated', 'restored-passes'],
        }),
        'scenario-evidence',
      );
    } finally {
      for (const path of temporaryFiles) rmSync(path, { force: true });
    }
  },
);
