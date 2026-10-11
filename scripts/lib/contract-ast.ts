import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { collectFiles } from './fingerprints.ts';
import type { ManifestPackage, ProjectManifest } from './project-manifest.ts';

/** 分析用 TS program：把各包包名映射到包内源码根，协议包解析到 `src` 而不是 `dist`。 */
export function analysisProgram(
  root: string,
  manifest: ProjectManifest,
  generatedRoot: string,
  product: ManifestPackage,
  protocol: ManifestPackage,
) {
  const productSrc = resolve(root, 'packages', product.directory, 'src');
  const protocolSrc = resolve(root, 'packages', protocol.directory, 'src');
  const paths: Record<string, string[]> = {
    [`${protocol.name}/generated/*`]: [relative(root, generatedRoot) + '/*'],
    [protocol.name]: [relative(root, join(protocolSrc, 'index.ts'))],
    [`${protocol.name}/*`]: [relative(root, protocolSrc) + '/*'],
    [product.name]: [relative(root, join(productSrc, 'index.ts'))],
    [`${product.name}/*`]: [relative(root, productSrc) + '/*'],
  };
  const sources = (directory: string) =>
    collectFiles(directory, (path) => path.endsWith('.ts') && !path.endsWith('.d.ts'));
  return ts.createProgram([...sources(productSrc), ...sources(protocolSrc)], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    baseUrl: root,
    paths,
  });
}

/** 解析别名符号：仅当符号是 import 别名时才展开，避免对普通符号调用 getAliasedSymbol。 */
export function resolveAlias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

export function stringLiteral(node: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

export function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(node)) return undefined;
  return ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
    ? node.name.text
    : undefined;
}

/** 解析属性值：字符串字面量，或指向字符串常量的标识符。 */
export function resolveString(checker: ts.TypeChecker, node: ts.Expression): string | undefined {
  const literal = stringLiteral(node);
  if (literal !== undefined) return literal;
  if (!ts.isIdentifier(node)) return undefined;
  const target = resolveAlias(checker, checker.getSymbolAtLocation(node));
  const declaration = target?.valueDeclaration;
  if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
    return stringLiteral(declaration.initializer);
  return undefined;
}

/** 去掉 `as`/括号等包裹，取方法常量或 meta 的实际字面量。 */
export function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression;
  return current;
}

/** 一条 `request(...)` 里的方法名；两种调用形式都识别。 */
export function callTarget(
  checker: ts.TypeChecker,
  node: ts.Expression,
): { method: string; declaration: ts.VariableDeclaration } | undefined {
  let value: ts.Expression = node;
  if (ts.isPropertyAccessExpression(value) && value.name.text === 'meta') value = value.expression;
  if (!ts.isIdentifier(value)) return undefined;
  const symbol = resolveAlias(checker, checker.getSymbolAtLocation(value));
  let declaration = symbol?.valueDeclaration;
  // `const meta = CreateTrade.meta` 这类再赋值：追溯到方法常量本身。
  if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const initializer = declaration.initializer;
    if (ts.isPropertyAccessExpression(initializer) && initializer.name.text === 'meta') {
      const inner = resolveAlias(
        checker,
        checker.getSymbolAtLocation(initializer.expression as ts.Identifier),
      );
      declaration = inner?.valueDeclaration;
    }
  }
  if (!declaration || !ts.isVariableDeclaration(declaration)) return undefined;
  const initializer = declaration.initializer;
  if (!initializer || !ts.isCallExpression(initializer)) return undefined;
  if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'createMethod')
    return undefined;
  const first = initializer.arguments[0];
  const argument = first && unwrapExpression(first);
  const name =
    argument && ts.isObjectLiteralExpression(argument)
      ? argument.properties.map(propertyName).includes('name')
        ? stringLiteral(
            (
              argument.properties.find(
                (item) => propertyName(item) === 'name',
              ) as ts.PropertyAssignment
            ).initializer,
          )
        : undefined
      : undefined;
  if (!name) return undefined;
  return { method: name, declaration };
}

export function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/** 申请声明位置的义务 ID 前缀：`generated/idl/infra/trade/v1/trade.ts` → `infra.trade.v1`。 */
export function packagePrefix(generatedRoot: string, file: ts.SourceFile): string | undefined {
  const relativePath = relative(generatedRoot, file.fileName).split('\\').join('/');
  // 只有 `idl/<包目录>/<文件>` 能推导包名：`idl/` 之外的入口与 `idl/` 直属文件都不属于 IDL 包。
  const match = /^idl\/(.+)\/[^/]+$/.exec(relativePath);
  return match ? match[1]!.split('/').join('.') : undefined;
}
