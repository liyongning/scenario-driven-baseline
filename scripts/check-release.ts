import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const releaseRegistry = 'https://gitlab.daqian369.com/api/v4/projects/245/packages/npm/' as const;

type PackageRecord<Name extends string = string> = Readonly<{
  name: Name;
  version: string;
  changed: boolean;
}>;

export type ReleaseInput = Readonly<{
  targetProject: 245;
  registry: typeof releaseRegistry;
  execution: 'ci' | 'local';
  tag: string;
  sourceRevision: string;
  sdk: PackageRecord<'@daqian/payment-sdk'>;
  protocol: PackageRecord<'@daqian/payment-protocol'>;
}>;

export type ReleaseWorkspaceFacts = Readonly<{
  sdk: Readonly<{ name: string; version: string; protocolDependency: string }>;
  protocol: Readonly<{ name: string; version: string }>;
}>;

const executions = ['ci', 'local'] as const;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, label: string, allowed: readonly string[]): void {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${label} has unexpected field ${unexpected.join(', ')}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function enumeration<const Values extends readonly string[]>(value: unknown, label: string, values: Values): Values[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${label} must be one of ${values.join(', ')}`);
  return value as Values[number];
}

function packageRecord<const Name extends '@daqian/payment-sdk' | '@daqian/payment-protocol'>(
  value: unknown,
  label: 'SDK' | 'protocol',
  expectedName: Name,
): PackageRecord<Name> {
  const input = object(value, `${label} package`);
  exactKeys(input, `${label} package`, ['name', 'version', 'changed']);
  if (input.name !== expectedName) throw new Error(`${label} package name must be ${expectedName}`);
  const version = string(input.version, `${label} package version`);
  if (!versionPattern.test(version)) throw new Error(`${label} package version is invalid`);
  if (typeof input.changed !== 'boolean') throw new Error(`${label} package changed must be boolean`);
  return { name: expectedName, version, changed: input.changed };
}

/** 将不可信 JSON 收窄为固定项目、固定包名和版本组合；正式记录不包含本地 tarball 身份。 */
export function parseReleaseInput(value: unknown): ReleaseInput {
  const input = object(value, 'release record');
  exactKeys(input, 'release record', ['targetProject', 'registry', 'execution', 'tag', 'sourceRevision', 'sdk', 'protocol']);
  if (input.targetProject !== 245) throw new Error('release target must be GitLab project 245');
  if (input.registry !== releaseRegistry) throw new Error('release registry must be GitLab project 245');
  return {
    targetProject: 245,
    registry: releaseRegistry,
    execution: enumeration(input.execution, 'release execution', executions),
    tag: string(input.tag, 'release tag'),
    sourceRevision: string(input.sourceRevision, 'release sourceRevision'),
    sdk: packageRecord(input.sdk, 'SDK', '@daqian/payment-sdk'),
    protocol: packageRecord(input.protocol, 'protocol', '@daqian/payment-protocol'),
  };
}

/** 校验正式发布的版本组合与 workspace；本地测试 tarball 及其摘要不属于输入。 */
export function checkReleaseRecord(input: ReleaseInput, facts?: ReleaseWorkspaceFacts): string[] {
  const issues: string[] = [];
  if (input.targetProject !== 245) issues.push('release target must be GitLab project 245');
  if (input.registry !== releaseRegistry) issues.push('release registry must be GitLab project 245');
  if (!versionPattern.test(input.sdk.version)) issues.push(`invalid package version ${input.sdk.version}`);
  if (!versionPattern.test(input.protocol.version)) issues.push(`invalid package version ${input.protocol.version}`);
  if (!/^payment-sdk-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.tag) || input.tag !== `payment-sdk-v${input.sdk.version}`) {
    issues.push('release tag does not match SDK version');
  }
  if (!/^[0-9a-f]{40}$/.test(input.sourceRevision)) issues.push('release source revision must be a full commit SHA');
  if (!input.sdk.changed) issues.push('formal SDK release requires an SDK version change');
  if (input.protocol.changed && !input.sdk.changed) issues.push('a protocol delivery requires an SDK version change');

  if (facts) {
    if (facts.sdk.name !== input.sdk.name || facts.sdk.version !== input.sdk.version) issues.push('SDK package identity does not match the current workspace');
    if (facts.protocol.name !== input.protocol.name || facts.protocol.version !== input.protocol.version) issues.push('protocol package identity does not match the current workspace');
    if (facts.sdk.protocolDependency !== 'workspace:*') issues.push('SDK workspace dependency must remain workspace:* before normal publish');
  }
  return [...new Set(issues)];
}

export async function readReleaseWorkspaceFacts(root = process.cwd()): Promise<ReleaseWorkspaceFacts> {
  const [sdk, protocol] = await Promise.all([
    readFile(resolve(root, 'packages/payment-sdk/package.json'), 'utf8').then(JSON.parse) as Promise<Record<string, unknown>>,
    readFile(resolve(root, 'packages/payment-protocol/package.json'), 'utf8').then(JSON.parse) as Promise<Record<string, unknown>>,
  ]);
  return {
    sdk: {
      name: String(sdk.name),
      version: String(sdk.version),
      protocolDependency: String((sdk.dependencies as Record<string, unknown> | undefined)?.['@daqian/payment-protocol'] ?? ''),
    },
    protocol: { name: String(protocol.name), version: String(protocol.version) },
  };
}

function argument(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

export async function runReleaseCli(argv: readonly string[], root = process.cwd()) {
  const inputPath = argument(argv, '--input');
  if (!inputPath) return { issues: ['--input is required'], exitCode: 1 };
  try {
    const input = parseReleaseInput(JSON.parse(await readFile(resolve(root, inputPath), 'utf8')));
    const issues = checkReleaseRecord(input, await readReleaseWorkspaceFacts(root));
    return { issues, exitCode: Math.min(1, issues.length) };
  } catch (error) {
    return { issues: [`release evidence could not be read: ${String(error)}`], exitCode: 1 };
  }
}

/* v8 ignore start -- exercised as a real CLI by the integration tooling test. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runReleaseCli(process.argv).then(result => {
    console.log(JSON.stringify({ issues: result.issues }, null, 2));
    process.exitCode = result.exitCode;
  });
}
/* v8 ignore stop */
