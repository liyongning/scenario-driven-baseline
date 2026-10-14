import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testPackage, type ProjectManifest } from './project-manifest.ts';

type ExampleWhitelists = Readonly<{
  templateExample: ReadonlyArray<string>;
  webExample: ReadonlyArray<string>;
}>;

type RemovalFixture = Readonly<{
  removal: Readonly<{
    directories: ReadonlyArray<string>;
    files: ReadonlyArray<string>;
    globs: ReadonlyArray<Readonly<{ directory: string; prefixes: ReadonlyArray<string> }>>;
    matrices?: ReadonlyArray<Readonly<{ fixture: string; declaration: string }>>;
  }>;
}>;

function derivedWhitelist(
  root: string,
  testDirectory: string,
  fixtureDirectory: string,
  fixtureName: string,
): string[] {
  const fixturePath = join(
    root,
    'packages',
    testDirectory,
    'tests/fixtures',
    fixtureDirectory,
    fixtureName,
  );
  if (!existsSync(fixturePath)) return [];
  const { removal } = JSON.parse(readFileSync(fixturePath, 'utf8')) as RemovalFixture;
  return unique([
    ...removal.directories.map((item) => `${item}/`),
    ...removal.files,
    ...removal.globs.flatMap((item) =>
      item.prefixes.map((prefix) => `${item.directory}/${prefix}*`),
    ),
    ...(removal.matrices ?? []).map((item) => item.fixture),
  ]);
}

function unique(entries: ReadonlyArray<string>): string[] {
  return [...new Set(entries)];
}

/** Fixture 存在时按删除清单派生；Fixture 随示例删除后不再要求这些条目。 */
export function exampleWhitelistEntries(
  root: string,
  manifest: ProjectManifest,
): ExampleWhitelists {
  const test = testPackage(manifest).directory;
  return {
    templateExample: derivedWhitelist(
      root,
      test,
      'SCN-TEMPLATE-ENGINEERING-008',
      'example-removal.json',
    ),
    webExample: derivedWhitelist(root, test, 'SCN-WEB-EXAMPLE-015', 'web-example-removal.json'),
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
