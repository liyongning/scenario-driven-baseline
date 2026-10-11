import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createOpenSpecStub } from './openspec-stub.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

/** 受控临时根的默认清单：满足清单 schema 的最小工程形态。 */
export const minimalManifest = (): Record<string, unknown> => ({
  packages: [
    {
      directory: 'sample-product',
      name: '@sample/product',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'sample-protocol',
      name: '@sample/protocol',
      role: 'protocol',
      protocolKind: 'idl',
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'sample-test',
      name: '@sample/test',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'host', 'tests'],
      moduleRoots: ['src', 'host', 'tests'],
    },
  ],
  bindings: [
    {
      name: 'sample-product-protocol',
      product: 'sample-product',
      protocol: 'sample-protocol',
      platforms: [],
    },
  ],
  requiredCommands: ['check:fast'],
  testProjects: [
    { name: 'product-unit', class: 'unit', config: 'packages/sample-product/vitest.config.ts' },
    { name: 'integration', class: 'integration', config: 'packages/sample-test/vitest.config.ts' },
  ],
  fingerprints: { sourceRoots: ['scripts'], buildInputs: [], protocolInputs: ['proto-gen.lock'] },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
});

export type ControlledRootOptions = Readonly<{
  /** 写入的项目清单；缺省用最小清单。设为 null 表示不写清单。 */
  manifest?: unknown | null;
  /** 额外写入的文件，键为相对路径。 */
  files?: Readonly<Record<string, string>>;
  /** 额外创建的目录，相对路径。 */
  directories?: ReadonlyArray<string>;
  /** openspec 解析方式：默认使用替身，需要真实 CLI 时用副本仓库的 node_modules。 */
  openspec?: 'stub' | 'real';
  /** 是否创建初始提交；默认 true，源码清单要求 git 工作区。 */
  commit?: boolean;
  /** 是否为 IDL 协议包写入可加载的适配器替身；缺省 true。 */
  protocolAdapters?: boolean;
  prefix?: string;
}>;

export type ControlledRoot = Readonly<{
  root: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}>;

function git(root: string, args: ReadonlyArray<string>): void {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'template-fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'template-fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${result.stderr}`);
}

function stubEnvironment(stub: ReturnType<typeof createOpenSpecStub>): NodeJS.ProcessEnv {
  return stub.env;
}

/**
 * 统一的受控临时根：`git init` + 最小 OpenSpec 结构 + 清单 + 额外文件 + 初始提交。
 * `openspec` 默认用替身，需要真实 CLI 时把仓库 node_modules/.bin 放到 PATH 前。
 */
export function createControlledRoot(options: ControlledRootOptions = {}): ControlledRoot {
  const root = mkdtempSync(join(tmpdir(), options.prefix ?? 'template-root-'));
  mkdirSync(join(root, 'openspec/specs'), { recursive: true });
  mkdirSync(join(root, 'openspec/changes'), { recursive: true });
  for (const directory of options.directories ?? [])
    mkdirSync(join(root, directory), { recursive: true });
  const manifest = (options.manifest ?? minimalManifest()) as
    | {
        packages?: ReadonlyArray<{
          directory: string;
          name: string;
          private: boolean;
          role: string;
          protocolKind?: string;
        }>;
        bindings?: ReadonlyArray<{
          product: string;
          protocol: string;
        }>;
      }
    | undefined;
  if (options.manifest !== null) {
    for (const pkg of manifest?.packages ?? []) {
      const path = join(root, 'packages', pkg.directory, 'package.json');
      mkdirSync(dirname(path), { recursive: true });
      if (existsSync(path)) continue;
      writeFileSync(
        path,
        JSON.stringify(
          {
            name: pkg.name,
            version: '0.0.0',
            private: pkg.private,
            ...(pkg.role === 'product'
              ? {
                  dependencies: Object.fromEntries(
                    (manifest?.bindings ?? [])
                      .filter((binding) => binding.product === pkg.directory)
                      .flatMap((binding) => {
                        const protocol = manifest?.packages?.find(
                          (candidate) => candidate.directory === binding.protocol,
                        );
                        return protocol ? [[protocol.name, 'workspace:*']] : [];
                      }),
                  ),
                }
              : {}),
          },
          null,
          2,
        ),
      );
    }
  }
  if (options.protocolAdapters !== false) {
    for (const pkg of manifest?.packages ?? []) {
      if (pkg.role !== 'protocol' || pkg.protocolKind !== 'idl') continue;
      const path = join(root, 'packages', pkg.directory, 'testing/adapter.ts');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `export { default } from '${pathToFileURL(join(repositoryRoot, 'packages/protocol/testing/adapter.ts')).href}';\n`,
      );
    }
  }
  for (const [relative, content] of Object.entries(options.files ?? {})) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  if (options.manifest !== null) {
    writeFileSync(
      join(root, 'project.manifest.json'),
      JSON.stringify(options.manifest ?? minimalManifest(), null, 2),
    );
  }
  git(root, ['init', '-q']);
  if (options.commit !== false) {
    git(root, ['add', '-A']);
    git(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture: initial state']);
  }
  const stub = options.openspec === 'real' ? undefined : createOpenSpecStub();
  const env: NodeJS.ProcessEnv = stub
    ? stubEnvironment(stub)
    : {
        ...process.env,
        PATH: `${resolve(repositoryRoot, 'node_modules/.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      };
  // 受控根以自身 active Change 与自身运行结果为准：剔除外层作用域与按需运行的报告设置，
  // 否则同一份夹具在 `pnpm test:affected` 与全量运行下会写出不同的报告（partial 标记、run id、报告文件）。
  delete env.SCENARIO_GATE_CHANGES;
  delete env.VERIFY_REPORT_FILE;
  delete env.VERIFY_RUN_ID;
  delete env.TEST_AFFECTED_PARTIAL;
  return {
    root,
    env,
    cleanup: () => {
      stub?.cleanup();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
