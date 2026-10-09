import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach } from 'vitest';
import {
  loadProjectManifest,
  packageByRole,
  type TestProjectClass,
} from '../../../../scripts/lib/project-manifest.ts';
import {
  cliEvidence,
  enableInventory,
  fixtureRoot,
  runArchitecture,
  runGate,
  verification,
  writeSpec,
} from './scenario-gate-helpers.ts';
import { writeTemplateGuideFixture } from './helpers.ts';
import { createControlledRoot } from './controlled-root.ts';
import { planCommand } from '../../../../scripts/run-by-manifest.ts';

const repositoryRoot = process.cwd();
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type FixturePackage = {
  directory: string;
  name: string;
  role: 'product' | 'protocol' | 'test';
  private: boolean;
  allowedDirectories: ReadonlyArray<string>;
  moduleRoots?: ReadonlyArray<string>;
  consumedOperations?: ReadonlyArray<string>;
};
type FixtureManifest = {
  packages: ReadonlyArray<FixturePackage>;
  requiredCommands: ReadonlyArray<string>;
  testProjects: ReadonlyArray<{ name: string; class: TestProjectClass; config: string }>;
  fingerprints: {
    sourceRoots: ReadonlyArray<string>;
    buildInputs: ReadonlyArray<string>;
    protocolInputs: ReadonlyArray<string>;
  };
  quality?: {
    coverageExclusions: ReadonlyArray<{ path: string; reason: string }>;
    maxLinesExemptions: ReadonlyArray<{ path: string; reason: string }>;
  };
  release?: { registry: string; tagPrefix: string };
};

function manifestFixture(
  overrides: Partial<{ product: FixturePackage; requiredCommands: string[] }> = {},
): FixtureManifest {
  return {
    packages: [
      overrides.product ?? {
        directory: 'sample-sdk',
        name: '@sample/sdk',
        role: 'product',
        private: false,
        allowedDirectories: ['src'],
      },
      {
        directory: 'sample-protocol',
        name: '@sample/protocol',
        role: 'protocol',
        private: false,
        allowedDirectories: ['src', 'testing'],
      },
      {
        directory: 'e2e',
        name: '@sample/e2e',
        role: 'test',
        private: true,
        allowedDirectories: ['src', 'host', 'tests'],
      },
    ],
    requiredCommands: overrides.requiredCommands ?? ['check:fast'],
    testProjects: [
      { name: 'sample-unit', class: 'unit', config: 'packages/sample-sdk/vitest.config.ts' },
      {
        name: 'integration',
        class: 'integration',
        config: 'packages/e2e/vitest.config.ts',
      },
    ],
    fingerprints: {
      sourceRoots: ['scripts'],
      buildInputs: [],
      protocolInputs: ['proto-gen.lock'],
    },
    quality: { coverageExclusions: [], maxLinesExemptions: [] },
  };
}

/** 最小架构门禁根：清单、根 package.json、AGENTS 链接与三个登记包。 */
function architectureFixture(manifest: FixtureManifest) {
  const root = mkdtempSync(join(tmpdir(), 'template-architecture-cli-'));
  roots.push(root);
  writeFileSync(join(root, 'AGENTS.md'), '# root\n\n[readme](README.md)\n');
  writeFileSync(join(root, 'README.md'), '# readme\n');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      scripts: Object.fromEntries(manifest.requiredCommands.map((command) => [command, 'echo'])),
    }),
  );
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  for (const pkg of manifest.packages) {
    mkdirSync(join(root, 'packages', pkg.directory), { recursive: true });
    writeFileSync(join(root, 'packages', pkg.directory, 'AGENTS.md'), '[root](../../AGENTS.md)\n');
    writeFileSync(
      join(root, 'packages', pkg.directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: '0.0.0',
        ...(pkg.private ? { private: true } : {}),
      }),
    );
  }
  writeTemplateGuideFixture(root);
  return root;
}

function scanScripts(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) scanScripts(full, found);
    else if (
      /\.(?:ts|cjs|mjs|js)$/.test(entry.name) &&
      !/[.]test[.]/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    )
      found.push(full);
  }
  return found;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 写死扫描的配置清单：依赖、lint 与根 Vitest 配置的内容。 */
const scannedConfigs = ['.dependency-cruiser.cjs', 'eslint.config.js', 'vitest.config.ts'];

/**
 * 扫描门禁脚本、依赖/lint/测试配置的内容与根 scripts 的值：
 * 不得出现产品包与协议包的目录名、包名，与类别不同名的测试项目名，以及 registry 字面量。
 * 根 scripts 的键名不扫描；与 requiredCommands 同名的命令参数不算写死。
 */
function scanHardcodedTopology(root: string, manifest: FixtureManifest): string[] {
  const product = manifest.packages.find((item) => item.role === 'product')!;
  const protocol = manifest.packages.find((item) => item.role === 'protocol')!;
  const registry = manifest.release?.registry;
  const mismatchedProjects = manifest.testProjects
    .filter((project) => project.name !== project.class)
    .map((project) => project.name);
  const files = [
    ...scanScripts(resolve(root, 'scripts')),
    ...scannedConfigs.map((path) => resolve(root, path)).filter((path) => existsSync(path)),
  ];
  const problems: string[] = [];
  /** 文件内容按路径/引号字面量匹配；scripts 的值是 shell 文本，按独立词元匹配。 */
  const inspect = (text: string, label: string, tokenMode: boolean) => {
    for (const pkg of [product, protocol]) {
      if (new RegExp(`packages/${escapeRegExp(pkg.directory)}(?=[/'"\x60])`).test(text))
        problems.push(`${label}: package directory ${pkg.directory}`);
      if (text.includes(pkg.name)) problems.push(`${label}: package name ${pkg.name}`);
    }
    if (registry && text.includes(registry)) problems.push(`${label}: release registry`);
    for (const name of mismatchedProjects) {
      const hit = tokenMode
        ? new RegExp(`(^|[^\\w-])${escapeRegExp(name)}(?![\\w-])`).test(text)
        : text.includes(`'${name}'`) ||
          text.includes(`"${name}"`) ||
          text.includes(`\x60${name}\x60`);
      if (hit) problems.push(`${label}: test project ${name}`);
    }
  };
  for (const file of files) inspect(readFileSync(file, 'utf8'), relative(root, file), false);
  const scripts =
    (
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      }
    ).scripts ?? {};
  for (const value of Object.values(scripts)) {
    let stripped = value;
    for (const command of manifest.requiredCommands) stripped = stripped.split(command).join('');
    inspect(stripped, 'package.json scripts value', true);
  }
  return problems;
}

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-005',
  'rename-by-manifest-cli',
  ['rename-by-manifest', 'scripts-by-manifest'],
  async (context, check) => {
    const manifest = manifestFixture();
    const root = architectureFixture(manifest);
    const renamed = {
      directory: 'renamed-sdk',
      name: '@sample/renamed-sdk',
      role: 'product' as const,
      private: false,
      allowedDirectories: ['src'],
    };
    await check('rename-by-manifest', () => {
      renameSync(join(root, 'packages', 'sample-sdk'), join(root, 'packages', renamed.directory));
      writeFileSync(
        join(root, 'packages', renamed.directory, 'package.json'),
        JSON.stringify({ name: renamed.name, version: '0.0.0' }),
      );
      writeFileSync(
        join(root, 'project.manifest.json'),
        JSON.stringify(manifestFixture({ product: renamed }), null, 2),
      );
      const result = runArchitecture(root);
      context.expect(result.output?.issues).toEqual([]);
      context.expect(result.status).toBe(0);
      // 未按清单同步时，门禁仍会拒绝：目录未登记。
      const stale = architectureFixture(manifestFixture());
      renameSync(join(stale, 'packages', 'sample-sdk'), join(stale, 'packages', 'renamed-sdk'));
      context
        .expect(runArchitecture(stale).output?.issues.join('\n'))
        .toContain('unexpected package renamed-sdk');
    });
    await check('scripts-by-manifest', () => {
      const renamedRoot = architectureFixture(manifestFixture({ product: renamed }));
      context.expect(planCommand(renamedRoot, 'build')).toEqual([
        { command: 'pnpm', args: ['--filter', '@sample/protocol', 'build'] },
        { command: 'pnpm', args: ['--filter', '@sample/renamed-sdk', 'build'] },
      ]);
      context.expect(planCommand(renamedRoot, 'test:unit')).toEqual([
        {
          command: 'vitest',
          args: ['run', '--project', 'sample-unit', '--coverage'],
          env: {
            VERIFY_REPORT_FILE: join(renamedRoot, 'artifacts/local/reports/unit.json'),
          },
        },
      ]);
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-005',
  'architecture-violations-cli',
  ['architecture-violations'],
  async (context, check) => {
    await check('architecture-violations', () => {
      const unregistered = architectureFixture(manifestFixture());
      mkdirSync(join(unregistered, 'packages', 'unregistered'));
      context
        .expect(runArchitecture(unregistered).output?.issues.join('\n'))
        .toContain('unexpected package unregistered');

      const mismatched = architectureFixture(manifestFixture());
      writeFileSync(
        join(mismatched, 'packages', 'sample-sdk', 'package.json'),
        JSON.stringify({ name: '@sample/other', version: '0.0.0' }),
      );
      context
        .expect(runArchitecture(mismatched).output?.issues.join('\n'))
        .toContain('wrong package name sample-sdk');

      const missing = architectureFixture(manifestFixture());
      const missingManifest = JSON.parse(
        readFileSync(join(missing, 'project.manifest.json'), 'utf8'),
      ) as FixtureManifest & { requiredCommands: string[] };
      missingManifest.requiredCommands.push('missing:command');
      writeFileSync(join(missing, 'project.manifest.json'), JSON.stringify(missingManifest));
      context
        .expect(runArchitecture(missing).output?.issues.join('\n'))
        .toContain('missing command missing:command');
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-005',
  'unregistered-project-cli',
  ['projects-by-manifest'],
  async (context, check) => {
    const fixture = fixtureRoot();
    try {
      writeSpec(
        fixture.root,
        `### Requirement: projects\n#### Scenario: SCN-TEST-001 Example\n${verification([{ key: 'normal', kind: 'behavior', requiredIn: ['unregistered-project'], checks: ['done'] }])}`,
      );
      const result = runGate(fixture.root);
      await check('projects-by-manifest', () => {
        context.expect(result.status).not.toBe(0);
        context
          .expect(result.output?.issues.join('\n'))
          .toContain(
            'requiredIn project unregistered-project is not registered in project.manifest.json',
          );
      });
    } finally {
      fixture.cleanup();
    }
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-005',
  'no-hardcoded-topology',
  ['no-hardcoded-topology'],
  async (context, check) => {
    await check('no-hardcoded-topology', () => {
      const manifest = loadProjectManifest(repositoryRoot);
      context.expect(scanHardcodedTopology(repositoryRoot, manifest)).toEqual([]);

      // 正例控制：在受控临时根中写入写死包名与项目名的脚本、配置与根 scripts，必须被逐项命中。
      const product = packageByRole(manifest, 'product');
      const protocol = packageByRole(manifest, 'protocol');
      const platform = manifest.testProjects.find((project) => project.class === 'platform')!;
      const probe = mkdtempSync(join(tmpdir(), 'template-hardcoded-probe-'));
      roots.push(probe);
      mkdirSync(join(probe, 'scripts'), { recursive: true });
      writeFileSync(
        join(probe, 'scripts', 'probe.ts'),
        `export const dir = 'packages/${product.directory}/src';\nexport const name = '${protocol.name}';\n`,
      );
      writeFileSync(join(probe, 'eslint.config.js'), `export default ['${platform.name}'];\n`);
      writeFileSync(
        join(probe, 'package.json'),
        JSON.stringify({
          scripts: {
            probe: `vitest run --project ${platform.name}`,
            allowed: `tsx run.ts test:e2e:${platform.name}`,
          },
        }),
      );
      const found = scanHardcodedTopology(probe, manifest);
      context
        .expect(found)
        .toEqual(
          context.expect.arrayContaining([
            `scripts/probe.ts: package directory ${product.directory}`,
            `scripts/probe.ts: package name ${protocol.name}`,
            `eslint.config.js: test project ${platform.name}`,
            `package.json scripts value: test project ${platform.name}`,
          ]),
        );
      // scripts 的键名不扫描：与 requiredCommands 同名的命令参数不算写死。
      context.expect(found.filter((item) => item.includes('allowed'))).toEqual([]);
    });
  },
);

cliEvidence(
  'SCN-TEMPLATE-ENGINEERING-005',
  'digest-inputs-cli',
  ['source-roots-by-manifest', 'digest-inputs'],
  async (context, check) => {
    const repositoryManifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'project.manifest.json'), 'utf8'),
    ) as FixtureManifest;
    const root = createControlledRoot({
      manifest: repositoryManifest,
      files: { 'scripts/marker.ts': 'export const marker = 1;' },
      prefix: 'template-digest-cli-',
    });
    try {
      enableInventory(root.root);
      const before = runGate(root.root);
      const beforeDigests = before.output?.digests as { sourceDigest: string } | undefined;

      await check('source-roots-by-manifest', () => {
        context.expect(beforeDigests?.sourceDigest, before.stderr).toMatch(/^[a-f0-9]{64}$/);
        const plain = mkdtempSync(join(tmpdir(), 'template-digest-nongit-'));
        try {
          mkdirSync(join(plain, 'openspec/specs'), { recursive: true });
          mkdirSync(join(plain, 'openspec/changes'), { recursive: true });
          writeFileSync(join(plain, 'project.manifest.json'), JSON.stringify(repositoryManifest));
          enableInventory(plain);
          const rejected = runGate(plain);
          context.expect(rejected.status).not.toBe(0);
          context.expect(rejected.stderr).toContain('not a git work tree');
        } finally {
          rmSync(plain, { recursive: true, force: true });
        }
      });

      await check('digest-inputs', () => {
        writeFileSync(join(root.root, 'scripts/marker.ts'), 'export const marker = 2;');
        writeFileSync(join(root.root, 'scripts/new.ts'), 'export const added = true;');
        const changed = runGate(root.root);
        const changedDigests = changed.output?.digests as
          { sourceDigest: string; protocolDigest: string } | undefined;
        context.expect(changedDigests?.sourceDigest).not.toBe(beforeDigests?.sourceDigest);

        writeFileSync(join(root.root, 'scripts/AGENTS.md'), 'changed docs');
        writeFileSync(join(root.root, 'proto-gen.lock'), 'changed idl');
        const afterDocs = runGate(root.root);
        const afterDigests = afterDocs.output?.digests as
          { sourceDigest: string; protocolDigest: string } | undefined;
        context.expect(afterDigests?.sourceDigest).toBe(changedDigests?.sourceDigest);
        context.expect(afterDigests?.protocolDigest).not.toBe(changedDigests?.protocolDigest);
      });
    } finally {
      root.cleanup();
    }
  },
);
