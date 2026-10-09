import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  collectReachableFields,
  validateResponseShape,
  type ReachableField,
} from '../../../../scripts/lib/response-shape.ts';
import type { RpcMethodMeta } from '../../src/generated/std.ts';
import type { ShadowRoute } from './routes.ts';

/** 由 ProtoGen 生成的方法描述；声明派生路由与 IDL 路由来源共用同一入参类型。 */
export type RpcMethodSource = RpcMethodMeta<unknown, unknown>;

/** generated 产物根目录：IDL 路由来源从这里的 TS 类型派生响应结构校验器（PC-04）。 */
const generatedRoot = fileURLToPath(new URL('../../src/generated', import.meta.url));

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

/** 进程内复用一个 generated 程序：结构校验器只在首次用到某响应类型时派生。 */
function generatedProgram(): ts.Program {
  program ??= ts.createProgram(generatedSources(generatedRoot), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  });
  return program;
}

/** 按响应类型名派生可达字段描述；找不到类型时报错，不静默跳过校验。 */
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

/**
 * 把 ProtoGen 生成的方法描述转换为中立 Shadow 路由。
 * 缺少所需方法、路径、HTTP 方法或 request codec 时报错，不静默跳过。
 * 每条路由注入由 generated 响应类型派生的结构校验器（PC-04），引擎本身不依赖 generated。
 */
export function routesFromRpcMethods(
  required: ReadonlyArray<RpcMethodSource>,
  candidates: ReadonlyArray<RpcMethodSource>,
): ShadowRoute[] {
  return required.map((method) => {
    const discovered = candidates.find((candidate) => candidate.name === method.name);
    if (!discovered) throw new Error(`generated metadata is missing ${method.name}`);
    if (!discovered.path || !discovered.method || !discovered.requestCodec)
      throw new Error(`generated metadata for ${method.name} is not an HTTP method`);
    if (!discovered.responseType)
      throw new Error(`generated metadata for ${method.name} is missing a response type`);
    const shape = shapeOf(discovered.responseType);
    return {
      methodName: method.name,
      httpMethod: discovered.method,
      path: discovered.path,
      validateResponse: (body: unknown) => validateResponseShape(shape, body),
    };
  });
}
