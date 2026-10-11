import ts from 'typescript';
import type {
  FieldDiscovery,
  Obligation,
  RequestPolicy,
} from '../../../../scripts/lib/protocol-adapters.ts';
import { type ReachableField, type ShapeEncoding } from './response-shape.ts';

export type Direction = 'request' | 'response';
/** 可达字段的编码类别由协议同形校验模块统一维护（PC-04）。 */
export type Encoding = ShapeEncoding;
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

export function exportedType(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  name: string,
): ts.Type {
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
  // 请求侧"可以缺失"由声明的映射策略决定（`omitted`）：类型 optional 只说明 proto presence，
  // 例如 `base_req` 由公共请求上下文填充、调用方无法省略，按 optional 派生会得到取不到证的义务；
  // 响应侧的缺失由类型 optional 决定（服务端可以不发该字段）。
  const optionalAbsence =
    direction === 'request' ? mappingCases.includes('omitted') : field.optional;
  if (optionalAbsence) cases.push(`${direction}-optional-absence`);
  if (field.oneofBranch) cases.push(`${direction}-oneof-absence`);
  return cases;
}

export function fieldObligations(
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

export const sharedMethodObligations = (
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
