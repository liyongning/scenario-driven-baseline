import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packagesByRole, testPackage, type ProjectManifest } from './project-manifest.ts';

type ExampleWhitelists = Readonly<{
  templateExample: ReadonlyArray<string>;
  webExample: ReadonlyArray<string>;
}>;

type RemovalFixture = Readonly<{
  removal: Readonly<{
    directories: ReadonlyArray<string>;
    files: ReadonlyArray<string>;
    globs: ReadonlyArray<Readonly<{ directory: string; prefixes: ReadonlyArray<string> }>>;
  }>;
}>;

function removalWhitelists(root: string, testDirectory: string): ExampleWhitelists {
  const fixturePath = join(
    root,
    'packages',
    testDirectory,
    'tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/example-removal.json',
  );
  if (!existsSync(fixturePath)) return { templateExample: [], webExample: [] };
  const { removal } = JSON.parse(readFileSync(fixturePath, 'utf8')) as RemovalFixture;
  const entries = [
    ...removal.directories.map((item) => `${item}/`),
    ...removal.files,
    ...removal.globs.flatMap((item) =>
      item.prefixes.map((prefix) => `${item.directory}/${prefix}*`),
    ),
  ];
  return entries.reduce<{ templateExample: string[]; webExample: string[] }>(
    (groups, entry) => {
      const web =
        entry.startsWith('packages/web/') ||
        entry.startsWith('openspec/specs/web-example') ||
        entry.includes('WEB-EXAMPLE') ||
        entry.includes('/trade-completed') ||
        entry.includes('/trade-in-progress');
      groups[web ? 'webExample' : 'templateExample'].push(entry);
      return groups;
    },
    { templateExample: [], webExample: [] },
  );
}

/** Fixture 存在时按删除清单派生；Fixture 随示例删除后不再要求这些条目。 */
function exampleWhitelistEntries(root: string, manifest: ProjectManifest): ExampleWhitelists {
  const products = packagesByRole(manifest, 'product');
  const protocols = packagesByRole(manifest, 'protocol');
  const test = testPackage(manifest).directory;
  const existing = (path: string) => existsSync(join(root, path));
  const derived = removalWhitelists(root, test);
  return {
    templateExample: [
      ...derived.templateExample,
      ...products.map((item) => `packages/${item.directory}/src/example/`).filter(existing),
      ...protocols
        .map((item) => `packages/${item.directory}/testing/shadow/example/`)
        .filter(existing),
      `packages/${test}/tests/example/`,
      `packages/${test}/tests/weapp/example/`,
      `packages/${test}/host/weapp/example-runner.ts`,
      'openspec/specs/template-example/',
      `packages/${test}/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`,
      `packages/${test}/tests/tooling/example-removal-support.ts`,
      `packages/${test}/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`,
      `packages/${test}/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts`,
      'template-example:begin',
      'template-example:end',
      ...products.map((item) => `packages/${item.directory}/src/index.ts`).filter(existing),
      'consumed-operations.ts',
      `packages/${test}/host/weapp/app.js`,
      `packages/${test}/src/drivers/weapp-host.test.ts`,
      'protocol-matrix.json',
      'fixtures:refresh',
      'coverageExclusions',
    ],
    webExample: [
      ...derived.webExample,
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
      `packages/${test}/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`,
      'web-example:begin',
      'web-example:end',
    ],
  };
}

function guideWhitelistSections(guide: string): Readonly<{ template: string; web: string }> {
  const removalStart = guide.indexOf('## 移除模板示例');
  const webStart = guide.indexOf('Web 示例白名单', removalStart);
  const nextSectionStart = guide.indexOf('\n## ', removalStart + 1);
  const templateEnd =
    webStart >= 0 ? webStart : nextSectionStart >= 0 ? nextSectionStart : guide.length;
  const webEnd = nextSectionStart >= 0 ? nextSectionStart : guide.length;
  return {
    template: removalStart >= 0 ? guide.slice(removalStart, templateEnd) : '',
    web: webStart >= 0 ? guide.slice(webStart, webEnd) : '',
  };
}

/** 指南两段删除白名单必须逐项包含 Fixture 的目录、文件与 glob。 */
export function checkExampleWhitelist(
  root: string,
  manifest: ProjectManifest,
  guide: string,
): string[] {
  const entries = exampleWhitelistEntries(root, manifest);
  const sections = guideWhitelistSections(guide);
  return [
    ...entries.templateExample
      .filter((entry) => !sections.template.includes(entry))
      .map((entry) => `missing removal whitelist entry ${entry}`),
    ...entries.webExample
      .filter((entry) => !sections.web.includes(entry))
      .map((entry) => `missing removal whitelist entry ${entry}`),
  ];
}
