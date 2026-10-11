'use strict';

/**
 * 依赖与平台规则的路径正则由项目清单按角色生成，不在配置里写死包目录与包名。
 * 该模块是 `.dependency-cruiser.cjs`、`eslint.config.js` 与门禁自测的共同来源。
 */

/** 正则转义，避免目录名中的元字符影响匹配。 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 按角色取全部包；不再假定 product 或 protocol 角色唯一。 */
function packagesByRole(manifest, role) {
  return (manifest.packages ?? []).filter((item) => item.role === role);
}

/** test 角色在清单合法时恰好一个。 */
function testPackage(manifest) {
  const found = packagesByRole(manifest, 'test')[0];
  if (!found) throw new Error('project.manifest.json has no test package');
  return found;
}

/** 取产品包绑定；清单校验保证每条产品包恰好绑定一次。 */
function bindingForProduct(manifest, productDirectory) {
  const found = (manifest.bindings ?? []).find((item) => item.product === productDirectory);
  if (!found) throw new Error(`project.manifest.json has no binding for ${productDirectory}`);
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
  const test = testPackage(manifest);
  return manifest.packages
    .filter((pkg) => pkg.role !== 'test')
    .flatMap((pkg) => moduleRoots(pkg).map((root) => `packages/${pkg.directory}/${root}`))
    .concat(`packages/${test.directory}/src/shadow`);
}

/** 按角色生成依赖规则；顺序与既有配置一致。 */
function dependencyRules(manifest) {
  const products = packagesByRole(manifest, 'product');
  const protocols = packagesByRole(manifest, 'protocol');
  const test = testPackage(manifest);
  const productDirs = products.map((pkg) => escapeRegExp(pkg.directory));
  const protocolDirs = protocols.map((pkg) => escapeRegExp(pkg.directory));
  const testDir = escapeRegExp(test.directory);
  const productionRoots = [...new Set([...products, ...protocols].map(sourceRoot))]
    .map((root) => escapeRegExp(root))
    .join('|');
  const allDirs = manifest.packages.map((pkg) => escapeRegExp(pkg.directory)).join('|');
  const productPattern = `(?:${productDirs.join('|')})`;
  const protocolPattern = `(?:${protocolDirs.join('|')})`;
  const protocolModulePattern = `(?:${[...new Set(protocols.flatMap((pkg) => moduleRoots(pkg)))]
    .map((root) => escapeRegExp(root))
    .join('|')})`;
  const rules = [
    {
      name: 'protocol-no-reverse-import',
      severity: 'error',
      from: {
        path: `^packages/${protocolPattern}/${protocolModulePattern}/`,
      },
      to: { path: `^packages/(?:${productPattern}|${testDir})/` },
    },
    {
      name: 'production-no-test',
      severity: 'error',
      from: {
        path: `^packages/(?:${productPattern}|${protocolPattern})/(?:${productionRoots})/`,
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
        path: `^packages/(${productPattern}|${protocolPattern})/(?:${productionRoots})/`,
      },
      to: {
        path: `^packages/(?!$1/)(?:${allDirs})/`,
        dependencyTypes: ['local'],
        dependencyTypesNot: ['aliased-tsconfig-paths', 'aliased-workspace'],
      },
    },
  ];
  for (const product of products) {
    const productDir = escapeRegExp(product.directory);
    const productRoot = escapeRegExp(sourceRoot(product));
    const binding = bindingForProduct(manifest, product.directory);
    const boundProtocol = protocols.find((item) => item.directory === binding.protocol);
    if (!boundProtocol) continue;
    const boundDir = escapeRegExp(boundProtocol.directory);
    const unboundProtocols = protocolDirs.filter((directory) => directory !== boundDir);
    if (unboundProtocols.length > 0) {
      rules.push({
        name: `product-bound-protocol-only:${product.directory}`,
        severity: 'error',
        from: { path: `^packages/${productDir}/${productRoot}/` },
        to: { path: `^packages/(?:${unboundProtocols.join('|')})/` },
      });
    }
    rules.push(
      {
        name: `product-bound-protocol-exports-only:${product.directory}`,
        severity: 'error',
        from: { path: `^packages/${productDir}/${productRoot}/` },
        to: {
          path: `^packages/${boundDir}/`,
          pathNot: `^packages/${boundDir}/(src/(index[.]ts|generated/)|dist/(index[.]|generated/))`,
        },
      },
      {
        name: `core-no-platform-or-node:${product.directory}`,
        severity: 'error',
        from: {
          path: `^packages/${productDir}/${productRoot}/(runtime|[^/]+/(core|ports))/`,
          pathNot: '[.]test[.]ts$',
        },
        to: { dependencyTypes: ['core'] },
      },
      {
        name: `domain-core-no-generated:${product.directory}`,
        severity: 'error',
        from: { path: `^packages/${productDir}/${productRoot}/[^/]+/(core|ports)/` },
        to: { path: `^packages/${boundDir}/(src/|dist/)?generated/` },
      },
      {
        name: `domain-isolation:${product.directory}`,
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
    );
  }
  rules.push({
    name: 'shadow-engine-no-generated',
    severity: 'error',
    comment:
      '测试包中的 Shadow 引擎必须与协议来源解耦：只能消费中立路由与步骤，不得导入任一协议包的 generated 或 testing 模块。',
    from: {
      path: `^packages/${testDir}/src/shadow/.*[.]ts$`,
      pathNot: '[.]test[.]ts$',
    },
    to: { path: `^packages/${protocolPattern}/(?:src/generated|testing)/` },
  });
  rules.push({
    name: 'shadow-preview-constructor-restricted',
    severity: 'error',
    comment:
      '预览模式只能由预览启动器创建；用例、harness 与其他模块不得直接或经引擎入口导入预览构造函数。',
    from: { pathNot: `^packages/${testDir}/src/preview/` },
    to: { path: `^packages/${testDir}/src/shadow/preview-server[.]ts$` },
  });
  return rules;
}

/** 业务模块的 core/ports 与运行辅助文件路径；eslint 用它限制平台全局对象。 */
function restrictedGlobalFiles(manifest) {
  return packagesByRole(manifest, 'product').flatMap((product) => {
    const directory = escapeRegExp(product.directory);
    const root = escapeRegExp(sourceRoot(product));
    return [
      `packages/${directory}/${root}/*/core/**/*.ts`,
      `packages/${directory}/${root}/*/ports/**/*.ts`,
    ];
  });
}

/** 产品包运行辅助文件的路径；eslint 用它放行 setTimeout 等宿主全局对象。 */
function runtimeFile(manifest) {
  return packagesByRole(manifest, 'product').map(
    (product) =>
      `packages/${escapeRegExp(product.directory)}/${escapeRegExp(sourceRoot(product))}/runtime/default.ts`,
  );
}

/** 行数上限：源文件 300、测试文件 600；空行与注释都不计入。 */
const SOURCE_MAX_LINES = 300;
const TEST_MAX_LINES = 600;

/** 测试文件集合：任意 `*.test.*` / `*.spec.*`，以及测试角色包 `tests/` 目录下的全部文件。 */
function testFilePatterns(manifest) {
  const test = testPackage(manifest);
  const code = '{js,mjs,cjs,ts,mts,cts}';
  return [
    `**/*.test.${code}`,
    `**/*.spec.${code}`,
    `packages/${escapeRegExp(test.directory)}/tests/**/*.${code}`,
  ];
}

/** 行数豁免只来自清单登记；schema 已强制每项带非空理由。 */
function maxLinesExemptions(manifest) {
  return manifest.quality?.maxLinesExemptions ?? [];
}

/** ESLint 的 max-lines 配置块：源文件、测试文件两档，外加清单登记的整文件豁免。 */
function maxLinesConfig(manifest) {
  const limit = (max) => ['error', { max, skipBlankLines: true, skipComments: true }];
  return [
    {
      files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
      rules: { 'max-lines': limit(SOURCE_MAX_LINES) },
    },
    { files: testFilePatterns(manifest), rules: { 'max-lines': limit(TEST_MAX_LINES) } },
    ...maxLinesExemptions(manifest).map((item) => ({
      files: [item.path],
      rules: { 'max-lines': 'off' },
    })),
  ];
}

module.exports = {
  escapeRegExp,
  packagesByRole,
  testPackage,
  bindingForProduct,
  moduleRoots,
  sourceRoot,
  modulePath,
  cruiseTargets,
  dependencyRules,
  restrictedGlobalFiles,
  runtimeFile,
  SOURCE_MAX_LINES,
  TEST_MAX_LINES,
  testFilePatterns,
  maxLinesExemptions,
  maxLinesConfig,
};
