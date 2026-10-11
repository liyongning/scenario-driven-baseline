import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, test, type TestContext } from 'vitest';
import {
  bindingForProduct,
  loadProjectManifest,
  packageByDirectory,
  packagesByRole,
  testPackage,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { createBuildCopy, type RepositoryCopy } from './repository-copy.ts';
import { repositoryRoot } from './helpers.ts';

/** 依赖规则生成函数在 CJS 中实现，与被验证的依赖与 lint 规则共用同一份模块。 */
type DependencyRules = Readonly<{
  cruiseTargets(manifest: ProjectManifest): string[];
  dependencyRules(
    manifest: ProjectManifest,
  ): ReadonlyArray<Readonly<{ name: string; from: { path: string } }>>;
}>;
const dependencyRules = createRequire(import.meta.url)(
  '../../../../scripts/lib/dependency-rules.cjs',
) as DependencyRules;

const repositoryManifest = loadProjectManifest(repositoryRoot);
const productPackage = packagesByRole(repositoryManifest, 'product').find(
  (item) => item.form === 'sdk',
);
if (!productPackage) throw new Error('template has no sdk product package');
const protocolPackage = packageByDirectory(
  repositoryManifest,
  bindingForProduct(repositoryManifest, productPackage.directory).protocol,
);
const protocolPackages = packagesByRole(repositoryManifest, 'protocol');
const e2ePackage = testPackage(repositoryManifest);
const productSource = `packages/${productPackage.directory}/src`;
const protocolSource = `packages/${protocolPackage.directory}/src`;

let copy: RepositoryCopy;
const copies: RepositoryCopy[] = [];

/** 在受控副本中执行门禁工具：规则从副本自己的工作目录读取清单，副本才是被测对象。 */
function execute(root: string, command: string, args: string[]) {
  return spawnSync(resolve(root, 'node_modules/.bin', command), args, {
    cwd: root,
    encoding: 'utf8',
  });
}

function write(root: string, relative: string, text: string): string {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return relative;
}

/** 去掉模板示例：受控临时根不含示例时，合成模块的反例证据依然成立。 */
function removeTemplateExample(root: string, productDirectory: string): void {
  rmSync(join(root, 'packages', productDirectory, 'src', 'example'), {
    recursive: true,
    force: true,
  });
  writeFileSync(join(root, 'packages', productDirectory, 'src', 'index.ts'), 'export {};\n');
}

function cruise(root: string, targets: ReadonlyArray<string>) {
  return execute(root, 'depcruise', [
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'err-long',
    ...targets,
  ]);
}

function expectViolation(context: TestContext, root: string, target: string, rule: string): void {
  const result = cruise(root, [target]);
  context.expect(result.status).not.toBe(0);
  context.expect(result.stdout + result.stderr).toContain(rule);
}

/** 恢复合法依赖后整个依赖图必须通过。 */
function expectRestored(context: TestContext, root: string, manifest: ProjectManifest): void {
  const result = cruise(root, dependencyRules.cruiseTargets(manifest));
  context.expect(result.status, `${result.stdout ?? ''}${result.stderr ?? ''}`).toBe(0);
}

beforeAll(() => {
  copy = createBuildCopy({ prefix: 'template-engineering-007-' });
  copies.push(copy);
  removeTemplateExample(copy.root, productPackage.directory);
  // 产品包以协议包 generated 子路径导入方法常量；副本不含构建产物，先构建协议包再巡航依赖图。
  for (const protocol of protocolPackages) {
    const built = spawnSync('pnpm', ['--filter', protocol.name, 'build'], {
      cwd: copy.root,
      encoding: 'utf8',
    });
    if (built.status !== 0)
      throw new Error(`${protocol.name} build in copy failed: ${built.stdout}${built.stderr}`);
  }
}, 120_000);

afterAll(() => {
  for (const item of copies.splice(0)) item.cleanup();
});

const scenarioCase = (caseId: string, checks: string[]) => ({
  meta: {
    scenarioCase: {
      ownerId: 'SCN-TEMPLATE-ENGINEERING-007',
      caseId,
      environment: 'integration',
      fixtureCase: caseId,
      covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-007', caseKey: caseId, checks }],
    },
  },
});

test(
  'SCN-TEMPLATE-ENGINEERING-007 synthetic-dependency-direction',
  {
    timeout: 120_000,
    ...scenarioCase('synthetic-dependency-direction', [
      'dependency-direction-blocked',
      'synthetic-restorable',
    ]),
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const reverse = write(
      copy.root,
      `${protocolSource}/synthetic-reverse.ts`,
      `import '../../${productPackage.directory}/src/index';\n`,
    );
    expectViolation(context, copy.root, reverse, 'protocol-no-reverse-import');
    const toTestPackage = write(
      copy.root,
      `${protocolSource}/synthetic-to-test-package.ts`,
      `import '../../${e2ePackage.directory}/src/synthetic-target';\n`,
    );
    write(
      copy.root,
      `packages/${e2ePackage.directory}/src/synthetic-target.ts`,
      'export const syntheticTarget = 1;\n',
    );
    expectViolation(context, copy.root, toTestPackage, 'protocol-no-reverse-import');
    const leak = write(
      copy.root,
      `${protocolSource}/synthetic-test-leak.ts`,
      `import '../testing/index';\n`,
    );
    expectViolation(context, copy.root, leak, 'production-no-test');
    write(
      copy.root,
      `${protocolSource}/synthetic-internal.ts`,
      'export const syntheticInternal = 1;\n',
    );
    const crossPackage = write(
      copy.root,
      `${productSource}/synthetic-cross-package.ts`,
      `import '../../${protocolPackage.directory}/src/synthetic-internal';\n`,
    );
    expectViolation(
      context,
      copy.root,
      crossPackage,
      `product-bound-protocol-exports-only:${productPackage.directory}`,
    );
    for (const relative of [reverse, toTestPackage, leak, crossPackage])
      rmSync(join(copy.root, relative), { force: true });
    rmSync(join(copy.root, `${protocolSource}/synthetic-internal.ts`), { force: true });
    rmSync(join(copy.root, `packages/${e2ePackage.directory}/src/synthetic-target.ts`), {
      force: true,
    });
    expectRestored(context, copy.root, repositoryManifest);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['dependency-direction-blocked', 'synthetic-restorable'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-TEMPLATE-ENGINEERING-007 synthetic-module-isolation',
  {
    timeout: 120_000,
    ...scenarioCase('synthetic-module-isolation', [
      'module-isolation-blocked',
      'synthetic-restorable',
    ]),
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const domainContract = write(
      copy.root,
      `${productSource}/synthetic-domain/contracts.ts`,
      'export type SyntheticThing = { value: string };\n',
    );
    const other = write(
      copy.root,
      `${productSource}/synthetic-other/contracts.ts`,
      "import type { SyntheticThing } from '../synthetic-domain/contracts';\nvoid (null as unknown as SyntheticThing);\n",
    );
    expectViolation(context, copy.root, other, 'domain-isolation');
    const domainBack = write(
      copy.root,
      `${productSource}/synthetic-domain/back-reference.ts`,
      "import type { SyntheticOther } from '../synthetic-other/contracts';\nvoid (null as unknown as SyntheticOther);\n",
    );
    write(
      copy.root,
      `${productSource}/synthetic-other/contracts.ts`,
      'export type SyntheticOther = { value: string };\n',
    );
    expectViolation(context, copy.root, domainBack, 'domain-isolation');
    for (const relative of [domainContract, other, domainBack])
      rmSync(join(copy.root, relative), { force: true });
    rmSync(join(copy.root, `${productSource}/synthetic-domain`), { recursive: true, force: true });
    rmSync(join(copy.root, `${productSource}/synthetic-other`), { recursive: true, force: true });
    expectRestored(context, copy.root, repositoryManifest);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['module-isolation-blocked', 'synthetic-restorable'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-TEMPLATE-ENGINEERING-007 synthetic-core-platform',
  {
    timeout: 120_000,
    ...scenarioCase('synthetic-core-platform', ['core-platform-blocked', 'synthetic-restorable']),
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const generated = write(
      copy.root,
      `${productSource}/synthetic-domain/core/synthetic-generated.ts`,
      `import '../../../../${protocolPackage.directory}/src/generated/index';\n`,
    );
    expectViolation(context, copy.root, generated, 'domain-core-no-generated');
    const nodeBuiltin = write(
      copy.root,
      `${productSource}/synthetic-domain/core/synthetic-node.ts`,
      "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n",
    );
    expectViolation(context, copy.root, nodeBuiltin, 'core-no-platform-or-node');
    const wx = write(
      copy.root,
      `${productSource}/synthetic-domain/core/synthetic-wx.ts`,
      'void wx;\n',
    );
    const lint = execute(copy.root, 'eslint', [wx]);
    context.expect(lint.status).not.toBe(0);
    context.expect(lint.stdout + lint.stderr).toContain('no-restricted-globals');
    for (const relative of [generated, nodeBuiltin, wx])
      rmSync(join(copy.root, relative), { force: true });
    rmSync(join(copy.root, `${productSource}/synthetic-domain`), { recursive: true, force: true });
    expectRestored(context, copy.root, repositoryManifest);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['core-platform-blocked', 'synthetic-restorable'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-TEMPLATE-ENGINEERING-007 synthetic-shadow-engine',
  {
    timeout: 120_000,
    ...scenarioCase('synthetic-shadow-engine', ['shadow-engine-blocked', 'synthetic-restorable']),
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const engine = write(
      copy.root,
      `packages/${e2ePackage.directory}/src/shadow/synthetic-engine.ts`,
      `import '../../../${protocolPackage.directory}/src/generated/index';\n`,
    );
    expectViolation(context, copy.root, engine, 'shadow-engine-no-generated');
    rmSync(join(copy.root, engine), { force: true });
    expectRestored(context, copy.root, repositoryManifest);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['shadow-engine-blocked', 'synthetic-restorable'],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-TEMPLATE-ENGINEERING-007 synthetic-renamed-manifest',
  {
    timeout: 120_000,
    ...scenarioCase('synthetic-renamed-manifest', [
      'rules-by-role',
      'dependency-direction-blocked',
    ]),
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const renamed = createBuildCopy({ prefix: 'template-engineering-007-renamed-' });
    copies.push(renamed);
    const renamedProduct = 'renamed-product';
    const renamedProtocol = 'renamed-protocol';
    renameSync(
      join(renamed.root, `packages/${productPackage.directory}`),
      join(renamed.root, `packages/${renamedProduct}`),
    );
    renameSync(
      join(renamed.root, `packages/${protocolPackage.directory}`),
      join(renamed.root, `packages/${renamedProtocol}`),
    );
    const manifestPath = join(renamed.root, 'project.manifest.json');
    const renamedManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      packages: Array<{ directory: string; name: string; role: string }>;
      bindings: Array<{ product: string; protocol: string }>;
    };
    const directories: Record<string, string> = {
      product: renamedProduct,
      protocol: renamedProtocol,
    };
    for (const entry of renamedManifest.packages) {
      if (entry.role !== 'product' && entry.role !== 'protocol') continue;
      entry.directory = directories[entry.role]!;
      entry.name = `@renamed/${entry.role}`;
    }
    for (const binding of renamedManifest.bindings) {
      binding.product = renamedProduct;
      binding.protocol = renamedProtocol;
    }
    writeFileSync(manifestPath, `${JSON.stringify(renamedManifest, null, 2)}\n`);
    removeTemplateExample(renamed.root, renamedProduct);
    const generated = dependencyRules.dependencyRules(
      renamedManifest as unknown as ProjectManifest,
    );
    const reverseRule = generated.find((rule) => rule.name === 'protocol-no-reverse-import')!;
    context.expect(reverseRule.from.path).toContain(renamedProtocol);
    context
      .expect(JSON.stringify(generated))
      .not.toContain(`packages/${productPackage.directory}/`);
    const reverse = write(
      renamed.root,
      `packages/${renamedProtocol}/src/synthetic-reverse.ts`,
      `import '../../${renamedProduct}/src/index';\n`,
    );
    expectViolation(context, renamed.root, reverse, 'protocol-no-reverse-import');
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['rules-by-role', 'dependency-direction-blocked'],
      }),
      'scenario-evidence',
    );
  },
);
