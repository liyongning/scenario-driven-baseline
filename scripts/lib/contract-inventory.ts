import { resolve } from 'node:path';
import ts from 'typescript';
import {
  bindingForProduct,
  loadProjectManifest,
  packageByDirectory,
  packagesByRole,
  type ManifestBinding,
  type ManifestPackage,
  type ProjectManifest,
} from './project-manifest.ts';
import { testEnvironmentsByClass } from './test-environments.ts';
import type { FieldDiscovery, Obligation } from './protocol-adapters.ts';
import { analysisProgram } from './analysis-program.ts';
import { collectFiles } from './fingerprints.ts';
import { loadProtocolAdapter, type ProtocolOperation } from './protocol-adapters.ts';

type InventoryOptions = Readonly<{
  generatedRoot?: string;
  /** 只清点该目录下的产品包；缺省清点全部产品包（多包模板的默认口径）。 */
  product?: string;
}>;

type BindingInventoryInput = Readonly<{
  root: string;
  manifest: ProjectManifest;
  binding: ManifestBinding;
  product: ManifestPackage;
  protocol: ManifestPackage;
  generatedRoot: string;
  requiredIn: ReadonlyArray<string>;
  integrationOnly: ReadonlyArray<string>;
}>;

function readDeclarations(
  program: ts.Program,
  modulePath: string,
  issues: string[],
  resolveElement: (
    element: ts.Expression,
    source: ts.SourceFile,
    position: string,
  ) => ProtocolOperation | undefined,
): ProtocolOperation[] {
  const source = program
    .getSourceFiles()
    .find((file) => resolvePath(file.fileName) === resolvePath(modulePath));
  if (!source) {
    issues.push(`consumedOperations 声明模块不存在或未进入分析范围：${modulePath}`);
    return [];
  }
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  const exported =
    module && checker.getExportsOfModule(module).find((item) => item.name === 'consumedOperations');
  const valueDeclaration = exported?.valueDeclaration;
  const initializer =
    valueDeclaration && ts.isVariableDeclaration(valueDeclaration)
      ? valueDeclaration.initializer
      : undefined;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    issues.push(`consumedOperations 声明模块未导出数组：${modulePath}`);
    return [];
  }
  return initializer.elements.flatMap((element) => {
    const operation = resolveElement(element, source, modulePath);
    return operation ? [operation] : [];
  });
}

function resolvePath(path: string) {
  return resolve(path);
}

async function buildBindingInventory(input: BindingInventoryInput) {
  const { root, manifest, binding, product, protocol, generatedRoot, requiredIn, integrationOnly } =
    input;
  const protocolDirectory = protocol.directory;
  const protocolSrc = resolve(root, 'packages', protocolDirectory, 'src');
  const program = analysisProgram(root, manifest, generatedRoot, product, protocol);
  const checker = program.getTypeChecker();
  const issues: string[] = [];
  const adapter = await loadProtocolAdapter(manifest, protocolDirectory, { root });
  const declarations = (product.consumedOperations ?? []).flatMap((module) =>
    readDeclarations(program, resolve(root, module), issues, (element, source, position) =>
      adapter.resolveDeclaration({
        element,
        checker,
        program,
        generatedRoot,
        modulePath: source.fileName,
        position,
        issues,
      }),
    ),
  );
  const obligations: Obligation[] = [];
  const discoveries: FieldDiscovery[] = [];
  const bindingDerived = adapter.deriveObligations({
    checker,
    program,
    protocolSrc,
    requiredIn,
    integrationOnly,
    issues,
  });
  obligations.push(...bindingDerived.obligations);
  discoveries.push(...bindingDerived.discoveries);
  for (const declaration of declarations) {
    const derived = adapter.deriveObligations({
      operation: declaration,
      checker,
      program,
      protocolSrc,
      requiredIn,
      integrationOnly,
      issues,
    });
    obligations.push(...derived.obligations);
    discoveries.push(...derived.discoveries);
  }
  // 双向对账：声明了但没有调用、调用了但没有声明都是门禁问题（SCN-PROTOCOL-CONTRACT-005）。
  const declared = new Set(declarations.map((item) => item.methodName));
  const productSrc = resolve(root, 'packages', product.directory, 'src');
  const calls = adapter.scanCalls({
    checker,
    program,
    productSrc,
    sourceFiles: collectFiles(
      productSrc,
      (path) => path.endsWith('.ts') && !path.endsWith('.d.ts'),
    ),
  });
  for (const call of calls)
    if (!declared.has(call.method)) issues.push(`未声明的调用：${call.method}（${call.position}）`);
  for (const declaration of declarations)
    if (!calls.some((call) => call.method === declaration.methodName))
      issues.push(`未使用的声明：${declaration.methodName}（${declaration.position}）`);
  return {
    binding: binding.name,
    methods: declarations.map((item) => ({
      name: item.methodName,
      method: item.httpMethod,
      path: item.path,
    })),
    discoveries,
    obligations,
    issues,
  };
}

export async function buildContractInventory(root: string, options: InventoryOptions = {}) {
  const manifest = loadProjectManifest(root);
  const integration = testEnvironmentsByClass(manifest, ['integration']);
  const products = packagesByRole(manifest, 'product').filter(
    (product) => options.product === undefined || product.directory === options.product,
  );
  if (options.product !== undefined && products.length === 0)
    throw new Error(
      `contract inventory product ${options.product} is not a registered product package`,
    );
  const results = await Promise.all(
    products.map(async (product) => {
      const binding = bindingForProduct(manifest, product.directory);
      const protocol = packageByDirectory(manifest, binding.protocol);
      const generatedRoot =
        options.generatedRoot ?? resolve(root, 'packages', protocol.directory, 'src/generated');
      return buildBindingInventory({
        root,
        manifest,
        binding,
        product,
        protocol,
        generatedRoot,
        requiredIn: [...integration, ...binding.platforms],
        integrationOnly: integration,
      });
    }),
  );
  return {
    methods: results.flatMap((item) => item.methods),
    discoveries: results.flatMap((item) => item.discoveries),
    obligations: results.flatMap((item) => item.obligations),
    issues: results.flatMap((item) => item.issues),
  };
}
