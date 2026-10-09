'use strict';

/**
 * 依赖与平台规则的路径正则由项目清单按角色生成，不在配置里写死包目录与包名。
 * 该模块是 `.dependency-cruiser.cjs`、`eslint.config.js` 与门禁自测的共同来源。
 */

/** 正则转义，避免目录名中的元字符影响匹配。 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 按角色取唯一的包；角色缺失属于清单非法。 */
function packageByRole(manifest, role) {
  const found = (manifest.packages ?? []).find((item) => item.role === role);
  if (!found) throw new Error(`project.manifest.json has no ${role} package`);
  return found;
}

/** 包内承载模块的根目录；缺省为 src，与清单 schema 的默认语义一致。 */
function moduleRoots(pkg) {
  return pkg.moduleRoots && pkg.moduleRoots.length > 0 ? pkg.moduleRoots : ['src'];
}

/** 包的主源码根目录：宽泛规则（跨包导入、生产/测试隔离）只看第一个模块根。 */
function sourceRoot(pkg) {
  return moduleRoots(pkg)[0];
}

/** `packages/<dir>/<root>/` 形式的匹配片段。 */
function modulePath(pkg, roots = moduleRoots(pkg)) {
  const directory = escapeRegExp(pkg.directory);
  const list = roots.map((root) => escapeRegExp(root)).join('|');
  return `^packages/${directory}/(?:${list})/`;
}

/** 依赖图必须覆盖的目录：产品包与协议包的模块根；测试包不进依赖图。 */
function cruiseTargets(manifest) {
  return manifest.packages
    .filter((pkg) => pkg.role !== 'test')
    .flatMap((pkg) => moduleRoots(pkg).map((root) => `packages/${pkg.directory}/${root}`));
}

/** 按角色生成依赖规则；顺序与既有配置一致。 */
function dependencyRules(manifest) {
  const product = packageByRole(manifest, 'product');
  const protocol = packageByRole(manifest, 'protocol');
  const test = packageByRole(manifest, 'test');
  const productDir = escapeRegExp(product.directory);
  const protocolDir = escapeRegExp(protocol.directory);
  const testDir = escapeRegExp(test.directory);
  const productRoot = escapeRegExp(sourceRoot(product));
  const protocolRoot = escapeRegExp(sourceRoot(protocol));
  const productionRoots = [...new Set([sourceRoot(product), sourceRoot(protocol)])]
    .map((root) => escapeRegExp(root))
    .join('|');
  const allDirs = manifest.packages.map((pkg) => escapeRegExp(pkg.directory)).join('|');
  return [
    {
      name: 'protocol-no-reverse-import',
      severity: 'error',
      from: { path: `^packages/${protocolDir}/${protocolRoot}/` },
      to: { path: `^packages/(?:${productDir}|${testDir})/` },
    },
    {
      name: 'production-no-test',
      severity: 'error',
      from: {
        path: `^packages/(?:${productDir}|${protocolDir})/(?:${productionRoots})/`,
        pathNot: '[.]test[.]ts$',
      },
      to: { path: `(^packages/${testDir}/|/testing/|[.]test[.]ts$|^@template-test/)` },
    },
    // 本地路径即便指向公开入口，也必须通过 npm 名称消费；仅放行已配置的 npm 名称别名。
    {
      name: 'cross-workspace-no-direct-files',
      severity: 'error',
      // 捕获组 $1 是来源包目录，供 to.path 排除同包内的相对导入。
      from: {
        path: `^packages/(${productDir}|${protocolDir})/(?:${productionRoots})/`,
      },
      to: {
        path: `^packages/(?!$1/)(?:${allDirs})/`,
        dependencyTypes: ['local'],
        dependencyTypesNot: ['aliased-tsconfig-paths', 'aliased-workspace'],
      },
    },
    {
      name: 'sdk-cross-package-exports-only',
      severity: 'error',
      from: { path: `^packages/${productDir}/${productRoot}/` },
      to: {
        path: `^packages/${protocolDir}/`,
        pathNot: `^packages/${protocolDir}/(src/(index[.]ts|generated/)|dist/(index[.]|generated/))`,
      },
    },
    {
      name: 'core-no-platform-or-node',
      severity: 'error',
      from: {
        path: `^packages/${productDir}/${productRoot}/(runtime|[^/]+/(core|ports))/`,
        pathNot: '[.]test[.]ts$',
      },
      to: { dependencyTypes: ['core'] },
    },
    // 分层守卫按目录模式覆盖产品包源码根下全部业务模块（runtime/ 除外）的 core/ports，新增模块无需改本配置；约定见产品包 AGENTS.md。
    {
      name: 'domain-core-no-generated',
      severity: 'error',
      from: { path: `^packages/${productDir}/${productRoot}/[^/]+/(core|ports)/` },
      to: { path: `^packages/${protocolDir}/(src/|dist/)?generated/` },
    },
    // Shadow 引擎只接收中立路由（PC-03）；协议来源经 testing/shadow/idl-routes.ts 与 testing/shadow/example/ 接入，引擎文件不得导入 ProtoGen 生成代码。
    {
      name: 'shadow-engine-no-generated',
      severity: 'error',
      comment:
        'Shadow 引擎（server/faults/requests/routes）必须与协议来源解耦；生成描述只在 idl-routes.ts 与 example/ 中出现。',
      from: {
        path: `^packages/${protocolDir}/(?:${moduleRoots(protocol)
          .map((root) => escapeRegExp(root))
          .join('|')})/shadow/`,
        pathNot: `(^packages/${protocolDir}/(?:${moduleRoots(protocol)
          .map((root) => escapeRegExp(root))
          .join('|')})/shadow/(idl-routes[.]ts|example/)|[.]test[.]ts$)`,
      },
      to: { path: `^packages/${protocolDir}/src/generated/` },
    },
    // 产品包内各业务模块目录互不导入；可共用的只有 runtime/ 与协议包公开入口，index.ts 作为装配入口豁免。
    {
      name: 'domain-isolation',
      severity: 'error',
      from: {
        path: `^packages/${productDir}/${productRoot}/([^/]+)/`,
        pathNot: `^packages/${productDir}/${productRoot}/runtime/`,
      },
      to: {
        path: `^packages/${productDir}/${productRoot}/([^/]+)/`,
        pathNot: [
          `^packages/${productDir}/${productRoot}/runtime/`,
          `^packages/${productDir}/${productRoot}/$1/`,
        ],
      },
    },
  ];
}

/** 业务模块的 core/ports 与运行辅助文件路径；eslint 用它限制平台全局对象。 */
function restrictedGlobalFiles(manifest) {
  const product = packageByRole(manifest, 'product');
  const directory = escapeRegExp(product.directory);
  const root = escapeRegExp(sourceRoot(product));
  return [
    `packages/${directory}/${root}/*/core/**/*.ts`,
    `packages/${directory}/${root}/*/ports/**/*.ts`,
  ];
}

/** 产品包运行辅助文件的路径；eslint 用它放行 setTimeout 等宿主全局对象。 */
function runtimeFile(manifest) {
  const product = packageByRole(manifest, 'product');
  return `packages/${escapeRegExp(product.directory)}/${escapeRegExp(sourceRoot(product))}/runtime/default.ts`;
}

module.exports = {
  escapeRegExp,
  packageByRole,
  moduleRoots,
  sourceRoot,
  modulePath,
  cruiseTargets,
  dependencyRules,
  restrictedGlobalFiles,
  runtimeFile,
};
