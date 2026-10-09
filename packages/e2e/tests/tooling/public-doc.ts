import { relative, resolve } from 'node:path';
import ts from 'typescript';

/** 一条公共类型的中文注释要求：类型名，以及可选的字段名与状态值（联合分支 / 枚举成员）。 */
export type DocRequirement = Readonly<{
  name: string;
  fields?: readonly string[];
  values?: readonly string[];
}>;

/** 入口发现的类型要求：附上声明所在文件（相对 root），便于逐文件检查源码。 */
export type PublicTypeRequirement = DocRequirement &
  Readonly<{
    /** 声明所在文件，相对包根 `root`。 */
    file: string;
  }>;

/** 产品包根入口的发现结果：运行时值名与需要中文注释的手写类型。 */
export type EntryDiscovery = Readonly<{
  /** 根入口导出的运行时值名，与构建产物的模块键一致。 */
  values: readonly string[];
  /** 根入口导出的手写类型要求；生成代码与外部包的类型不在其中。 */
  types: readonly PublicTypeRequirement[];
}>;

const chinese = /[\u3400-\u9fff]/;
/** 生成代码目录：入口追溯到这里的声明不参与检查（ENG-03）。 */
const generated = /(^|\/)generated\//;

function isHandwritten(root: string, node: ts.Node): boolean {
  const file = relative(root, node.getSourceFile().fileName).split('\\').join('/');
  if (file.startsWith('..')) return false;
  return !generated.test(file);
}

/** 需要在入口被发现的类型声明形态。 */
function isTypeDeclaration(node: ts.Node): boolean {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isClassDeclaration(node)
  );
}

/** 在运行时仍产生模块键的声明形态；类型别名与接口在运行时被擦除。 */
function isRuntimeValue(node: ts.Node): boolean {
  return (
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  );
}

function memberName(node: ts.Node): string | undefined {
  if (
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node)
  )
    return node.name.getText(node.getSourceFile());
  return undefined;
}

/** 汇总一个类型全部声明位置的字段与状态值，去重后同名字段仍逐个位置检查。 */
function requirementOf(name: string, declarations: readonly ts.Node[]): DocRequirement {
  const fields: string[] = [];
  const values: string[] = [];
  for (const declaration of declarations) {
    const file = declaration.getSourceFile();
    const visit = (node: ts.Node) => {
      const field = memberName(node);
      if (field !== undefined) fields.push(field);
      if (ts.isEnumMember(node)) values.push(node.name.getText(file));
      if (ts.isLiteralTypeNode(node)) {
        if (ts.isStringLiteral(node.literal)) values.push(node.literal.text);
        else if (node.literal.kind === ts.SyntaxKind.TrueKeyword) values.push('true');
        else if (node.literal.kind === ts.SyntaxKind.FalseKeyword) values.push('false');
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(declaration, visit);
  }
  return { name, fields: [...new Set(fields)], values: [...new Set(values)] };
}

/**
 * 以产品包根入口为起点发现检查对象（ENG-03）：解析全部导出符号，追溯到包内的手写声明，
 * 生成代码与包外声明被排除；不依赖固定文件列表，删除示例后按入口变化。
 */
export function discoverEntryExports(
  options: Readonly<{ root: string; entry: string }>,
): EntryDiscovery {
  const entry = resolve(options.entry);
  if (!ts.sys.fileExists(entry)) throw new Error(`产品包根入口不存在：${entry}`);
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    baseUrl: options.root,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const module = source ? checker.getSymbolAtLocation(source) : undefined;
  if (!module) return { values: [], types: [] };
  const values: string[] = [];
  const types: PublicTypeRequirement[] = [];
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declarations = (symbol.declarations ?? []).filter((node) =>
      isHandwritten(options.root, node),
    );
    if (declarations.length === 0) continue;
    const documented = declarations.filter(isTypeDeclaration);
    // 同名类型在多个声明位置出现时逐位置生成要求，检查时不漏任何一处。
    const byFile = new Map<string, ts.Node[]>();
    for (const declaration of documented) {
      const file = relative(options.root, declaration.getSourceFile().fileName)
        .split('\\')
        .join('/');
      byFile.set(file, [...(byFile.get(file) ?? []), declaration]);
    }
    for (const [file, nodes] of byFile)
      types.push({ ...requirementOf(exported.name, nodes), file });
    if (declarations.some(isRuntimeValue)) values.push(exported.name);
  }
  return { values, types };
}

/** 节点前紧邻的 JSDoc 是否含中文。 */
function chineseJsDoc(source: string, file: ts.SourceFile, node: ts.Node): boolean {
  const before = source.slice(0, node.getStart(file));
  const start = before.lastIndexOf('/**');
  const end = before.indexOf('*/', start);
  if (start < 0 || end < 0 || !/^[\s|]*$/.test(before.slice(end + 2))) return false;
  return chinese.test(before.slice(start, end + 2));
}

function namedType(statement: ts.Statement): statement is ts.Statement & { name: ts.Identifier } {
  return (
    (ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isClassDeclaration(statement)) &&
    statement.name !== undefined
  );
}

/** 字段节点：类型/接口/类的属性与方法签名，同名字段在每个声明位置都要检查。 */
function collectFields(declarations: readonly ts.Node[]): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (memberName(node) !== undefined) found.push(node);
    ts.forEachChild(node, visit);
  };
  for (const declaration of declarations) ts.forEachChild(declaration, visit);
  return found;
}

/** 状态值节点：联合类型的字面量分支与枚举成员；属性上的字面量锚到属性本身的注释。 */
function collectValues(
  declarations: readonly ts.Node[],
  file: ts.SourceFile,
): Array<{ name: string; node: ts.Node }> {
  const found: Array<{ name: string; node: ts.Node }> = [];
  const visit = (node: ts.Node, parent?: ts.Node) => {
    if (ts.isEnumMember(node)) {
      found.push({ name: node.name.getText(file), node });
    } else if (ts.isLiteralTypeNode(node)) {
      const name = ts.isStringLiteral(node.literal)
        ? node.literal.text
        : node.literal.kind === ts.SyntaxKind.TrueKeyword
          ? 'true'
          : node.literal.kind === ts.SyntaxKind.FalseKeyword
            ? 'false'
            : undefined;
      if (name !== undefined) {
        const anchored =
          parent &&
          (ts.isPropertySignature(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isTypeAliasDeclaration(parent))
            ? parent
            : node;
        found.push({ name, node: anchored });
      }
    }
    ts.forEachChild(node, (child) => visit(child, node));
  };
  for (const declaration of declarations)
    ts.forEachChild(declaration, (child) => visit(child, declaration));
  return found;
}

/** 按入口发现的要求检查一段源码或声明文本；每个声明位置都单独检查，失败时指出位置。 */
export function publicDocIssues(source: string, requirements: readonly DocRequirement[]): string[] {
  const file = ts.createSourceFile(
    'declarations.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const issues: string[] = [];
  for (const requirement of requirements) {
    const declarations = file.statements.filter(
      (statement) => namedType(statement) && statement.name.text === requirement.name,
    );
    if (declarations.length === 0) {
      issues.push(`${requirement.name}: missing`);
      continue;
    }
    for (const declaration of declarations)
      if (!chineseJsDoc(source, file, declaration))
        issues.push(`${requirement.name}: missing Chinese JSDoc`);
    const fieldNodes = collectFields(declarations);
    for (const field of requirement.fields ?? []) {
      const matches = fieldNodes.filter((node) => memberName(node) === field);
      if (matches.length === 0) issues.push(`${requirement.name}.${field}: missing`);
      for (const node of matches)
        if (!chineseJsDoc(source, file, node))
          issues.push(`${requirement.name}.${field}: missing Chinese JSDoc`);
    }
    const valueNodes = collectValues(declarations, file);
    for (const value of requirement.values ?? []) {
      const matches = valueNodes.filter((item) => item.name === value);
      if (matches.length === 0) issues.push(`${requirement.name}.${value}: missing`);
      for (const match of matches)
        if (!chineseJsDoc(source, file, match.node))
          issues.push(`${requirement.name}.${value}: missing Chinese JSDoc`);
    }
  }
  return issues;
}
