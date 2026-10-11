import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type {
  FieldDiscovery,
  Obligation,
  ProtocolAdapter,
  ProtocolDeclarationInput,
  ProtocolObligationInput,
} from '../../../scripts/lib/protocol-adapters.ts';
import { businessErrorNames, calledMethods, readDeclarationElement } from './idl/declarations.ts';
import {
  exportedType,
  fieldObligations,
  sharedMethodObligations,
  type ConsumedDeclaration,
} from './idl/fields.ts';
import {
  collectReachableFields,
  validateResponseShape,
  type ReachableField,
} from './idl/response-shape.ts';
import type { RpcMethodMeta } from '../src/generated/std.ts';

type RpcMethodSource = RpcMethodMeta<unknown, unknown>;

const generatedRoot = fileURLToPath(new URL('../src/generated', import.meta.url));
let program: ts.Program | undefined;
const shapes = new Map<string, ReachableField[]>();

function generatedSources(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function generatedProgram(): ts.Program {
  program ??= ts.createProgram(generatedSources(generatedRoot), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  });
  return program;
}

function shapeOf(typeName: string): ReachableField[] {
  const cached = shapes.get(typeName);
  if (cached) return cached;
  const active = generatedProgram();
  const checker = active.getTypeChecker();
  for (const source of active.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(generatedRoot)) continue;
    const module = checker.getSymbolAtLocation(source);
    const symbol =
      module && checker.getExportsOfModule(module).find((item) => item.name === typeName);
    if (!symbol) continue;
    const shape = collectReachableFields(checker, checker.getDeclaredTypeOfSymbol(symbol));
    shapes.set(typeName, shape);
    return shape;
  }
  throw new Error(`generated output is missing response type ${typeName}`);
}

function operationMeta(value: unknown): RpcMethodSource {
  if (!value || typeof value !== 'object')
    throw new Error('IDL responseValidator requires a generated method description');
  const candidate = value as Readonly<{ meta?: unknown }>;
  return (candidate.meta ?? value) as RpcMethodSource;
}

const idlAdapter: ProtocolAdapter = {
  resolveDeclaration(input: ProtocolDeclarationInput) {
    const declaration = readDeclarationElement(
      input.checker as ts.TypeChecker,
      input.generatedRoot,
      input.element as ts.Expression,
      (input.program as ts.Program)
        .getSourceFiles()
        .find((source) => source.fileName === input.modulePath)!,
      input.position,
      input.issues,
    );
    if (!declaration) return undefined;
    return {
      key: declaration.name,
      prefix: declaration.prefix,
      methodName: declaration.name,
      httpMethod: declaration.httpMethod,
      path: declaration.path,
      requestFields: declaration.requestFields,
      position: declaration.position,
      meta: declaration,
    };
  },
  deriveObligations(input: ProtocolObligationInput) {
    const checker = input.checker as ts.TypeChecker;
    const protocolProgram = input.program as ts.Program;
    if (!input.operation) {
      return {
        obligations: [
          {
            id: 'idl.error-contract#business-error#$',
            cases: businessErrorNames(checker, protocolProgram, input.protocolSrc),
            requiredIn: [...input.integrationOnly],
          },
        ],
        discoveries: [],
      };
    }
    const declaration = input.operation.meta as ConsumedDeclaration;
    const obligations: Obligation[] = [
      {
        id: `${declaration.prefix}.${declaration.name}#http-route#$`,
        cases: [declaration.name],
        requiredIn: [...input.requiredIn],
      },
    ];
    const discoveries: FieldDiscovery[] = [];
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
        input.requiredIn,
        input.issues,
      );
      obligations.push(...derived.obligations);
      discoveries.push(...derived.discoveries);
    }
    obligations.push(
      ...sharedMethodObligations(declaration.prefix, declaration.name, input.requiredIn),
    );
    return { obligations, discoveries };
  },
  responseValidator(value: unknown) {
    const method = operationMeta(value);
    if (!method.responseType) return undefined;
    const shape = shapeOf(method.responseType);
    // IDL 响应结构不因 HTTP 状态码变化；status 保留为统一适配器签名的一部分。
    return (body: unknown, status: number) => {
      void status;
      return validateResponseShape(shape, body);
    };
  },
  checkFixture() {
    return [];
  },
  scanCalls(input) {
    return calledMethods(
      input.checker as ts.TypeChecker,
      input.program as ts.Program,
      input.productSrc,
    );
  },
};

export default idlAdapter;
