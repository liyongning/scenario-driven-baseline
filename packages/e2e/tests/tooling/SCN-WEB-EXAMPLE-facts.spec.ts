import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runArchitectureCli } from '../../../../scripts/check-architecture.ts';
import { checkComponentTree } from '../../../../scripts/check-component-tree.ts';
import { checkFixtures } from '../../../../scripts/check-fixtures.ts';
import { defineCase } from '../../src/cases/define-case.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import { repositoryRoot, writeProjectMapFixture, writeTemplateGuideFixture } from './helpers.ts';
import { scopedChangeNames } from './repository-copy.ts';

const fixturesRoot = join(repositoryRoot, 'packages/e2e/tests/fixtures');
const webSourceRoot = join(repositoryRoot, 'packages/web/src');

/**
 * 示例数据集的校验作用域：按需运行与全量运行都传入同一个 Change 名，
 * 避免 check:fixtures 依赖调用方环境变量。
 */
function fixtureChanges(): string[] | undefined {
  const names = scopedChangeNames();
  return names.length === 0 ? undefined : names;
}

function filesUnder(root: string, suffix: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path, suffix) : path.endsWith(suffix) ? [path] : [];
  });
}

/** 示例中模块根组件到孙组件是否存在 `components/<child>/components/<grand>` 两级嵌套。 */
function hasTwoLevelComponents(root: string): boolean {
  return filesUnder(root, '.vue').some((path) =>
    /[/\\]components[/\\][^/\\]+[/\\]components[/\\][^/\\]+[/\\][^/\\]+\.vue$/.test(path),
  );
}

/** 除共享组件自身外，引用某共享组件的模块文件数；用于核对"被至少两个模块使用"。 */
function componentConsumers(root: string, component: string): string[] {
  const pattern = new RegExp(`\\b${component}\\b`);
  return filesUnder(root, '.ts')
    .concat(filesUnder(root, '.vue'))
    .filter((path) => {
      const normalized = path.split('\\').join('/');
      if (normalized.includes(`/shared/components/${component}/`)) return false;
      if (normalized.endsWith('/shared/components/index.ts')) return false;
      return pattern.test(readFileSync(path, 'utf8'));
    });
}

/** 已声明消费接口在源码里必须各有 `satisfies Record<OperationCodes<'<id>'>, Outcome>`。 */
function satisfiesIssues(
  files: ReadonlyArray<Readonly<{ path: string; text: string }>>,
  operationIds: ReadonlyArray<string>,
): string[] {
  return operationIds.flatMap((id) => {
    const needle = `satisfies Record<OperationCodes<'${id}'>, Outcome>`;
    return files.some((file) => file.text.includes(needle)) ? [] : [`${id}: 缺少 ${needle}`];
  });
}

/** 从消费接口声明源码里取 `method: <id>` 登记的接口名。 */
function consumedOperationIds(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/method:\s*([A-Za-z][A-Za-z0-9_]*)\s*,/g)].map((match) => match[1]!),
    ),
  ];
}

/** 覆盖率排除里指向示例目录的条目；示例不得登记任何覆盖率排除。 */
function exampleExclusionIssues(
  exclusions: ReadonlyArray<Readonly<{ path: string; reason: string }>>,
  prefix: string,
): string[] {
  return exclusions
    .filter((entry) => entry.path.split('\\').join('/').startsWith(prefix))
    .map((entry) => `示例不得登记覆盖率排除：${entry.path}`);
}

const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** 进行中数据集 getTrade 序列以非终态开始；已完成数据集 getTrade 响应为终态。 */
function datasetStateIssues(
  datasets: ReadonlyArray<{
    name: string;
    inProgress: boolean;
    statuses: ReadonlyArray<string>;
  }>,
): string[] {
  return datasets.flatMap((dataset) => {
    if (dataset.inProgress) {
      const first = dataset.statuses[0];
      return first !== undefined && !terminalStatuses.has(first)
        ? []
        : [`${dataset.name}: 进行中数据集 getTrade 序列必须以非终态开始`];
    }
    return dataset.statuses.every((status) => terminalStatuses.has(status))
      ? []
      : [`${dataset.name}: 已完成数据集 getTrade 响应必须为终态`];
  });
}

type DatasetManifest = Readonly<{
  protocol: string;
  entries: ReadonlyArray<Readonly<{ operationId: string; responses: ReadonlyArray<unknown> }>>;
}>;

function readDataset(name: string, root = join(fixturesRoot, '_datasets')): DatasetManifest {
  return JSON.parse(readFileSync(join(root, name, 'manifest.json'), 'utf8')) as DatasetManifest;
}

function getTradeStatuses(manifest: DatasetManifest): string[] {
  const entry = manifest.entries.find((item) => item.operationId === 'getTrade')!;
  return entry.responses.map((response) => {
    const body = (response as { body: { data?: { status?: string } } }).body;
    return body.data?.status ?? '';
  });
}

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-008',
    caseId: 'component-tree-fact',
    fixtureCase: 'component-tree-fact',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-008',
        caseKey: 'component-tree-fact',
        checks: ['two-level-tree', 'shared-components-used'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('two-level-tree', async () => {
      expect(checkComponentTree(repositoryRoot).issues).toEqual([]);
      const architecture = await runArchitectureCli([
        'node',
        'check-architecture.ts',
        '--root',
        repositoryRoot,
        '--dependency-exit-code',
        '0',
      ]);
      expect(architecture.exitCode).toBe(0);
      expect(hasTwoLevelComponents(webSourceRoot)).toBe(true);

      // 反例：把两个 .vue 放进同一组件目录后，组件树检查必须报错，证明上面的通过断言不是恒真。
      const broken = createEngineeringFormRoot();
      try {
        const appRoot = join(broken.root, 'packages/web-product/src/AppRoot');
        writeFileSync(join(appRoot, 'Extra.vue'), '<template />\n');
        expect(checkComponentTree(broken.root).issues.join('\n')).toContain('component-tree/1');
      } finally {
        broken.cleanup();
      }
    });

    await checkpoint('shared-components-used', () => {
      const shared = join(webSourceRoot, 'shared/components');
      for (const component of ['LoadingIndicator', 'LoadingFailure'] as const) {
        expect(existsSync(join(shared, component, `${component}.vue`))).toBe(true);
        expect(componentConsumers(webSourceRoot, component).length).toBeGreaterThanOrEqual(2);
      }

      // 反例：只有一个引用方时计数为 1，低于"至少两个模块"的门槛。
      const synthetic = mkdtempSync(join(tmpdir(), 'template-consumers-'));
      try {
        mkdirSync(join(synthetic, 'module-a'), { recursive: true });
        writeFileSync(
          join(synthetic, 'module-a/a.vue'),
          '<template><LoadingIndicator /></template>\n',
        );
        expect(componentConsumers(synthetic, 'LoadingIndicator').length).toBe(1);
      } finally {
        rmSync(synthetic, { recursive: true, force: true });
      }
    });
  },
  { timeoutMs: 120_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-010',
    caseId: 'code-table-satisfies-fact',
    fixtureCase: 'code-table-satisfies-fact',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-010',
        caseKey: 'code-table-satisfies-fact',
        checks: ['satisfies-applied'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('satisfies-applied', () => {
      const declaration = readFileSync(join(webSourceRoot, 'app/consumed-operations.ts'), 'utf8');
      const operationIds = consumedOperationIds(declaration);
      expect(operationIds.sort()).toEqual(['createTrade', 'getTrade', 'listTrades']);
      const files = filesUnder(webSourceRoot, '.ts').map((path) => ({
        path,
        text: readFileSync(path, 'utf8'),
      }));
      expect(satisfiesIssues(files, operationIds)).toEqual([]);

      // 反例：删掉 createTrade 的 satisfies 子句后必须被指出缺少该接口。
      const mutated = files.map((file) => ({
        path: file.path,
        text: file.text.replace("satisfies Record<OperationCodes<'createTrade'>, Outcome>", ''),
      }));
      expect(satisfiesIssues(mutated, operationIds)).toEqual([
        "createTrade: 缺少 satisfies Record<OperationCodes<'createTrade'>, Outcome>",
      ]);
    });
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-011',
    caseId: 'example-exclusion-fact',
    fixtureCase: 'example-exclusion-fact',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-011',
        caseKey: 'example-exclusion-fact',
        checks: ['no-exclusion-used'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    await checkpoint('no-exclusion-used', () => {
      const manifest = JSON.parse(
        readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
      ) as {
        quality: { coverageExclusions: ReadonlyArray<Readonly<{ path: string; reason: string }>> };
      };
      expect(exampleExclusionIssues(manifest.quality.coverageExclusions, 'packages/web/')).toEqual(
        [],
      );

      // 反例：登记一条指向 Web 示例的排除后必须被报出。
      expect(
        exampleExclusionIssues(
          [{ path: 'packages/web/src/trade-create/core/display.ts', reason: '反例' }],
          'packages/web/',
        ),
      ).toEqual(['示例不得登记覆盖率排除：packages/web/src/trade-create/core/display.ts']);
    });
  },
  { timeoutMs: 30_000 },
);

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-013',
    caseId: 'datasets-fact',
    fixtureCase: 'datasets-fact',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-013',
        caseKey: 'datasets-fact',
        checks: ['datasets-present', 'datasets-validated', 'datasets-represent-states'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const datasetsRoot = join(fixturesRoot, '_datasets');
    await checkpoint('datasets-present', () => {
      const names = readdirSync(datasetsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      expect(names.sort()).toEqual(['trade-completed', 'trade-in-progress']);
      for (const name of names) {
        const manifest = readDataset(name);
        expect(manifest.protocol).toBe('openapi');
        expect(manifest.entries.length).toBeGreaterThan(0);
        for (const entry of manifest.entries) {
          expect(entry.operationId).toBeTruthy();
          expect(Array.isArray(entry.responses)).toBe(true);
        }
        expect(manifest.entries.some((item) => item.operationId === 'getTrade')).toBe(true);
      }
    });

    await checkpoint('datasets-validated', async () => {
      const result = await checkFixtures({
        fixtureRoot: fixturesRoot,
        repositoryRoot,
        ...(fixtureChanges() ? { changes: fixtureChanges()! } : {}),
      });
      expect(result.issues).toEqual([]);

      // 反例：把进行中数据集 getTrade 的响应体改成非法信封，check:fixtures 必须报错。
      const brokenRoot = mkdtempSync(join(tmpdir(), 'template-datasets-'));
      try {
        cpSync(datasetsRoot, join(brokenRoot, '_datasets'), { recursive: true });
        const manifest = readDataset('trade-in-progress', join(brokenRoot, '_datasets'));
        const corrupted = JSON.parse(JSON.stringify(manifest)) as {
          entries: Array<{ operationId: string; responses: Array<{ body: unknown }> }>;
        };
        const getTrade = corrupted.entries.find((item) => item.operationId === 'getTrade')!;
        getTrade.responses[0]!.body = 'not-an-envelope';
        writeFileSync(
          join(brokenRoot, '_datasets/trade-in-progress/manifest.json'),
          JSON.stringify(corrupted, null, 2),
        );
        const broken = await checkFixtures({
          fixtureRoot: brokenRoot,
          repositoryRoot,
          ...(fixtureChanges() ? { changes: fixtureChanges()! } : {}),
        });
        expect(broken.issues.join('\n')).toContain('trade-in-progress');
        expect(broken.issues.length).toBeGreaterThan(0);
      } finally {
        rmSync(brokenRoot, { recursive: true, force: true });
      }
    });

    await checkpoint('datasets-represent-states', () => {
      expect(
        datasetStateIssues([
          {
            name: 'trade-in-progress',
            inProgress: true,
            statuses: getTradeStatuses(readDataset('trade-in-progress')),
          },
          {
            name: 'trade-completed',
            inProgress: false,
            statuses: getTradeStatuses(readDataset('trade-completed')),
          },
        ]),
      ).toEqual([]);

      // 反例：进行中数据集以终态开始时必须被报出。
      expect(
        datasetStateIssues([
          { name: 'reverse', inProgress: true, statuses: ['SUCCEEDED', 'CREATED'] },
        ]),
      ).toEqual(['reverse: 进行中数据集 getTrade 序列必须以非终态开始']);
      // 反例：已完成数据集出现非终态时也必须被报出。
      expect(
        datasetStateIssues([{ name: 'reverse', inProgress: false, statuses: ['PROCESSING'] }]),
      ).toEqual(['reverse: 已完成数据集 getTrade 响应必须为终态']);
    });
  },
  { timeoutMs: 120_000 },
);

/** 合法架构检查根：复制真实清单与包骨架，再写入指南、项目地图与架构文档替身。 */
function createArchitectureRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'template-web-marker-'));
  mkdirSync(join(root, 'packages'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# facts\n');
  writeFileSync(
    join(root, 'AGENTS.md'),
    '[facts](README.md) [external](https://example.invalid)\n',
  );
  writeFileSync(join(root, 'package.json'), readFileSync(join(repositoryRoot, 'package.json')));
  writeFileSync(
    join(root, 'project.manifest.json'),
    readFileSync(join(repositoryRoot, 'project.manifest.json')),
  );
  for (const name of ['sdk', 'protocol', 'openapi', 'web', 'e2e']) {
    const directory = join(root, 'packages', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'AGENTS.md'), '[root](../../AGENTS.md#rules)\n');
    writeFileSync(
      join(directory, 'package.json'),
      readFileSync(join(repositoryRoot, 'packages', name, 'package.json')),
    );
  }
  writeFileSync(
    join(root, 'packages/web/tsconfig.core.json'),
    readFileSync(join(repositoryRoot, 'packages/web/tsconfig.core.json')),
  );
  writeTemplateGuideFixture(root);
  writeProjectMapFixture(root);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-014',
    caseId: 'marker-cli',
    fixtureCase: 'marker-cli',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-014',
        caseKey: 'marker-cli',
        checks: ['marker-pairing', 'marker-restorable'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const fixture = createArchitectureRoot();
    const webSrc = join(fixture.root, 'packages/web/src');
    const webAgents = join(fixture.root, 'packages/web/AGENTS.md');
    const runCheck = () =>
      runArchitectureCli([
        'node',
        'check-architecture.ts',
        '--root',
        fixture.root,
        '--dependency-exit-code',
        '0',
      ]);
    try {
      mkdirSync(webSrc, { recursive: true });
      const originalAgents = readFileSync(webAgents, 'utf8');

      await checkpoint('marker-pairing', async () => {
        const unclosed = join(webSrc, 'unclosed.ts');
        writeFileSync(unclosed, ['const before = 1;', '// web-example:begin'].join('\n'));
        let result = await runCheck();
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain(
          'packages/web/src/unclosed.ts:2: web-example:begin 没有对应的 end',
        );
        rmSync(unclosed, { force: true });

        const extra = join(webSrc, 'extra.ts');
        writeFileSync(extra, '// web-example:end\n');
        result = await runCheck();
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain(
          'packages/web/src/extra.ts:1: web-example:end 没有对应的 begin',
        );
        rmSync(extra, { force: true });

        const nested = join(webSrc, 'nested.ts');
        writeFileSync(
          nested,
          [
            '// web-example:begin',
            '// web-example:begin',
            '// web-example:end',
            '// web-example:end',
          ].join('\n'),
        );
        result = await runCheck();
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toContain(
          'packages/web/src/nested.ts:2: web-example 标记不允许嵌套',
        );
        rmSync(nested, { force: true });

        writeFileSync(webAgents, `${originalAgents}<!-- web-example:begin -->\n`);
        result = await runCheck();
        expect(result.exitCode).not.toBe(0);
        expect(result.issues.join('\n')).toMatch(
          /packages\/web\/AGENTS\.md:\d+: web-example:begin 没有对应的 end/,
        );
      });

      await checkpoint('marker-restorable', async () => {
        writeFileSync(webAgents, originalAgents);
        writeFileSync(join(webSrc, 'legal.ts'), '// web-example:begin\n// web-example:end\n');
        const result = await runCheck();
        expect(result.exitCode).toBe(0);
        expect(result.issues).toEqual([]);
      });
    } finally {
      fixture.cleanup();
    }
  },
  { timeoutMs: 120_000 },
);
