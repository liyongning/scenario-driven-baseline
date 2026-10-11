import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

export type ProductForms = Readonly<{ sdk: 'sdk' | 'web-app'; web: 'sdk' | 'web-app' }>;

const defaultForms: ProductForms = { sdk: 'sdk', web: 'web-app' };

/** 受控清单：两个产品包与各自协议包绑定，产品形态可由调用方互换。 */
export function formManifest(forms: ProductForms = defaultForms): Record<string, unknown> {
  const products = [
    {
      directory: 'sdk-product',
      name: '@sample/sdk-product',
      role: 'product',
      form: forms.sdk,
      private: forms.sdk !== 'sdk',
      allowedDirectories: ['src', 'tests'],
      moduleRoots: ['src'],
      consumedOperations: ['src/consumed.ts'],
      ...(forms.sdk === 'web-app' ? { globalStore: 'src/stores/global.ts' } : {}),
    },
    {
      directory: 'web-product',
      name: '@sample/web-product',
      role: 'product',
      form: forms.web,
      private: forms.web !== 'sdk',
      allowedDirectories: ['src', 'tests'],
      moduleRoots: ['src'],
      consumedOperations: ['src/consumed.ts'],
      ...(forms.web === 'web-app' ? { globalStore: 'src/stores/global.ts' } : {}),
    },
  ];
  return {
    packages: [
      ...products,
      {
        directory: 'sdk-protocol',
        name: '@sample/sdk-protocol',
        role: 'protocol',
        protocolKind: 'idl',
        private: false,
        allowedDirectories: ['src', 'testing'],
        moduleRoots: ['src', 'testing'],
      },
      {
        directory: 'web-protocol',
        name: '@sample/web-protocol',
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
        allowedDirectories: ['src', 'tests'],
        moduleRoots: ['src', 'tests'],
      },
    ],
    bindings: [
      {
        name: 'sdk-product-binding',
        product: 'sdk-product',
        protocol: 'sdk-protocol',
        platforms: [],
      },
      {
        name: 'web-product-binding',
        product: 'web-product',
        protocol: 'web-protocol',
        platforms: [],
      },
    ],
    requiredCommands: ['check:fast', 'check:package', 'check:bundle', 'check:component-tree'],
    testProjects: [
      { name: 'sample-unit', class: 'unit', config: 'packages/sample-test/vitest.config.ts' },
      {
        name: 'integration',
        class: 'integration',
        config: 'packages/sample-test/vitest.config.integration.ts',
      },
    ],
    fingerprints: {
      sourceRoots: ['packages'],
      buildInputs: ['pnpm-lock.yaml'],
      protocolInputs: ['proto-gen.lock'],
    },
    quality: { coverageExclusions: [], maxLinesExemptions: [] },
    release: { registry: 'https://registry.example/npm/', tagPrefix: 'sample-sdk-v' },
  };
}

const project = (include: ReadonlyArray<string>, composite = false) =>
  JSON.stringify(
    {
      compilerOptions: {
        ...(composite ? { composite: true } : {}),
        noEmit: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        types: [],
      },
      include,
    },
    null,
    2,
  );

const coreProject = (include: ReadonlyArray<string>) =>
  JSON.stringify(
    {
      compilerOptions: {
        composite: true,
        noEmit: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        lib: ['ES2022'],
        types: [],
      },
      include,
    },
    null,
    2,
  );

const baseFiles = (): Record<string, string> => ({
  'packages/sdk-product/tsconfig.build.json': project(['src/**/*.ts']),
  'packages/sdk-protocol/tsconfig.build.json': project(['src/**/*.ts']),
  'packages/sdk-protocol/src/index.ts': 'export const sdkProtocol = true;\n',
  'packages/web-protocol/tsconfig.build.json': project(['src/**/*.ts']),
  'packages/web-protocol/src/index.ts': 'export const webProtocol = true;\n',
  'packages/sdk-product/src/index.ts': 'export const sdkValue: number = 1;\n',
  'packages/sdk-product/src/consumed.ts': [
    '/** 消费接口。 */',
    'export interface SdkOperation {',
    '  /** 接口名。 */',
    '  name: string;',
    '}',
    '',
  ].join('\n'),
  'packages/web-product/tsconfig.app.json': project(['src/**/*.ts', 'src/**/*.vue'], true),
  'packages/web-product/tsconfig.core.json': coreProject([
    'src/runtime/**/*.ts',
    'src/*/core/**/*.ts',
    'src/*/ports/**/*.ts',
    'src/stores/global.ts',
  ]),
  'packages/web-product/tsconfig.vitest.json': project(['tests/**/*.ts'], true),
  'packages/web-product/package.json': JSON.stringify(
    {
      name: '@sample/web-product',
      version: '0.0.0',
      private: true,
      dependencies: {
        '@sample/web-protocol': 'workspace:*',
        '@vue/devtools-api': '8.2.1',
        pinia: '4.0.3',
        vue: '3.5.43',
      },
    },
    null,
    2,
  ),
  'packages/web-product/src/main.ts': "import './AppRoot/AppRoot.vue';\n",
  'packages/web-product/src/AppRoot/AppRoot.vue': [
    '<script setup lang="ts">',
    "import Child from './components/Child/Child.vue';",
    'const count: number = 1;',
    '</script>',
    '',
    '<template>',
    '  <p>{{ count }}</p>',
    '  <Child />',
    '</template>',
    '',
    '<style scoped src="./AppRoot.css"></style>',
  ].join('\n'),
  'packages/web-product/src/AppRoot/AppRoot.css': '.root { display: block; }\n',
  'packages/web-product/src/AppRoot/components/Child/Child.vue': [
    '<script setup lang="ts">',
    'const label = "child";',
    '</script>',
    '',
    '<template><span>{{ label }}</span></template>',
    '',
    '<style scoped src="./Child.css"></style>',
  ].join('\n'),
  'packages/web-product/src/AppRoot/components/Child/Child.css': '.child { display: block; }\n',
  'packages/web-product/src/core/state.ts': [
    '/** 核心状态。 */',
    'export interface State {',
    '  /** 当前值。 */',
    '  value: number;',
    '}',
    '',
  ].join('\n'),
  'packages/web-product/src/ports/first.ts': [
    '/** 第一端口。 */',
    'export interface FirstPort {',
    '  /** 共享字段第一处。 */',
    '  shared: string;',
    '}',
    '',
  ].join('\n'),
  'packages/web-product/src/ports/second.ts': [
    '/** 第二端口。 */',
    'export interface SecondPort {',
    '  /** 共享字段第二处。 */',
    '  shared: string;',
    '}',
    '',
  ].join('\n'),
  'packages/web-product/src/context.ts': [
    '/** Vue 注入键类型替身。 */',
    'type InjectionKey<T> = symbol & {',
    '  /** 注入类型标记。 */',
    '  readonly __type?: T;',
    '};',
    '/** 模块上下文。 */',
    'export interface ModuleContext {',
    '  /** 模块名。 */',
    '  name: string;',
    '}',
    '/** 模块上下文键。 */',
    'export const contextKey: InjectionKey<ModuleContext> = Symbol();',
    '',
  ].join('\n'),
  'packages/web-product/src/consumed.ts': [
    '/** 消费接口。 */',
    'export interface WebOperation {',
    '  /** 接口名。 */',
    '  name: string;',
    '}',
    '',
  ].join('\n'),
  'packages/web-product/src/stores/global.ts': [
    '/** 全局状态。 */',
    'export type GlobalState = {',
    '  /** 当前值。 */',
    '  value: number;',
    '};',
    '',
  ].join('\n'),
  'packages/web-product/tests/type-check.test.ts': 'const value: number = 1;\nexport { value };\n',
  'tsconfig.test.json': project(['tests/**/*.ts']),
  'tests/root.test.ts': 'export const rootTest = true;\n',
  'tsconfig.tools.json': project(['tools/**/*.ts']),
  'tools/root.ts': 'export const rootTool = true;\n',
});

export function createEngineeringFormRoot(
  forms: ProductForms = defaultForms,
  files: Readonly<Record<string, string>> = {},
): ControlledRoot {
  return createControlledRoot({
    manifest: formManifest(forms),
    files: { ...baseFiles(), ...files },
    prefix: 'engineering-form-',
  });
}

export type CliResult = Readonly<{
  status: number | null;
  output: string;
  json?: Record<string, unknown>;
}>;

/** 从受控根启动仓库中的 tsx CLI，确保命令和依赖都按真实入口解析。 */
export function runCli(
  root: ControlledRoot,
  script: string,
  args: ReadonlyArray<string> = [],
): CliResult {
  const result = spawnSync(
    resolve(repositoryRoot, 'node_modules/.bin/tsx'),
    [resolve(repositoryRoot, script), ...args],
    {
      cwd: root.root,
      env: {
        ...root.env,
        PATH: `${resolve(repositoryRoot, 'node_modules/.bin')}:${root.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  let json: Record<string, unknown> | undefined;
  try {
    json = result.stdout ? (JSON.parse(result.stdout) as Record<string, unknown>) : undefined;
  } catch {
    json = undefined;
  }
  return { status: result.status, output, ...(json ? { json } : {}) };
}

export function writeInput(root: ControlledRoot, relative: string, value: unknown): string {
  const path = join(root.root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

export function readManifest(root: ControlledRoot): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root.root, 'project.manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

export function writeManifest(root: ControlledRoot, manifest: Record<string, unknown>): void {
  writeFileSync(join(root.root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
}
