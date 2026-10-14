import type {
  Obligation,
  ProtocolAdapter,
  ProtocolObligationInput,
} from '../../../scripts/lib/protocol-adapters.ts';
import { resolveOpenApiDeclaration, scanOpenApiCalls } from './ast.ts';
import {
  engineContract,
  productContract,
  responseSchema,
  schemaProperties,
  type OpenApiContract,
  type OpenApiOperationContract,
} from './contract.ts';
import { checkOpenApiFixture } from './fixture-check.ts';
import { derivePresence } from './presence.ts';
import { createResponseValidator } from './schema.ts';

type JsonObject = Record<string, unknown>;

type OpenApiContractCarriers = Readonly<{
  productContract: () => OpenApiContract;
  engineContract: OpenApiContract;
}>;

function contractForGeneratedRoot(
  generatedRoot: string | undefined,
  carriers: OpenApiContractCarriers,
): OpenApiContract {
  return generatedRoot?.replace(/\\/g, '/').includes('/testing/engine/generated')
    ? carriers.engineContract
    : carriers.productContract();
}

function contractForManifest(
  manifest: unknown,
  carriers: OpenApiContractCarriers,
): OpenApiContract {
  const carrier = value(manifest)?.contractCarrier;
  if (carrier === undefined || carrier === 'product') return carriers.productContract();
  if (carrier === 'engine') return carriers.engineContract;
  throw new Error(`OpenAPI 适配器不支持 contractCarrier=${String(carrier)}`);
}

function value(input: unknown): JsonObject | undefined {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as JsonObject)
    : undefined;
}

function directOperation(value: unknown): OpenApiOperationContract | undefined {
  if (value && typeof value === 'object' && 'codeTable' in value && 'componentSchemas' in value)
    return value as OpenApiOperationContract;
  return undefined;
}

function operationFrom(value: unknown, contract: OpenApiContract) {
  const direct = directOperation(value);
  if (direct) return direct;
  const source = value && typeof value === 'object' ? (value as JsonObject) : undefined;
  const meta =
    source?.meta && typeof source.meta === 'object' ? (source.meta as JsonObject) : source;
  const id = typeof value === 'string' ? value : typeof meta?.id === 'string' ? meta.id : undefined;
  return id ? contract.operations.find((operation) => operation.id === id) : undefined;
}

function requestBodyProperties(
  operation: OpenApiOperationContract,
): Readonly<Record<string, unknown>> {
  return schemaProperties(operation.requestBody);
}

function parameterNames(operation: OpenApiOperationContract, location: string): Set<string> {
  return new Set(
    operation.parameters.flatMap((parameter) =>
      parameter.in === location && typeof parameter.name === 'string' ? [parameter.name] : [],
    ),
  );
}

function validateRequestFields(
  operation: OpenApiOperationContract,
  fields: Readonly<Record<string, { cases: string[]; authority: string }>>,
  position: string,
  issues: string[],
) {
  const pathNames = parameterNames(operation, 'path');
  const bodyNames = requestBodyProperties(operation);
  const headerNames = new Set(
    [...parameterNames(operation, 'header'), 'Content-Type', 'X-Request-Id'].map((name) =>
      name.toLowerCase(),
    ),
  );
  for (const key of Object.keys(fields)) {
    let valid = false;
    if (key.startsWith('path.')) valid = pathNames.has(key.slice('path.'.length));
    else if (key.startsWith('body.')) {
      const name = key.slice('body.'.length);
      valid = !name.includes('.') && Object.prototype.hasOwnProperty.call(bodyNames, name);
    } else if (key.startsWith('header.'))
      valid = headerNames.has(key.slice('header.'.length).toLowerCase());
    if (!valid) issues.push(`${operation.id} requestFields ${key} 不属于契约键空间：${position}`);
  }
}

function obligationsFor(
  operation: OpenApiOperationContract,
  input: ProtocolObligationInput,
): Obligation[] {
  const requiredIn = [...input.requiredIn];
  const prefix = `${input.operation!.prefix}.${operation.id}`;
  const identity = operation.security[0] ? Object.keys(operation.security[0]) : [];
  const obligations: Obligation[] = [
    {
      id: `${prefix}#route#$`,
      cases: ['method', 'path'],
      requiredIn,
    },
    ...[...parameterNames(operation, 'path')].map((name) => ({
      id: `${prefix}#route#path.${name}`,
      cases: ['encoded'],
      requiredIn,
    })),
    {
      id: `${prefix}#identity#$`,
      cases: identity.length > 0 ? identity.map((name) => `header:${name}`) : ['anonymous'],
      requiredIn,
    },
    {
      id: `${prefix}#request-headers#$`,
      cases: [
        'content-type',
        'x-request-id-name',
        'x-request-id-format',
        ...identity.map((name) => `identity:${name}`),
      ],
      requiredIn,
    },
    { id: `${prefix}#envelope#$`, cases: ['code', 'message', 'data'], requiredIn },
    ...operation.codes.map((code) => ({
      id: `${prefix}#business-code#${code}`,
      cases: ['handled'],
      requiredIn,
    })),
    {
      id: `${prefix}#transport-failure#$`,
      cases: ['network-error', 'timeout', 'cancelled'],
      requiredIn,
    },
  ];
  for (const [key, policy] of Object.entries(input.operation!.requestFields))
    obligations.push({
      id: `${prefix}#request-fields#${key}`,
      cases: [...policy.cases],
      requiredIn,
    });
  const presence = derivePresence(responseSchema(operation, 200), operation.componentSchemas);
  obligations.push({ id: `${prefix}#presence#data`, cases: [presence.data], requiredIn });
  if (!presence.pending)
    for (const [name, value] of Object.entries(presence.properties))
      obligations.push({ id: `${prefix}#presence#data.${name}`, cases: [value], requiredIn });
  else input.issues.push(`${operation.id} presence data 联合类型无法判定，报待定`);
  return obligations;
}

/** 使用指定契约载体构造适配器；默认双载体仅供 testing 内部与就近单测使用。 */
export function createOpenApiAdapter(carriers: OpenApiContractCarriers): ProtocolAdapter {
  return {
    resolveDeclaration(input) {
      return resolveOpenApiDeclaration(
        input,
        contractForGeneratedRoot(input.generatedRoot, carriers),
      );
    },
    deriveObligations(input) {
      if (!input.operation) return { obligations: [], discoveries: [] };
      const operation =
        operationFrom(input.operation.meta, carriers.engineContract) ??
        carriers
          .productContract()
          .operations.find((item) => item.id === input.operation!.methodName);
      if (!operation) {
        input.issues.push(`OpenAPI 契约中不存在接口 ${input.operation.methodName}`);
        return { obligations: [], discoveries: [] };
      }
      if (!operation.implemented)
        console.warn(
          `OpenAPI 接口 ${operation.id} 标记为未实现；开发代理连接真实服务端时会返回未实现错误`,
        );
      validateRequestFields(
        operation,
        input.operation.requestFields,
        input.operation.position,
        input.issues,
      );
      return { obligations: obligationsFor(operation, input), discoveries: [] };
    },
    responseValidator(value, options) {
      const direct = directOperation(value);
      if (direct) return createResponseValidator(direct);
      const contract = contractForManifest(options?.manifest, carriers);
      const operation = operationFrom(value, contract);
      return operation ? createResponseValidator(operation, contract.schemaNormalizers) : undefined;
    },
    checkFixture(manifest, files) {
      try {
        return checkOpenApiFixture(manifest, files, contractForManifest(manifest, carriers));
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
    },
    scanCalls(input) {
      return scanOpenApiCalls(input);
    },
  };
}

const adapter = createOpenApiAdapter({ productContract, engineContract });

export default adapter;
