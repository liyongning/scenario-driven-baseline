import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { collectReachableFields } from './response-shape.ts';
import { collectFiles } from './fingerprints.ts';
import { loadProjectManifest, packageByRole, testProjectsByClass } from './project-manifest.ts';
import {
  exportedType,
  fieldObligations,
  sharedMethodObligations,
  type ConsumedDeclaration,
  type FieldDiscovery,
  type Obligation,
  type RequestPolicy,
} from './contract-fields.ts';
import {
  analysisProgram,
  callTarget,
  lineOf,
  packagePrefix,
  propertyName,
  resolveAlias,
  resolveString,
  stringLiteral,
  unwrapExpression,
} from './contract-ast.ts';

type InventoryOptions = Readonly<{ generatedRoot?: string }>;

function readDeclarationModule(
  checker: ts.TypeChecker,
  program: ts.Program,
  generatedRoot: string,
  modulePath: string,
  position: string,
  issues: string[],
): ConsumedDeclaration[] {
  const source = program
    .getSourceFiles()
    .find((file) => resolve(file.fileName) === resolve(modulePath));
  if (!source) {
    issues.push(`consumedOperations 声明模块不存在或未进入分析范围：${position}`);
    return [];
  }
  const module = checker.getSymbolAtLocation(source);
  const exported =
    module && checker.getExportsOfModule(module).find((item) => item.name === 'consumedOperations');
  const valueDeclaration = exported?.valueDeclaration;
  const initializer =
    valueDeclaration && ts.isVariableDeclaration(valueDeclaration)
      ? valueDeclaration.initializer
      : undefined;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    issues.push(`consumedOperations 声明模块未导出数组：${position}`);
    return [];
  }
  const declarations: ConsumedDeclaration[] = [];
  for (const element of initializer.elements) {
    const where = `${position}:${lineOf(source, element)}`;
    if (!ts.isObjectLiteralExpression(element)) {
      issues.push(`声明元素不是 { method, requestFields } 对象：${where}`);
      continue;
    }
    const methodProperty = element.properties.find((item) => propertyName(item) === 'method');
    const methodNode =
      methodProperty && ts.isPropertyAssignment(methodProperty)
        ? methodProperty.initializer
        : undefined;
    const symbol =
      methodNode && ts.isIdentifier(methodNode)
        ? resolveAlias(checker, checker.getSymbolAtLocation(methodNode))
        : undefined;
    const declaration =
      symbol?.valueDeclaration && ts.isVariableDeclaration(symbol.valueDeclaration)
        ? symbol.valueDeclaration
        : undefined;
    const call = declaration?.initializer;
    if (!declaration || !call || !ts.isCallExpression(call)) {
      issues.push(`声明元素的 method 无法解析到 generated 方法常量：${where}`);
      continue;
    }
    if (!ts.isIdentifier(call.expression) || call.expression.text !== 'createMethod') {
      issues.push(
        `声明元素的 method 不是 createMethod 常量（${call.expression.getText()}）：${where}`,
      );
      continue;
    }
    const prefix = packagePrefix(generatedRoot, declaration.getSourceFile());
    if (!prefix) {
      issues.push(`声明元素的 method 不在 generated/idl/ 下，无法推导 IDL 包名：${where}`);
      continue;
    }
    const firstArgument = call.arguments[0];
    const argument = firstArgument && unwrapExpression(firstArgument);
    if (!argument || !ts.isObjectLiteralExpression(argument)) {
      issues.push(`方法常量没有可读的 meta 对象：${where}`);
      continue;
    }
    const meta = (name: string) => {
      const property = argument.properties.find((item) => propertyName(item) === name);
      return property && ts.isPropertyAssignment(property)
        ? resolveString(checker, property.initializer)
        : undefined;
    };
    const name = meta('name');
    const httpMethod = meta('method');
    const path = meta('path');
    const requestType = meta('requestType');
    const responseType = meta('responseType');
    if (!name || !httpMethod || !path || !requestType || !responseType) {
      issues.push(`方法常量缺少 name、method、path、requestType 或 responseType：${where}`);
      continue;
    }
    const requestFields: Record<string, RequestPolicy> = {};
    const fieldsProperty = element.properties.find(
      (item) => propertyName(item) === 'requestFields',
    );
    if (fieldsProperty && ts.isPropertyAssignment(fieldsProperty)) {
      if (!ts.isObjectLiteralExpression(fieldsProperty.initializer)) {
        issues.push(`requestFields 不是对象字面量：${where}`);
        continue;
      }
      for (const field of fieldsProperty.initializer.properties) {
        const fieldPath = propertyName(field);
        if (!fieldPath || !ts.isPropertyAssignment(field)) {
          issues.push(`requestFields 的键必须是字段路径：${where}`);
          continue;
        }
        const policy = field.initializer;
        if (!ts.isObjectLiteralExpression(policy)) {
          issues.push(`${name} request field ${fieldPath} 的策略不是对象字面量：${where}`);
          continue;
        }
        const casesProperty = policy.properties.find((item) => propertyName(item) === 'cases');
        const authorityProperty = policy.properties.find(
          (item) => propertyName(item) === 'authority',
        );
        const cases =
          casesProperty &&
          ts.isPropertyAssignment(casesProperty) &&
          ts.isArrayLiteralExpression(casesProperty.initializer)
            ? casesProperty.initializer.elements.map((item) => stringLiteral(item))
            : undefined;
        const authority =
          authorityProperty && ts.isPropertyAssignment(authorityProperty)
            ? resolveString(checker, authorityProperty.initializer)
            : undefined;
        if (!cases || cases.some((item) => item === undefined) || !authority) {
          issues.push(`${name} request field ${fieldPath} 的策略缺少 cases 或 authority：${where}`);
          continue;
        }
        requestFields[fieldPath] = { cases: cases as string[], authority };
      }
    }
    declarations.push({
      name,
      httpMethod,
      path,
      requestType,
      responseType,
      prefix,
      source: declaration.getSourceFile(),
      requestFields,
      position: where,
    });
  }
  return declarations;
}

/**
 * 取分析 program 中对应某个源码文件的 SourceFile。
 * program 由同一批 `collectFiles` 结果创建，因此这些文件必然在 program 内。
 */
function sourceFileFor(program: ts.Program, file: string): ts.SourceFile {
  return program.getSourceFiles().find((candidate) => candidate.fileName === file)!;
}

/** 协议包手写的 `businessErrors` 目录：错误码义务的事实源（PC-02）。 */
function businessErrorNames(
  checker: ts.TypeChecker,
  program: ts.Program,
  protocolSrc: string,
): string[] {
  const files = collectFiles(
    protocolSrc,
    (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts'),
  );
  for (const file of files) {
    const source = sourceFileFor(program, file);
    const module = checker.getSymbolAtLocation(source)!;
    const symbol = checker
      .getExportsOfModule(module)
      .find((item) => item.name === 'businessErrors');
    const declaration = symbol?.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration)) continue;
    let initializer = declaration.initializer;
    if (initializer && ts.isCallExpression(initializer)) initializer = initializer.arguments[0];
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) continue;
    return initializer.properties
      .map(propertyName)
      .filter((item) => item !== undefined) as string[];
  }
  return [];
}

/** 产品包源码里的实际调用：`request(X.meta, ...)` 与把方法描述作为参数两种形式。 */
function calledMethods(
  checker: ts.TypeChecker,
  program: ts.Program,
  productSrc: string,
): Array<Readonly<{ method: string; position: string }>> {
  const calls: Array<Readonly<{ method: string; position: string }>> = [];
  const files = collectFiles(productSrc, (path) => path.endsWith('.ts') && !path.endsWith('.d.ts'));
  for (const file of files) {
    const source = sourceFileFor(program, file);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'request'
      ) {
        const argument = node.arguments[0];
        const target = argument && callTarget(checker, argument);
        if (target)
          calls.push({
            method: target.method,
            position: `${relative(program.getCurrentDirectory(), file)}:${lineOf(source, node)}`,
          });
      }
      node.forEachChild(visit);
    };
    source.forEachChild(visit);
  }
  return calls;
}

export async function buildContractInventory(root: string, options: InventoryOptions = {}) {
  const manifest = loadProjectManifest(root);
  const protocolDirectory = packageByRole(manifest, 'protocol').directory;
  const productPackage = packageByRole(manifest, 'product');
  const requiredIn = testProjectsByClass(manifest, ['integration', 'platform']);
  const integrationOnly = testProjectsByClass(manifest, ['integration']);
  const generatedRoot =
    options.generatedRoot ?? resolve(root, 'packages', protocolDirectory, 'src/generated');
  const protocolSrc = resolve(root, 'packages', protocolDirectory, 'src');
  const program = analysisProgram(root, manifest, generatedRoot);
  const checker = program.getTypeChecker();
  const issues: string[] = [];
  const declarations = (productPackage.consumedOperations ?? []).flatMap((module) =>
    readDeclarationModule(checker, program, generatedRoot, resolve(root, module), module, issues),
  );
  const obligations: Obligation[] = [];
  const discoveries: FieldDiscovery[] = [];
  for (const declaration of declarations) {
    obligations.push({
      id: `${declaration.prefix}.${declaration.name}#http-route#$`,
      cases: [declaration.name],
      requiredIn: [...requiredIn],
    });
    for (const [direction, typeName] of [
      ['request', declaration.requestType],
      ['response', declaration.responseType],
    ] as const) {
      const fields = collectReachableFields(
        checker,
        exportedType(checker, declaration.source, typeName),
      );
      const derived = fieldObligations(
        declaration.prefix,
        declaration.name,
        direction,
        typeName,
        fields,
        declaration.requestFields,
        requiredIn,
        issues,
      );
      obligations.push(...derived.obligations);
      discoveries.push(...derived.discoveries);
    }
    obligations.push(...sharedMethodObligations(declaration.prefix, declaration.name, requiredIn));
  }
  const errors = businessErrorNames(checker, program, protocolSrc);
  obligations.push({
    id: 'idl.error-contract#business-error#$',
    cases: errors,
    requiredIn: [...integrationOnly],
  });
  // 双向对账：声明了但没有调用、调用了但没有声明都是门禁问题（SCN-PROTOCOL-CONTRACT-005）。
  const declared = new Set(declarations.map((item) => item.name));
  const calls = calledMethods(
    checker,
    program,
    resolve(root, 'packages', productPackage.directory, 'src'),
  );
  for (const call of calls)
    if (!declared.has(call.method)) issues.push(`未声明的调用：${call.method}（${call.position}）`);
  for (const declaration of declarations)
    if (!calls.some((call) => call.method === declaration.name))
      issues.push(`未使用的声明：${declaration.name}（${declaration.position}）`);
  return {
    methods: declarations.map((item) => ({
      name: item.name,
      method: item.httpMethod,
      path: item.path,
    })),
    discoveries,
    obligations,
    issues,
  };
}
