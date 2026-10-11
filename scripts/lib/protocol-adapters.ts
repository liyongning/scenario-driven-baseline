import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { errorMessage, packageByDirectory, type ProjectManifest } from './project-manifest.ts';

export type Obligation = Readonly<{ id: string; cases: string[]; requiredIn: string[] }>;
export type RequestPolicy = Readonly<{ cases: string[]; authority: string }>;
export type FieldDiscovery = Readonly<{
  method: string;
  direction: 'request' | 'response';
  typeName: string;
  path: string;
  optional: boolean;
  oneofBranch: boolean;
  encoding: string | null;
  applicability: 'applicable' | 'pending';
  authority: string | null;
}>;

/** 协议适配器解析出的中立消费接口；协议特有元数据只通过 meta 传递。 */
export type ProtocolOperation = Readonly<{
  key: string;
  prefix: string;
  methodName: string;
  httpMethod: string;
  path: string;
  requestFields: Readonly<Record<string, RequestPolicy>>;
  position: string;
  meta: unknown;
}>;

/** 单个消费接口声明元素的原始上下文；类型断言由具体协议适配器负责。 */
export type ProtocolDeclarationInput = Readonly<{
  element: unknown;
  checker: unknown;
  program: unknown;
  generatedRoot: string;
  modulePath: string;
  position: string;
  issues: string[];
}>;

export type ProtocolObligationInput = Readonly<{
  operation?: ProtocolOperation;
  checker: unknown;
  program: unknown;
  protocolSrc: string;
  requiredIn: ReadonlyArray<string>;
  integrationOnly: ReadonlyArray<string>;
  issues: string[];
}>;

export type ProtocolCallScanInput = Readonly<{
  checker: unknown;
  program: unknown;
  productSrc: string;
  sourceFiles: ReadonlyArray<string>;
}>;

export type ProtocolFixtureFiles = Readonly<Record<string, unknown>>;

export type ProtocolAdapter = Readonly<{
  resolveDeclaration(input: ProtocolDeclarationInput): ProtocolOperation | undefined;
  deriveObligations(input: ProtocolObligationInput): Readonly<{
    obligations: Obligation[];
    discoveries: FieldDiscovery[];
  }>;
  responseValidator(operation: unknown): ((body: unknown, status: number) => string[]) | undefined;
  checkFixture(
    manifest: unknown,
    files: ProtocolFixtureFiles,
  ): ReadonlyArray<string> | Promise<ReadonlyArray<string>>;
  scanCalls(
    input: ProtocolCallScanInput,
  ): ReadonlyArray<Readonly<{ method: string; position: string }>>;
}>;

const adapterMethods = [
  'resolveDeclaration',
  'deriveObligations',
  'responseValidator',
  'checkFixture',
  'scanCalls',
] as const;

/** 校验适配器形状；缺方法时保留协议包目录，便于门禁直接定位删除目标。 */
export function assertProtocolAdapter(value: unknown, protocolDirectory: string): ProtocolAdapter {
  if (!value || typeof value !== 'object')
    throw new Error(`protocol package ${protocolDirectory} testing/adapter.ts exports no adapter`);
  const missing = adapterMethods.filter(
    (method) => typeof (value as Record<string, unknown>)[method] !== 'function',
  );
  if (missing.length > 0)
    throw new Error(
      `protocol package ${protocolDirectory} testing/adapter.ts is missing methods: ${missing.join(', ')}`,
    );
  return value as ProtocolAdapter;
}

/** 按清单协议目录动态加载 testing/adapter.ts；门禁本身不按 protocolKind 分支。 */
export async function loadProtocolAdapter(
  manifest: ProjectManifest,
  protocolDirectory: string,
  options: Readonly<{ root?: string }> = {},
): Promise<ProtocolAdapter> {
  const protocol = packageByDirectory(manifest, protocolDirectory);
  if (protocol.role !== 'protocol')
    throw new Error(`package ${protocolDirectory} is not a protocol package`);
  const root = options.root ?? process.cwd();
  const adapterPath = resolve(root, 'packages', protocol.directory, 'testing', 'adapter.ts');
  if (!existsSync(adapterPath))
    throw new Error(`protocol package ${protocol.directory} is missing testing/adapter.ts`);
  try {
    const module = (await import(pathToFileURL(adapterPath).href)) as Readonly<{
      default?: unknown;
      adapter?: unknown;
    }>;
    return assertProtocolAdapter(module.default ?? module.adapter, protocol.directory);
  } catch (error) {
    const failure = new Error(
      `protocol package ${protocol.directory} testing/adapter.ts could not be loaded: ${errorMessage(error)}`,
    );
    (failure as Error & { cause?: unknown }).cause = error;
    throw failure;
  }
}
