import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { collectFiles } from './fingerprints.ts';
import { testPackage, type ProjectManifest } from './project-manifest.ts';
import type { AffectedTestFile } from './affected-types.ts';

/** 静态提取的一条 `defineCase` 绑定：文件、owner、case、环境与全部 cover ID。 */
export type StaticBinding = Readonly<{
  file: string;
  ownerId: string;
  caseId: string;
  environment: string;
  binding?: string;
  covers: ReadonlyArray<string>;
  flowId?: string;
}>;

/** 静态提取一段源码里全部 `defineCase` 绑定的 owner、case、环境与 cover ID。 */
export function extractCaseBindings(file: string, source: string): StaticBinding[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bindings: StaticBinding[] = [];
  const text = (node: ts.Node | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const propertyName = (name: ts.PropertyName): string | undefined =>
    ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineCase'
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const properties = new Map<string, ts.Expression>();
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = propertyName(property.name);
          if (name !== undefined) properties.set(name, property.initializer);
        }
        const ownerId = text(properties.get('ownerId'));
        const caseId = text(properties.get('caseId'));
        const environment = text(properties.get('environment'));
        const binding = text(properties.get('binding'));
        const flowId = text(properties.get('flowId'));
        if (ownerId && caseId && environment) {
          const covers: string[] = [];
          const coversNode = properties.get('covers');
          if (coversNode && ts.isArrayLiteralExpression(coversNode))
            for (const element of coversNode.elements)
              if (ts.isObjectLiteralExpression(element))
                for (const entry of element.properties)
                  if (ts.isPropertyAssignment(entry) && propertyName(entry.name) === 'id') {
                    const id = text(entry.initializer);
                    if (id) covers.push(id);
                  }
          bindings.push({
            file,
            ownerId,
            caseId,
            environment,
            ...(binding === undefined ? {} : { binding }),
            covers,
            ...(flowId === undefined ? {} : { flowId }),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return bindings;
}

/** 扫描测试包 `tests/` 下全部 spec 的绑定；扩展选择与代码选择共用这份台账。 */
export function scanCaseBindings(root: string, manifest: ProjectManifest): StaticBinding[] {
  const testDirectory = `packages/${testPackage(manifest).directory}`;
  const files = collectFiles(resolve(root, testDirectory, 'tests'), (path) =>
    path.endsWith('.spec.ts'),
  ).sort();
  return files.flatMap((path) => {
    const file = relative(root, path);
    const relativeTests = file.split('tests/')[1]?.split('/')[0];
    return extractCaseBindings(file, readFileSync(path, 'utf8')).map((item) => ({
      ...item,
      ...(item.binding === undefined &&
      relativeTests &&
      manifest.bindings.some((binding) => binding.name === relativeTests)
        ? { binding: relativeTests }
        : {}),
    }));
  });
}

/** 由选中的 ID 扩展到绑定它们的全部测试文件，覆盖其登记的全部环境。 */
export function expandSelections(
  manifest: ProjectManifest,
  bindings: ReadonlyArray<StaticBinding>,
  ids: ReadonlyArray<string>,
): AffectedTestFile[] {
  const wanted = new Set(ids);
  const files = new Map<string, AffectedTestFile>();
  for (const binding of bindings) {
    const bound = [binding.ownerId, ...binding.covers, ...(binding.flowId ? [binding.flowId] : [])];
    if (!bound.some((id) => wanted.has(id))) continue;
    const project = manifest.testProjects.find((item) => item.name === binding.environment);
    if (!project) continue;
    files.set(`${binding.environment}\0${binding.file}`, {
      project: project.name,
      className: project.class,
      file: binding.file,
    });
  }
  return [...files.values()].sort(
    (left, right) =>
      left.project.localeCompare(right.project) || left.file.localeCompare(right.file),
  );
}
