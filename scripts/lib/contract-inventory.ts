import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  collectReachableFields,
  type ReachableField,
  type ShapeEncoding,
} from './response-shape.ts';
import { collectFiles } from './fingerprints.ts';
import {
  loadProjectManifest,
  packageByRole,
  testProjectsByClass,
  type ProjectManifest,
} from './project-manifest.ts';

type Direction = 'request' | 'response';
/** 可达字段的编码类别由协议同形校验模块统一维护（PC-04）。 */
type Encoding = ShapeEncoding;
type InventoryOptions = Readonly<{ generatedRoot?: string }>;
type Obligation = Readonly<{ id: string; cases: string[]; requiredIn: string[] }>;
type RequestPolicy = Readonly<{ cases: string[]; authority: string }>;
type FieldDiscovery = Readonly<{
  method: string;
  direction: Direction;
  typeName: string;
  path: string;
  optional: boolean;
  oneofBranch: boolean;
  encoding: Encoding | null;
  applicability: 'applicable' | 'pending';
  authority: string | null;
}>;
/** 声明模块里一条消费接口：方法描述的声明位置、元数据与请求字段策略。 */
export type ConsumedDeclaration = Readonly<{
  name: string;
  httpMethod: string;
  path: string;
  requestType: string;
  responseType: string;
  /** 义务 ID 前缀：由声明文件相对 `generated/idl/` 的目录推导（PC-01）。 */
  prefix: string;
  /** 请求/响应类型的源文件：方法常量在 generated 中的声明位置。 */
  source: ts.SourceFile;
  requestFields: Readonly<Record<string, RequestPolicy>>;
  /** 声明元素在声明模块中的位置，用于报错。 */
  position: string;
}>;

const responseAuthority =
  'protocol-contract Spec PC-01；本 Change Design“IDL 义务派生改为针对示例接口（任务 2）”';

function exportedType(checker: ts.TypeChecker, source: ts.SourceFile, name: string): ts.Type {
  const module = checker.getSymbolAtLocation(source);
  const symbol = module && checker.getExportsOfModule(module).find((item) => item.name === name);
  if (!symbol) throw new Error(`generated Consumer output is missing type ${name}`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function responseMappingCases(field: ReachableField): string[] {
  if (field.oneofBranch) return ['decoded-branch', 'wire-present', 'wire-absent'];
  if (field.optional) return ['decoded-value', 'decoded-absence', 'wire-present', 'wire-absent'];
  return ['decoded-value', 'decoded-default'];
}

function encodingCases(
  direction: Direction,
  field: ReachableField,
  mappingCases: ReadonlyArray<string>,
): string[] {
  if (mappingCases.every((item) => item === 'omitted')) return [`${direction}-wire-absent`];
  const cases = [`${direction}-${field.encoding}`];
  if (mappingCases.includes('omitted') || field.optional)
    cases.push(`${direction}-optional-absence`);
  if (field.oneofBranch) cases.push(`${direction}-oneof-absence`);
  return cases;
}

function fieldObligations(
  prefix: string,
  method: string,
  direction: Direction,
  typeName: string,
  fields: ReadonlyArray<ReachableField>,
  requestFields: Readonly<Record<string, RequestPolicy>>,
  requiredIn: ReadonlyArray<string>,
  issues: string[],
) {
  const obligations: Obligation[] = [];
  const discoveries: FieldDiscovery[] = [];
  for (const field of fields) {
    const requestPolicy = direction === 'request' ? requestFields[field.path] : undefined;
    const authority =
      direction === 'response' ? responseAuthority : (requestPolicy?.authority ?? null);
    const applicable = authority !== null && field.encoding !== undefined;
    discoveries.push({
      method,
      direction,
      typeName,
      path: field.path,
      optional: field.optional,
      oneofBranch: field.oneofBranch,
      encoding: field.encoding ?? null,
      applicability: applicable ? 'applicable' : 'pending',
      authority,
    });
    if (!field.encoding) {
      issues.push(`${method} ${direction} field ${field.path} has no approved encoding rule`);
      continue;
    }
    if (direction === 'request' && !requestPolicy) {
      issues.push(`${method} request field ${field.path} has no reviewed applicability rule`);
      continue;
    }
    const mappingCases =
      direction === 'response' ? responseMappingCases(field) : requestPolicy!.cases;
    obligations.push({
      id: `${prefix}.${method}#${direction}-mapping#${field.path}`,
      cases: [...mappingCases],
      requiredIn: [...requiredIn],
    });
    obligations.push({
      id: `${prefix}.${method}#encoding-boundary#${direction}.${field.path}`,
      cases: encodingCases(direction, field, mappingCases),
      requiredIn: [...requiredIn],
    });
  }
  return { obligations, discoveries };
}

const sharedMethodObligations = (
  prefix: string,
  method: string,
  requiredIn: ReadonlyArray<string>,
): Obligation[] => [
  {
    id: `${prefix}.${method}#header-base-req#$`,
    cases: [
      'authorization',
      'content-type',
      'x-product-id-configured',
      'x-product-id-omitted',
      // 公共请求上下文义务校验 X-Request-Id 的头名与格式（PC-05）。
      'x-request-id-header',
      'x-request-id-format',
      'base-req-request-id',
      'base-req-product-id-configured',
      'base-req-product-id-omitted',
      'lane-configured',
      'lane-omitted',
      'app-version-configured',
      'app-version-omitted',
    ],
    requiredIn: [...requiredIn],
  },
  {
    id: `${prefix}.${method}#response-handling#$`,
    cases: ['success', 'business-error', 'http-error', 'malformed-body'],
    requiredIn: [...requiredIn],
  },
  {
    id: `${prefix}.${method}#error-handling#$`,
    cases: [
      'empty-access-token',
      'host-context-error',
      'network-error',
      'cancelled',
      'codec-error',
    ],
    requiredIn: [...requiredIn],
  },
  {
    id: `${prefix}.${method}#timeout#$`,
    cases: [
      'deadline-before-context',
      'provider-timeout',
      'deadline-before-send',
      'in-flight-timeout',
      'late-result-isolated',
    ],
    requiredIn: [...requiredIn],
  },
];

/** 分析用 TS program：把各包包名映射到包内源码根，协议包解析到 `src` 而不是 `dist`。 */
function analysisProgram(root: string, manifest: ProjectManifest, generatedRoot: string) {
  const product = packageByRole(manifest, 'product');
  const protocol = packageByRole(manifest, 'protocol');
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
function resolveAlias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function stringLiteral(node: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(node)) return undefined;
  return ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
    ? node.name.text
    : undefined;
}

/** 解析属性值：字符串字面量，或指向字符串常量的标识符。 */
function resolveString(checker: ts.TypeChecker, node: ts.Expression): string | undefined {
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
function unwrapExpression(node: ts.Expression): ts.Expression {
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
function callTarget(
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

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/** 申请声明位置的义务 ID 前缀：`generated/idl/infra/trade/v1/trade.ts` → `infra.trade.v1`。 */
function packagePrefix(generatedRoot: string, file: ts.SourceFile): string | undefined {
  const relativePath = relative(generatedRoot, file.fileName).split('\\').join('/');
  // 只有 `idl/<包目录>/<文件>` 能推导包名：`idl/` 之外的入口与 `idl/` 直属文件都不属于 IDL 包。
  const match = /^idl\/(.+)\/[^/]+$/.exec(relativePath);
  return match ? match[1]!.split('/').join('.') : undefined;
}

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
