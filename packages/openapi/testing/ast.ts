import { relative } from 'node:path';
import ts from 'typescript';
import type {
  ProtocolCallScanInput,
  ProtocolDeclarationInput,
  RequestPolicy,
} from '../../../scripts/lib/protocol-adapters.ts';
import { contractName, operationById } from './contract.ts';

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return current;
}

function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
  if (!node.name) return undefined;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))
    return node.name.text;
  return undefined;
}

function property(node: ts.ObjectLiteralExpression, name: string) {
  return node.properties.find((item) => propertyName(item) === name);
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function resolveAlias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function operationId(
  checker: ts.TypeChecker,
  generatedRoot: string | undefined,
  expression: ts.Expression,
): string | undefined {
  const node = unwrapExpression(expression);
  if (!ts.isIdentifier(node)) return undefined;
  const symbol = resolveAlias(checker, checker.getSymbolAtLocation(node));
  const declaration = symbol?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer)
    return undefined;
  const sourcePath = declaration.getSourceFile().fileName.replace(/\\/g, '/');
  if (
    generatedRoot
      ? !sourcePath.startsWith(generatedRoot)
      : !sourcePath.endsWith('/src/generated/operations.ts')
  )
    return undefined;
  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isObjectLiteralExpression(initializer)) return undefined;
  const meta = property(initializer, 'meta');
  if (!meta || !ts.isPropertyAssignment(meta) || !ts.isObjectLiteralExpression(meta.initializer))
    return undefined;
  const id = property(meta.initializer, 'id');
  return id && ts.isPropertyAssignment(id) && ts.isStringLiteralLike(id.initializer)
    ? id.initializer.text
    : undefined;
}

function requestFields(
  checker: ts.TypeChecker,
  value: ts.ObjectLiteralExpression,
  position: string,
  issues: string[],
): Record<string, RequestPolicy> | undefined {
  const fields: Record<string, RequestPolicy> = {};
  const node = property(value, 'requestFields');
  if (!node) return fields;
  if (!ts.isPropertyAssignment(node) || !ts.isObjectLiteralExpression(node.initializer)) {
    issues.push(`requestFields 不是对象字面量：${position}`);
    return undefined;
  }
  for (const item of node.initializer.properties) {
    const key = propertyName(item);
    if (!key || !ts.isPropertyAssignment(item) || !ts.isObjectLiteralExpression(item.initializer)) {
      issues.push(`requestFields 的键与策略必须完整：${position}`);
      return undefined;
    }
    const casesNode = property(item.initializer, 'cases');
    const authorityNode = property(item.initializer, 'authority');
    const cases =
      casesNode &&
      ts.isPropertyAssignment(casesNode) &&
      ts.isArrayLiteralExpression(casesNode.initializer)
        ? casesNode.initializer.elements.map((entry) =>
            ts.isStringLiteralLike(entry) ? entry.text : undefined,
          )
        : undefined;
    const authority =
      authorityNode &&
      ts.isPropertyAssignment(authorityNode) &&
      ts.isStringLiteralLike(authorityNode.initializer)
        ? authorityNode.initializer.text
        : undefined;
    if (!cases || cases.some((entry) => entry === undefined) || typeof authority !== 'string') {
      issues.push(`${key} 的策略缺少 cases 或 authority：${position}`);
      return undefined;
    }
    fields[key] = { cases: cases as string[], authority };
  }
  return fields;
}

/** 解析 OpenAPI generated 描述常量；手写对象、IDL 常量或缺失 method 均被拒绝。 */
export function resolveOpenApiDeclaration(input: ProtocolDeclarationInput) {
  const source = (input.program as ts.Program)
    .getSourceFiles()
    .find((file) => file.fileName === input.modulePath);
  const element = unwrapExpression(input.element as ts.Expression);
  const where = `${input.position}:${source ? lineOf(source, element) : 1}`;
  if (!ts.isObjectLiteralExpression(element)) {
    input.issues.push(`声明元素不是 { method, requestFields } 对象：${where}`);
    return undefined;
  }
  const methodNode = property(element, 'method');
  const id =
    methodNode && ts.isPropertyAssignment(methodNode)
      ? operationId(input.checker as ts.TypeChecker, input.generatedRoot, methodNode.initializer)
      : undefined;
  const operation = id ? operationById(id) : undefined;
  if (!operation) {
    input.issues.push(`声明元素的 method 不是 OpenAPI generated 描述常量：${where}`);
    return undefined;
  }
  const fields = requestFields(input.checker as ts.TypeChecker, element, where, input.issues);
  if (!fields) return undefined;
  return {
    key: operation.id,
    prefix: contractName,
    methodName: operation.id,
    httpMethod: operation.method,
    path: operation.path,
    requestFields: fields,
    position: where,
    meta: { id: operation.id, method: operation.method, path: operation.path },
  };
}

/** 扫描 `<client>.request(<描述常量>, …)`，只识别 generated 描述常量。 */
export function scanOpenApiCalls(input: ProtocolCallScanInput) {
  const checker = input.checker as ts.TypeChecker;
  const program = input.program as ts.Program;
  const calls: Array<{ method: string; position: string }> = [];
  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(input.productSrc) || source.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'request' &&
          node.arguments[0]
        ) {
          const id = operationId(checker, undefined, node.arguments[0]);
          if (id)
            calls.push({
              method: id,
              position: `${relative(input.productSrc, source.fileName)}:${lineOf(source, node)}`,
            });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return calls;
}
