import { resolve } from 'node:path';
import { collectReachableFields } from './response-shape.ts';
import {
  bindingForProduct,
  loadProjectManifest,
  packageByDirectory,
  packagesByRole,
  testProjectsByClass,
  type ManifestBinding,
  type ManifestPackage,
  type ProjectManifest,
} from './project-manifest.ts';
import {
  exportedType,
  fieldObligations,
  sharedMethodObligations,
  type FieldDiscovery,
  type Obligation,
} from './contract-fields.ts';
import { analysisProgram } from './contract-ast.ts';
import {
  businessErrorNames,
  calledMethods,
  readDeclarationModule,
} from './contract-declarations.ts';

type InventoryOptions = Readonly<{ generatedRoot?: string }>;

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

function buildBindingInventory(input: BindingInventoryInput) {
  const { root, manifest, binding, product, protocol, generatedRoot, requiredIn, integrationOnly } =
    input;
  const protocolDirectory = protocol.directory;
  const protocolSrc = resolve(root, 'packages', protocolDirectory, 'src');
  const program = analysisProgram(root, manifest, generatedRoot, product, protocol);
  const checker = program.getTypeChecker();
  const issues: string[] = [];
  const declarations = (product.consumedOperations ?? []).flatMap((module) =>
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
    resolve(root, 'packages', product.directory, 'src'),
  );
  for (const call of calls)
    if (!declared.has(call.method)) issues.push(`未声明的调用：${call.method}（${call.position}）`);
  for (const declaration of declarations)
    if (!calls.some((call) => call.method === declaration.name))
      issues.push(`未使用的声明：${declaration.name}（${declaration.position}）`);
  return {
    binding: binding.name,
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

export async function buildContractInventory(root: string, options: InventoryOptions = {}) {
  const manifest = loadProjectManifest(root);
  const integration = testProjectsByClass(manifest, ['integration']);
  const results = packagesByRole(manifest, 'product').map((product) => {
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
  });
  return {
    methods: results.flatMap((item) => item.methods),
    discoveries: results.flatMap((item) => item.discoveries),
    obligations: results.flatMap((item) => item.obligations),
    issues: results.flatMap((item) => item.issues),
  };
}
