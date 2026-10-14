// @SCN-TEMPLATE-ENGINEERING-008: 按白名单删除模板示例后门禁仍全绿。
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { afterAll, vi, type TestContext } from 'vitest';
import { buildContractInventory } from '../../../../scripts/lib/contract-inventory.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { copyCreatingSpecs } from '../../vitest.config.integration.ts';
import { expectedMissingBindings, type InventoryOutput } from './removal-expected.ts';
import {
  declarationBody,
  fixtureKeys,
  git,
  markerFiles,
  methodsInBody,
  parseInventory,
  probeSharedBindingBreak,
  removeDeclaredMatrixKeys,
  removeWhitelistedPaths,
  run,
  stripMarkedFragments,
  syncCoverageExclusions,
  writeLog,
  type DeclarationEvidence,
  type MatrixEvidence,
  type Probe,
  type Removal,
  type RemovalFixture,
} from './removal-support.ts';
import { repositoryRoot } from './helpers.ts';
import {
  createRepositoryCopy,
  scopedChangeNames,
  workspaceRealpath,
  type RepositoryCopy,
} from './repository-copy.ts';

// 副本内要重建依赖、归档作用域内 Change、跑完整 check:fast 与场景门禁，预算高于 026 的 300s。
vi.setConfig({ testTimeout: 900_000 });

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const webRemovalFixture = join(fixtureRoot, 'SCN-WEB-EXAMPLE-015', 'web-example-removal.json');
const integrationConfig = 'packages/e2e/vitest.config.integration.ts';
const specRelative = relative(repositoryRoot, fileURLToPath(import.meta.url));
const specFile = specRelative.split('/').pop()!;
const matrixSpecFiles = [
  'packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts',
  'packages/e2e/tests/tooling/openapi-matrix-temporary.spec.ts',
] as const;

type Expect = TestContext['expect'];
type Evidence = Readonly<{
  copy: RepositoryCopy;
  removal: Removal;
  removed: ReadonlyArray<string>;
  markerFiles: ReadonlyArray<string>;
  declarations: ReadonlyArray<DeclarationEvidence>;
  matrices: ReadonlyArray<MatrixEvidence>;
  coverageExcluded: ReadonlyArray<string>;
  manifestBefore: unknown;
  changed: ReadonlyArray<string>;
  fastStatus: number | null;
  fastOutput: string;
  fastLog: string;
  inventoryStatus: number | null;
  inventory: InventoryOutput;
  inventoryLog: string;
  probe: Probe;
}>;

/** 模板示例验收同时覆盖两份独立删除清单；Web 清单不存在时只删除 template-example。 */
function combinedRemoval(removal: Removal, web?: Removal): Removal {
  if (!web) return removal;
  return {
    directories: [...new Set([...removal.directories, ...web.directories])],
    files: [...new Set([...removal.files, ...web.files])],
    globs: [...removal.globs, ...web.globs],
    matrices: [...removal.matrices, ...web.matrices],
  };
}

/** 从 Web 声明所在产品绑定和清单契约读取 openapi 契约标题。 */
function contractNameForDeclaration(root: string, declaration: string): string {
  const manifest = JSON.parse(readFileSync(join(root, 'project.manifest.json'), 'utf8')) as {
    packages: Array<{
      directory: string;
      role: string;
      protocolKind?: string;
      contract?: { file: string };
    }>;
    bindings: ReadonlyArray<{ product: string; protocol: string }>;
  };
  const product = manifest.packages.find((pkg) =>
    declaration.startsWith(`packages/${pkg.directory}/`),
  );
  const protocols = new Set(
    manifest.bindings
      .filter((binding) => binding.product === product?.directory)
      .map((binding) => binding.protocol),
  );
  const openapi = manifest.packages.find(
    (pkg) =>
      protocols.has(pkg.directory) &&
      pkg.role === 'protocol' &&
      pkg.protocolKind === 'openapi' &&
      pkg.contract,
  );
  if (!openapi?.contract) throw new Error(`声明 ${declaration} 没有对应的 OpenAPI 契约`);
  const source = readFileSync(join(root, openapi.contract.file), 'utf8');
  const document = parse(source) as { info?: { title?: unknown } };
  if (typeof document.info?.title !== 'string' || document.info.title.length === 0)
    throw new Error(`契约 ${openapi.contract.file} 缺少 info.title`);
  return document.info.title;
}

function operationIdsForContract(
  obligations: ReadonlyArray<{ id: string }>,
  contractName: string,
): string[] {
  const prefix = `${contractName}.`;
  return [
    ...new Set(
      obligations.flatMap((item) => {
        if (!item.id.startsWith(prefix)) return [];
        const operationId = item.id.slice(prefix.length).split('#', 1)[0];
        return operationId ? [operationId] : [];
      }),
    ),
  ];
}

async function runRemoval(fixture: RemovalFixture): Promise<Evidence> {
  const optionalWebFixture = existsSync(webRemovalFixture)
    ? (JSON.parse(readFileSync(webRemovalFixture, 'utf8')) as RemovalFixture)
    : undefined;
  const removal = combinedRemoval(fixture.removal, optionalWebFixture?.removal);
  const copy = createRepositoryCopy({ prefix: 'engineering-008-' });
  try {
    // 模拟交付状态并格式化，再提交基线：白名单删除的 diff 只反映删除本身。
    // 副本 helper 已按作用域归档，归档后的来源摘要与归档前一致（实测 19 个 owner 全无变化），
    // 这里不再重算全部 Fixture 摘要；只有被删除内容改动的 Fixture 才需要 refresh。
    const archivedFormat = run(copy, 'pnpm', ['format']);
    if (archivedFormat.status !== 0) throw new Error(`format failed: ${archivedFormat.output}`);
    git(copy.root, ['add', '-A']);
    // 作用域为空（主仓库已归档本 Change）时没有归档动作，可能没有可提交的内容：跳过提交即可，
    // 副本此时已经是交付状态。
    if (git(copy.root, ['status', '--porcelain']) !== '')
      git(copy.root, [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '-m',
        'copy: archive scoped change',
      ]);
    const declarationPaths = [...new Set(removal.matrices.map((matrix) => matrix.declaration))];
    const manifestPath = join(copy.root, 'project.manifest.json');
    const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    const markedByStem = new Map<string, Set<'template-example' | 'web-example'>>();
    for (const path of markerFiles(copy.root, 'template-example'))
      markedByStem.set(path, new Set(['template-example']));
    if (optionalWebFixture)
      for (const path of markerFiles(copy.root, 'web-example')) {
        const stems = markedByStem.get(path) ?? new Set();
        stems.add('web-example');
        markedByStem.set(path, stems);
      }
    const marked = [...markedByStem.keys()];
    const fragments = new Map<string, string>();
    for (const path of marked) {
      const absolute = join(copy.root, path);
      let text = readFileSync(absolute, 'utf8');
      const removed: string[] = [];
      for (const stem of markedByStem.get(path)!) {
        const stripped = stripMarkedFragments(path, text, stem);
        text = stripped.text;
        removed.push(stripped.removed);
      }
      writeFileSync(absolute, text);
      fragments.set(path, removed.join('\n'));
    }
    const removed = removeWhitelistedPaths(copy.root, removal);
    const declarations = declarationPaths.map((path): DeclarationEvidence => {
      const methodsBefore = [...(fragments.get(path) ?? '').matchAll(/method: (\w+)/g)].map(
        (match) => match[1]!,
      );
      // 标记外登记的方法：使用方条目，以及被移到标记外的共用接口（模板仓库为空）。
      // 只读声明数组的正文，避免把类型定义里的 `method:` 成员当成条目。
      const outsideMethodsBefore = [
        ...new Set(methodsInBody(declarationBody(readFileSync(join(copy.root, path), 'utf8')))),
      ];
      return {
        path,
        methodsBefore,
        outsideMethodsBefore,
        bodyAfter: declarationBody(readFileSync(join(copy.root, path), 'utf8')),
      };
    });
    const matrices = removal.matrices.map((matrix): MatrixEvidence => {
      const declaration = declarations.find((item) => item.path === matrix.declaration);
      if (!declaration) throw new Error(`矩阵声明不存在: ${matrix.declaration}`);
      const keysBefore = fixtureKeys(copy.root, matrix);
      const removable = [...new Set(declaration.methodsBefore)].filter(
        (name) => !declaration.outsideMethodsBefore.includes(name),
      );
      const keysRemoved = removeDeclaredMatrixKeys(copy.root, matrix, removable);
      return {
        fixture: matrix.fixture,
        owner: matrix.owner,
        kind: matrix.kind,
        keysBefore,
        keysRemoved,
        keysAfter: fixtureKeys(copy.root, matrix),
      };
    });
    const coverageExcluded = syncCoverageExclusions(copy.root);
    for (const matrix of removal.matrices) {
      const refresh = run(copy, 'pnpm', ['fixtures:refresh', matrix.owner]);
      if (refresh.status !== 0) throw new Error(`fixtures:refresh failed: ${refresh.output}`);
    }
    // 片段删除会留下空行与折行差异，按仓库脚本格式化后再核对改动面。
    const formatted = run(copy, 'pnpm', ['format']);
    if (formatted.status !== 0) throw new Error(`format failed: ${formatted.output}`);
    git(copy.root, ['add', '-A']);
    const changed = git(copy.root, ['diff', '--cached', '--name-only', 'HEAD'])
      .split('\n')
      .filter(Boolean);
    const fast = run(copy, 'pnpm', ['check:fast']);
    const fastLog = writeLog('t17-copy-check-fast.log', fast.output);
    // check:fast 失败时先落盘再抛错：否则后面的探针读不到报告，会以 ENOENT 盖掉真正的失败原因。
    if (fast.status !== 0)
      throw new Error(
        `副本内 check:fast 退出码 ${fast.status}（日志 ${fastLog}）：\n${fast.output.slice(-6000)}`,
      );
    const inventoryRun = run(copy, 'pnpm', ['check:scenarios', '--inventory']);
    const inventoryLog = writeLog('t17-copy-inventory.log', inventoryRun.output);
    let inventory: InventoryOutput;
    try {
      inventory = parseInventory(inventoryRun.output);
    } catch (error) {
      // `lib` 为 ES2020，`new Error(message, { cause })` 不可用；沿用仓库既有写法挂上 cause。
      const issue = new Error(
        `副本内场景门禁清单模式输出无法解析（日志 ${inventoryLog}）`,
      ) as Error & { cause: unknown };
      issue.cause = error;
      throw issue;
    }
    // 反例必须在正常清单结果取到之后再跑：它会改写副本里的集成报告。
    const probe = probeSharedBindingBreak(copy);
    return {
      copy,
      removal,
      removed,
      markerFiles: marked,
      declarations,
      matrices,
      coverageExcluded,
      manifestBefore,
      changed,
      fastStatus: fast.status,
      fastOutput: fast.output,
      fastLog,
      inventoryStatus: inventoryRun.status,
      inventory,
      inventoryLog,
      probe,
    };
  } catch (error) {
    copy.cleanup();
    throw error;
  }
}

let pending: Promise<Evidence> | undefined;
/** 两个 case 共用一次副本构建与门禁运行：同一份状态给出两组 checkpoint 证据。 */
function evidence(fixture: RemovalFixture): Promise<Evidence> {
  pending ??= runRemoval(fixture);
  return pending;
}

afterAll(async () => {
  const value = await pending;
  value?.copy.cleanup();
});

/** copy-construction：副本自建、归档作用域内 Change、workspace 链接落在副本内。 */
function assertCopyConstruction(value: Evidence, expect: Expect) {
  expect(value.copy.env.TEMPLATE_COPY).toBe('1');
  expect(value.copy.env.SCENARIO_GATE_CHANGES).toBeUndefined();
  expect(git(value.copy.root, ['rev-parse', '--is-inside-work-tree'])).toBe('true');
  const scope = scopedChangeNames();
  // 作用域为空（主仓库已归档本 Change）时没有归档动作：跳过归档断言，只要求副本处于交付态。
  if (scope.length > 0) {
    const archived = readdirSync(join(value.copy.root, 'openspec/changes/archive'));
    for (const name of scope)
      expect(archived.some((entry) => entry === name || entry.endsWith(`-${name}`))).toBe(true);
  }
  expect(
    readdirSync(join(value.copy.root, 'openspec/changes')).filter((entry) => entry !== 'archive'),
  ).toEqual([]);
  expect(workspaceRealpath(value.copy.root).startsWith(realpathSync(value.copy.root))).toBe(true);
  expect(existsSync(join(value.copy.root, 'packages/sdk/src/example'))).toBe(false);
  expect(existsSync(join(value.copy.root, 'packages/web/src/trade-create'))).toBe(false);
}

/** whitelist-only-removal：改动面只落在白名单、标记片段、矩阵 Fixture 与清单排除项。 */
function assertWhitelistOnly(value: Evidence, removal: Removal, expect: Expect) {
  for (const directory of removal.directories) expect(value.removed).toContain(directory);
  for (const file of removal.files) expect(value.removed).toContain(file);
  for (const matrix of value.matrices) {
    const declaration = value.declarations.find(
      (item) =>
        item.path === removal.matrices.find((item) => item.fixture === matrix.fixture)!.declaration,
    )!;
    expect(matrix.keysRemoved.length, `${matrix.fixture} 应移除示例矩阵键`).toBeGreaterThan(0);
    // 只删"示例接口中不再被标记外声明"的键（A5/A6）：共用接口由使用方在标记外保留同名条目，
    // 对应的 Fixture 键必须保留；模板仓库里标记外为空，示例键因此全部删除。
    expect(
      [...matrix.keysRemoved].sort(),
      `示例删除应移除的矩阵键 = ${declaration.path} 中不再被标记外声明的那些`,
    ).toEqual(
      [...new Set(declaration.methodsBefore)]
        .filter((name) => !declaration.outsideMethodsBefore.includes(name))
        .sort(),
    );
    expect(matrix.keysAfter).toEqual(
      matrix.keysBefore.filter((key) => !matrix.keysRemoved.includes(key)),
    );
  }
  const covered = (path: string) =>
    value.removed.some((item) => path === item || path.startsWith(`${item}/`)) ||
    value.markerFiles.includes(path) ||
    removal.matrices.some(
      (matrix) =>
        path === matrix.fixture || path === join(dirname(matrix.fixture), 'manifest.json'),
    ) ||
    path === 'project.manifest.json';
  expect(value.changed.filter((path) => !covered(path))).toEqual([]);
  expect(
    value.changed.filter(
      (path) => path.startsWith('scripts/') && !value.markerFiles.includes(path),
    ),
  ).toEqual([]);
  expect(
    value.changed.filter(
      (path) =>
        path.startsWith('packages/e2e/tests/tooling/') &&
        !value.markerFiles.includes(path) &&
        !value.removed.includes(path),
    ),
  ).toEqual([]);
  expect(
    value.changed.filter(
      (path) =>
        path.startsWith('openspec/specs/') &&
        !path.startsWith('openspec/specs/template-example/') &&
        !path.startsWith('openspec/specs/web-example/'),
    ),
  ).toEqual([]);
  for (const matrix of value.matrices)
    if (matrix.keysRemoved.length > 0) expect(value.changed).toContain(matrix.fixture);
  expect(value.changed).toContain('project.manifest.json');
  // 覆盖率排除项只随指向的白名单对象一起消失：期望集合 = 清单原有排除项中位于删除面下者。
  // 白名单条目本身不要求都出现在排除项里——例如删除验收自身的用例与 Fixture 就没有覆盖项。
  const beforePaths = (
    value.manifestBefore as { quality: { coverageExclusions: ReadonlyArray<{ path: string }> } }
  ).quality.coverageExclusions.map((item) => item.path);
  const underRemoved = (path: string) =>
    value.removed.some((item) => path === item || path.startsWith(`${item}/`));
  expect([...value.coverageExcluded].sort()).toEqual(beforePaths.filter(underRemoved).sort());
  // 清单只动覆盖率排除项，其余字段逐项不变。
  const after = JSON.parse(
    readFileSync(join(value.copy.root, 'project.manifest.json'), 'utf8'),
  ) as { quality: { coverageExclusions: ReadonlyArray<{ path: string }> } };
  const before = value.manifestBefore as { quality: { coverageExclusions: unknown } };
  expect(after).toEqual({
    ...before,
    quality: {
      ...before.quality,
      coverageExclusions: after.quality.coverageExclusions,
    },
  });
  expect(after.quality.coverageExclusions.map((item) => item.path)).toEqual(
    beforePaths.filter((path) => !value.coverageExcluded.includes(path)),
  );
  expect(value.coverageExcluded.length).toBeGreaterThan(0);
  for (const item of after.quality.coverageExclusions)
    expect(existsSync(join(value.copy.root, item.path))).toBe(true);
  // 示例删除后白名单内的路径都不再存在：包含示例删除验收自身的用例与 Fixture（A3）。
  for (const directory of removal.directories)
    expect(existsSync(join(value.copy.root, directory))).toBe(false);
  for (const file of removal.files) expect(existsSync(join(value.copy.root, file))).toBe(false);
  // 集成测试配置里也不再留有指向已删除示例或示例删除验收的条目。
  const config = readFileSync(join(value.copy.root, integrationConfig), 'utf8');
  expect(config).not.toContain(specFile);
  expect(config).not.toContain('SCN-TEMPLATE-EXAMPLE-008.spec.ts');
  expect(config).not.toContain('tests/example/');
}

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-008',
    caseId: 'example-removal-fast',
    fixtureCase: 'example-removal-fast',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-008',
        caseKey: 'example-removal-fast',
        checks: [
          'copy-construction',
          'whitelist-only-removal',
          'fast-gates-green',
          'empty-declaration-matrix',
          'no-recursive-copy',
        ],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const value = await evidence(fixture as RemovalFixture);
    const { removal } = value;
    await checkpoint('copy-construction', () => assertCopyConstruction(value, expect));
    await checkpoint('whitelist-only-removal', () => assertWhitelistOnly(value, removal, expect));
    await checkpoint('fast-gates-green', () => {
      expect(value.fastStatus, `${value.fastLog}\n${value.fastOutput.slice(-6000)}`).toBe(0);
    });
    await checkpoint('empty-declaration-matrix', async () => {
      // 删除后的声明体只由标记外的条目组成：模板仓库里标记外为空，此时才断言声明为空、
      // 按消费接口派生的义务为空并结束；使用方保留标记外条目时按这些条目继续取证。
      for (const declaration of value.declarations) {
        expect(methodsInBody(declaration.bodyAfter)).toEqual(declaration.outsideMethodsBefore);
        expect(declaration.bodyAfter.length === 0).toBe(
          declaration.outsideMethodsBefore.length === 0,
        );
      }
      for (const matrix of value.matrices) {
        // 矩阵键只减不增：删掉示例中不再被标记外声明的键，其余键（含共用接口）原样保留。
        expect(matrix.keysAfter).toEqual(
          matrix.keysBefore.filter((key) => !matrix.keysRemoved.includes(key)),
        );
        const declaration = value.declarations.find(
          (item) =>
            item.path ===
            removal.matrices.find((candidate) => candidate.fixture === matrix.fixture)!.declaration,
        )!;
        if (declaration.outsideMethodsBefore.length === 0) {
          expect(declaration.bodyAfter).toBe('');
          expect(matrix.keysAfter).toEqual([]);
        }
      }
      // 矩阵用例在两种状态下都执行完（声明为空时断言义务为空并结束，不因缺少示例路由失败）。
      for (const matrixSpecFile of matrixSpecFiles)
        expect(value.fastOutput).toContain(matrixSpecFile);
      const inventory = await buildContractInventory(value.copy.root);
      const errors = inventory.obligations.filter((item) =>
        item.id.startsWith('idl.error-contract#business-error#'),
      );
      expect(errors.length).toBe(1);
      expect(errors[0]!.requiredIn).toEqual(['integration']);
      const openapiMatrix = removal.matrices.find((matrix) => matrix.kind === 'openapi-plans');
      if (openapiMatrix) {
        const declaration = value.declarations.find(
          (item) => item.path === openapiMatrix.declaration,
        );
        if (!declaration) throw new Error(`矩阵声明不存在: ${openapiMatrix.declaration}`);
        const contractName = contractNameForDeclaration(value.copy.root, declaration.path);
        expect(operationIdsForContract(inventory.obligations, contractName).sort()).toEqual(
          [...declaration.outsideMethodsBefore].sort(),
        );
        if (declaration.outsideMethodsBefore.length === 0)
          expect(
            inventory.obligations.filter((item) => item.id.startsWith(`${contractName}.`)),
          ).toEqual([]);
      }
    });
    await checkpoint('no-recursive-copy', async () => {
      expect(value.copy.env.TEMPLATE_COPY).toBe('1');
      // 副本里会创建副本的用例仍被排除：排除列表里凡在副本中仍存在的 spec 都还在配置里；
      // 随示例删除的条目（示例用例与示例删除验收自身）不再出现（A3）。
      const config = readFileSync(join(value.copy.root, integrationConfig), 'utf8');
      const stillPresent = copyCreatingSpecs.filter((path) =>
        existsSync(join(value.copy.root, path)),
      );
      expect(stillPresent.length).toBeGreaterThan(0);
      for (const path of stillPresent) expect(config).toContain(path);
      expect(stillPresent).not.toContain(specRelative);
      expect(value.fastOutput).not.toContain(specFile);
      const previous = process.env.TEMPLATE_COPY;
      process.env.TEMPLATE_COPY = '1';
      try {
        expect(() => createRepositoryCopy()).toThrow(/must not be created inside a copy/);
      } finally {
        if (previous === undefined) delete process.env.TEMPLATE_COPY;
        else process.env.TEMPLATE_COPY = previous;
      }
    });
  },
  { fixtureRoot, timeoutMs: 900_000 },
);

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-ENGINEERING-008',
    caseId: 'example-removal-scenarios',
    fixtureCase: 'example-removal-scenarios',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-TEMPLATE-ENGINEERING-008',
        caseKey: 'example-removal-scenarios',
        checks: ['copy-construction', 'whitelist-only-removal', 'scenario-gate-green'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const value = await evidence(fixture as RemovalFixture);
    const { removal } = value;
    await checkpoint('copy-construction', () => assertCopyConstruction(value, expect));
    await checkpoint('whitelist-only-removal', () => assertWhitelistOnly(value, removal, expect));
    await checkpoint('scenario-gate-green', () => {
      expect(value.inventory.mode).toBe('inventory');
      const expected = expectedMissingBindings(value.copy, value.inventory);
      expect(
        [...new Set(value.inventory.issues)].sort(),
        `${value.inventoryLog}\n${value.inventory.issues.join('\n')}`,
      ).toEqual(expected);
      expect(value.probe.status, `${value.probe.log}\n${value.probe.issues.join('\n')}`).not.toBe(
        0,
      );
      const precheckBlocked = expected.some((issue) =>
        issue.includes('is not registered in project.manifest.json'),
      );
      if (precheckBlocked) {
        // 未登记项目会在预检阶段提前返回，报告中的绑定缺失反例此时不会进入覆盖评估。
        expect(
          [...new Set(value.probe.issues)].sort(),
          `${value.probe.log}\n${value.probe.issues.join('\n')}`,
        ).toEqual(expected);
        return;
      }
      // 反例：共享 Scenario 的非平台绑定被删掉后，问题集合多出恰好一条，门禁必须判失败。
      expect(expected).not.toContain(value.probe.brokenIssue);
      expect(
        [...new Set(value.probe.issues)].sort(),
        `${value.probe.log}\n${value.probe.issues.join('\n')}`,
      ).toEqual([...new Set([...expected, value.probe.brokenIssue])].sort());
    });
  },
  { fixtureRoot, timeoutMs: 900_000 },
);
