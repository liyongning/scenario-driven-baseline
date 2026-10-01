import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { discoverExampleRoutes } from '../../packages/payment-protocol/testing/shadow/example/routes.ts';
import { collectFiles } from './fingerprints.ts';

type Direction = 'request' | 'response';
type Encoding = 'json-string' | 'json-number' | 'json-int64-string' | 'json-boolean' | 'enum-name'
  | 'nested-object' | 'oneof-object' | 'repeated-array' | 'string-map';
type ReachableField = Readonly<{
  path: string;
  encoding: Encoding | undefined;
  optional: boolean;
  oneofBranch: boolean;
}>;
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

const requestAuthority = 'protocol-contract Spec PC-01；本 Change Design“IDL 义务派生改为针对示例接口（任务 2）”';
const responseAuthority = 'protocol-contract Spec PC-01；本 Change Design“IDL 义务派生改为针对示例接口（任务 2）”';
const requestPolicies: Readonly<Record<string, Readonly<Record<string, RequestPolicy>>>> = {
  CreateTrade: {
    biz_type: { cases: ['mapped-value'], authority: requestAuthority },
    biz_trade_no: { cases: ['mapped-value'], authority: requestAuthority },
    user_id: { cases: ['mapped-value'], authority: requestAuthority },
    goods_type: { cases: ['fixed-value'], authority: requestAuthority },
    pay_amount: { cases: ['mapped-value'], authority: requestAuthority },
    items: { cases: ['mapped-value'], authority: requestAuthority },
    'items.biz_order_no': { cases: ['mapped-value'], authority: requestAuthority },
    'items.sku_id': { cases: ['mapped-value'], authority: requestAuthority },
    'items.sku_name': { cases: ['mapped-value'], authority: requestAuthority },
    'items.quantity': { cases: ['mapped-value'], authority: requestAuthority },
    'items.unit_price': { cases: ['mapped-value'], authority: requestAuthority },
    'items.pay_amount': { cases: ['mapped-value'], authority: requestAuthority },
    'items.discount_amount': { cases: ['fixed-value'], authority: requestAuthority },
    'items.sku_snapshot': { cases: ['omitted'], authority: requestAuthority },
    'items.sku_snapshot.wechat_virtual_product_id': { cases: ['omitted'], authority: requestAuthority },
    'items.sku_snapshot.biz_snapshot': { cases: ['omitted'], authority: requestAuthority },
    original_amount: { cases: ['mapped-value'], authority: requestAuthority },
    discount_amount: { cases: ['fixed-value'], authority: requestAuthority },
    base_req: { cases: ['generated-value'], authority: requestAuthority },
    'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },
    'base_req.product_id': { cases: ['configured-value', 'omitted'], authority: requestAuthority },
  },
  QueryTrade: {
    trade_no: { cases: ['mapped-value'], authority: requestAuthority },
    biz_type: { cases: ['omitted'], authority: requestAuthority },
    biz_trade_no: { cases: ['omitted'], authority: requestAuthority },
    sync_channel: { cases: ['omitted'], authority: requestAuthority },
    base_req: { cases: ['generated-value'], authority: requestAuthority },
    'base_req.request_id': { cases: ['generated-value'], authority: requestAuthority },
    'base_req.product_id': { cases: ['configured-value', 'omitted'], authority: requestAuthority },
  },
};

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function withoutNullish(type: ts.Type): ts.Type[] {
  return (type.isUnion() ? type.types : [type]).filter(item => !(item.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
}

function typeAt(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type {
  return checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
}

function oneofBranches(checker: ts.TypeChecker, type: ts.Type): Array<Readonly<{ name: string; type: ts.Type }>> | undefined {
  const properties = checker.getPropertiesOfType(type);
  if (properties.length !== 1 || properties[0]?.name !== 'params') return undefined;
  const variants = withoutNullish(typeAt(checker, properties[0]));
  const branches: Array<Readonly<{ name: string; type: ts.Type }>> = [];
  for (const variant of variants) {
    const members = checker.getPropertiesOfType(variant).filter(member => member.name !== '$case');
    if (members.length !== 1) return undefined;
    branches.push({ name: members[0]!.name, type: typeAt(checker, members[0]!) });
  }
  return branches;
}

function describeType(checker: ts.TypeChecker, input: ts.Type): Readonly<{ type: ts.Type; encoding?: Encoding; descend: boolean }> {
  const members = withoutNullish(input);
  const type = members.length === 1 ? members[0]! : input;
  if (checker.isArrayType(type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0]!;
    const shape = describeType(checker, element);
    return { type: shape.type, encoding: 'repeated-array', descend: shape.descend };
  }
  if (type.getStringIndexType()) return { type, encoding: 'string-map', descend: false };
  if (type.flags & ts.TypeFlags.EnumLike) return { type, encoding: 'enum-name', descend: false };
  if (type.flags & ts.TypeFlags.StringLike) return { type, encoding: 'json-string', descend: false };
  if (type.flags & ts.TypeFlags.NumberLike) return { type, encoding: 'json-number', descend: false };
  if (type.flags & ts.TypeFlags.BigIntLike) return { type, encoding: 'json-int64-string', descend: false };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type, encoding: 'json-boolean', descend: false };
  if (oneofBranches(checker, type)) return { type, encoding: 'oneof-object', descend: true };
  if (type.flags & ts.TypeFlags.Object) return { type, encoding: 'nested-object', descend: true };
  return { type, descend: false };
}

function collectReachableFields(checker: ts.TypeChecker, root: ts.Type): ReachableField[] {
  const fields: ReachableField[] = [];
  const visit = (type: ts.Type, prefix: string, ancestors: ReadonlySet<ts.Type>) => {
    const branches = oneofBranches(checker, type);
    if (branches) {
      for (const branch of branches) {
        const path = `${prefix}.${snakeCase(branch.name)}`;
        const shape = describeType(checker, branch.type);
        fields.push({ path, optional: false, oneofBranch: true, encoding: shape.encoding });
        if (shape.descend && !ancestors.has(shape.type)) visit(shape.type, path, new Set([...ancestors, shape.type]));
      }
      return;
    }
    for (const property of checker.getPropertiesOfType(type)) {
      const propertyType = typeAt(checker, property);
      const optional = Boolean(property.flags & ts.SymbolFlags.Optional)
        || withoutNullish(propertyType).length !== (propertyType.isUnion() ? propertyType.types.length : 1);
      const path = prefix ? `${prefix}.${snakeCase(property.name)}` : snakeCase(property.name);
      const shape = describeType(checker, propertyType);
      fields.push({ path, optional, oneofBranch: false, encoding: shape.encoding });
      if (shape.descend && !ancestors.has(shape.type)) visit(shape.type, path, new Set([...ancestors, shape.type]));
    }
  };
  visit(root, '', new Set([root]));
  return fields;
}

function exportedType(checker: ts.TypeChecker, source: ts.SourceFile, name: string): ts.Type {
  const module = checker.getSymbolAtLocation(source);
  const symbol = module && checker.getExportsOfModule(module).find(item => item.name === name);
  if (!symbol) throw new Error(`generated Consumer output is missing type ${name}`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function deriveFields(generatedRoot: string, typeNames: ReadonlyArray<string>): Map<string, ReachableField[]> {
  const files = collectFiles(generatedRoot, path => path.endsWith('.ts'));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const tradeSource = program.getSourceFile(join(generatedRoot, 'idl/infra/trade/v1/trade.ts'));
  if (!tradeSource) throw new Error('generated Consumer trade output is missing');
  return new Map(typeNames.map(name => [name, collectReachableFields(checker, exportedType(checker, tradeSource, name))]));
}

function responseMappingCases(field: ReachableField): string[] {
  if (field.oneofBranch) return ['decoded-branch', 'wire-present', 'wire-absent'];
  if (field.optional) return ['decoded-value', 'decoded-absence', 'wire-present', 'wire-absent'];
  return ['decoded-value', 'decoded-default'];
}

function encodingCases(direction: Direction, field: ReachableField, mappingCases: ReadonlyArray<string>): string[] {
  if (mappingCases.every(item => item === 'omitted')) return [`${direction}-wire-absent`];
  const cases = [`${direction}-${field.encoding}`];
  if (mappingCases.includes('omitted') || field.optional) cases.push(`${direction}-optional-absence`);
  if (field.oneofBranch) cases.push(`${direction}-oneof-absence`);
  return cases;
}

function fieldObligations(method: string, direction: Direction, typeName: string, fields: ReadonlyArray<ReachableField>, issues: string[]) {
  const obligations: Obligation[] = [];
  const discoveries: FieldDiscovery[] = [];
  for (const field of fields) {
    const requestPolicy = direction === 'request' ? requestPolicies[method]?.[field.path] : undefined;
    const authority = direction === 'response' ? responseAuthority : requestPolicy?.authority ?? null;
    const applicable = authority !== null && field.encoding !== undefined;
    discoveries.push({
      method, direction, typeName, path: field.path, optional: field.optional, oneofBranch: field.oneofBranch,
      encoding: field.encoding ?? null, applicability: applicable ? 'applicable' : 'pending', authority,
    });
    if (!field.encoding) {
      issues.push(`${method} ${direction} field ${field.path} has no approved encoding rule`);
      continue;
    }
    if (direction === 'request' && !requestPolicy) {
      issues.push(`${method} request field ${field.path} has no reviewed applicability rule`);
      continue;
    }
    const mappingCases = direction === 'response' ? responseMappingCases(field) : requestPolicy!.cases;
    obligations.push({
      id: `infra.trade.v1.${method}#${direction}-mapping#${field.path}`,
      cases: [...mappingCases],
      requiredIn: ['integration', 'weapp'],
    });
    obligations.push({
      id: `infra.trade.v1.${method}#encoding-boundary#${direction}.${field.path}`,
      cases: encodingCases(direction, field, mappingCases),
      requiredIn: ['integration', 'weapp'],
    });
  }
  return { obligations, discoveries };
}

const sharedMethodObligations = (method: string): Obligation[] => [
  {
    id: `infra.trade.v1.${method}#header-base-req#$`,
    cases: [
      'authorization', 'content-type', 'x-product-id-configured', 'x-product-id-omitted', 'request-id-header',
      'base-req-request-id', 'base-req-product-id-configured', 'base-req-product-id-omitted',
      'lane-configured', 'lane-omitted', 'app-version-configured', 'app-version-omitted',
    ],
    requiredIn: ['integration', 'weapp'],
  },
  { id: `infra.trade.v1.${method}#response-handling#$`, cases: ['success', 'business-error', 'http-error', 'malformed-body'], requiredIn: ['integration', 'weapp'] },
  { id: `infra.trade.v1.${method}#error-handling#$`, cases: ['empty-access-token', 'host-context-error', 'network-error', 'cancelled', 'codec-error'], requiredIn: ['integration', 'weapp'] },
  { id: `infra.trade.v1.${method}#timeout#$`, cases: ['deadline-before-context', 'provider-timeout', 'deadline-before-send', 'in-flight-timeout', 'late-result-isolated'], requiredIn: ['integration', 'weapp'] },
];

export async function buildContractInventory(root: string, options: InventoryOptions = {}) {
  const routes = discoverExampleRoutes();
  const generatedRoot = options.generatedRoot ?? resolve(root, 'packages/payment-protocol/src/generated');
  const typeNames = routes.flatMap(route => [route.meta.requestType, route.meta.responseType]);
  const fields = deriveFields(generatedRoot, typeNames);
  const errors = JSON.parse(await readFile(join(root, 'packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json'), 'utf8')) as Array<{ name: string }>;
  const issues: string[] = [];
  const obligations: Obligation[] = [];
  const discoveries: FieldDiscovery[] = [];
  for (const route of routes) {
    obligations.push({ id: `infra.trade.v1.${route.methodName}#http-route#$`, cases: [route.methodName], requiredIn: ['integration', 'weapp'] });
    for (const [direction, typeName] of [['request', route.meta.requestType], ['response', route.meta.responseType]] as const) {
      const derived = fieldObligations(route.methodName, direction, typeName, fields.get(typeName)!, issues);
      obligations.push(...derived.obligations);
      discoveries.push(...derived.discoveries);
    }
    obligations.push(...sharedMethodObligations(route.methodName));
  }
  obligations.push(
    { id: 'idl.error-contract#business-error#$', cases: errors.map(item => item.name), requiredIn: ['integration'] },
  );
  return {
    methods: routes.map(route => ({ name: route.methodName, method: route.httpMethod, path: route.path })),
    discoveries,
    obligations,
    issues,
  };
}
