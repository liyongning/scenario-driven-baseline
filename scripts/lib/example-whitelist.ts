import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { packagesByRole, testPackage, type ProjectManifest } from './project-manifest.ts';

/** 指南「移除模板示例」必须逐项写明的删除白名单；包路径按清单角色派生。 */
export function exampleWhitelistEntries(root: string, manifest: ProjectManifest): string[] {
  const products = packagesByRole(manifest, 'product');
  const protocols = packagesByRole(manifest, 'protocol');
  const test = testPackage(manifest).directory;
  const existing = (path: string) => existsSync(join(root, path));
  return [
    ...products.map((item) => `packages/${item.directory}/src/example/`).filter(existing),
    ...protocols
      .map((item) => `packages/${item.directory}/testing/shadow/example/`)
      .filter(existing),
    `packages/${test}/tests/example/`,
    `packages/${test}/tests/weapp/example/`,
    `packages/${test}/host/weapp/example-runner.ts`,
    `packages/${test}/tests/fixtures/`,
    'SCN-TEMPLATE-EXAMPLE-*',
    'FLOW-TEMPLATE-EXAMPLE-*',
    `packages/${test}/tests/tooling/SCN-TEMPLATE-EXAMPLE-*`,
    'openspec/specs/template-example/',
    `packages/${test}/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`,
    `packages/${test}/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`,
    `packages/${test}/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts`,
    'template-example:begin',
    'template-example:end',
    'openspec/specs/web-example/',
    ...products
      .filter((item) => item.form === 'web-app')
      .flatMap((item) => [
        `packages/${item.directory}/src/trade-create/`,
        `packages/${item.directory}/src/trade-list/`,
        `packages/${item.directory}/src/trade-status/`,
      ]),
    `packages/${test}/tests/fixtures/_datasets/trade-in-progress/`,
    `packages/${test}/tests/fixtures/_datasets/trade-completed/`,
    'SCN-WEB-EXAMPLE-*',
    'FLOW-WEB-EXAMPLE-*',
    `packages/${test}/tests/tooling/SCN-WEB-EXAMPLE-*`,
    `packages/${test}/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`,
    'web-example:begin',
    'web-example:end',
    ...products.map((item) => `packages/${item.directory}/src/index.ts`).filter(existing),
    'consumed-operations.ts',
    `packages/${test}/host/weapp/app.js`,
    `packages/${test}/src/drivers/weapp-host.test.ts`,
    'protocol-matrix.json',
    'fixtures:refresh',
    'coverageExclusions',
  ];
}
