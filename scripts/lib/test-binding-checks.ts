import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { collectFiles } from './fingerprints.ts';
import { testPackage, type ProjectManifest } from './project-manifest.ts';

function importedPackages(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return imports;
}

function declaredBindings(file: string, source: string, bindingDirectories: ReadonlySet<string>) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = new Set<string>();
  for (const binding of bindingDirectories)
    if (file.split('/').includes(binding)) declarations.add(binding);
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'binding') ||
        (ts.isStringLiteralLike(node.name) && node.name.text === 'binding')) &&
      ts.isStringLiteralLike(node.initializer)
    )
      declarations.add(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return declarations;
}

/** 导入绑定独占包的测试文件必须声明对应绑定；返回逐文件问题。 */
export function checkTestBindingDeclarations(root: string, manifest: ProjectManifest): string[] {
  const testDirectory = testPackage(manifest).directory;
  const packageBindings = new Map<string, string[]>();
  for (const binding of manifest.bindings) {
    for (const directory of [binding.product, binding.protocol])
      packageBindings.set(directory, [...(packageBindings.get(directory) ?? []), binding.name]);
  }
  const exclusive = manifest.packages.flatMap((pkg) => {
    const names = packageBindings.get(pkg.directory) ?? [];
    return names.length === 1 ? [{ pkg, binding: names[0]! }] : [];
  });
  const bindingDirectories = new Set(manifest.bindings.map((item) => item.name));
  const files = collectFiles(resolve(root, 'packages', testDirectory, 'tests'), (path) =>
    path.endsWith('.spec.ts'),
  );
  const issues: string[] = [];
  for (const path of files) {
    const file = relative(root, path).split('\\').join('/');
    const source = readFileSync(path, 'utf8');
    const declarations = declaredBindings(file, source, bindingDirectories);
    const imports = importedPackages(file, source);
    for (const { pkg, binding } of exclusive) {
      const imported = imports.some(
        (specifier) =>
          specifier === pkg.name ||
          specifier.startsWith(`${pkg.name}/`) ||
          specifier.includes(`/packages/${pkg.directory}/`),
      );
      if (imported && !declarations.has(binding))
        issues.push(
          `${file}: imports binding-exclusive package ${pkg.directory} without binding ${binding}`,
        );
    }
  }
  return issues;
}
