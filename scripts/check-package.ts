import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectPackageConsumer } from '../packages/e2e/src/package-consumer.ts';
import { loadProjectManifest, packageByRole } from './lib/project-manifest.ts';

type Manifest = Readonly<{
  name?: string;
  version?: string;
  private?: boolean;
  files?: string[];
  dependencies?: Readonly<Record<string, string>>;
}>;
type PackageInput = Readonly<{
  sdkManifest: Manifest;
  protocolManifest: Manifest;
  sdkFiles: ReadonlyArray<string>;
  protocolFiles: ReadonlyArray<string>;
  record: Readonly<{ sdkVersion: string; protocolVersion: string }>;
  e2eManifest?: Manifest;
}>;
type CommandResult = Readonly<{ status: number | null; stdout: string; stderr: string }>;
type Spawn = (
  command: string,
  args: ReadonlyArray<string>,
  options: Readonly<Record<string, unknown>>,
) => CommandResult;

export function checkPackageArtifacts(input: PackageInput, protocolPackageName: string): string[] {
  const issues = [
    ...inspectPackageConsumer({
      packageJson: input.sdkManifest,
      files: input.sdkFiles,
      protocolPackageName,
      expectedProtocolVersion: input.record.protocolVersion,
    }),
    ...inspectPackageConsumer({
      packageJson: input.protocolManifest,
      files: input.protocolFiles,
      protocolPackageName,
    }),
  ];
  if (input.sdkManifest.version !== input.record.sdkVersion)
    issues.push(`SDK version does not match recorded ${input.record.sdkVersion}`);
  if (input.protocolManifest.version !== input.record.protocolVersion)
    issues.push(`protocol version does not match recorded ${input.record.protocolVersion}`);
  if (input.e2eManifest && input.e2eManifest.private !== true)
    issues.push('packages/e2e must remain private');
  return issues;
}

export async function runPackageCli(
  argv: ReadonlyArray<string>,
  root = process.cwd(),
  spawn: Spawn = spawnSync as Spawn,
) {
  const inputIndex = argv.indexOf('--input');
  let input: PackageInput;
  const commands: Array<Readonly<{ command: string; exitCode: number }>> = [];
  const manifest = loadProjectManifest(root);
  const product = packageByRole(manifest, 'product');
  const protocol = packageByRole(manifest, 'protocol');
  const test = packageByRole(manifest, 'test');
  if (inputIndex >= 0 && argv[inputIndex + 1]) {
    input = JSON.parse(await readFile(resolve(argv[inputIndex + 1]!), 'utf8')) as PackageInput;
  } else {
    const directory = await mkdtemp(resolve(tmpdir(), 'template-pack-'));
    try {
      const packed = (name: string) => {
        const result = spawn('pnpm', ['--filter', name, 'pack', '--pack-destination', directory], {
          cwd: root,
          encoding: 'utf8',
        });
        commands.push({
          command: `pnpm --filter ${name} pack --pack-destination <temp>`,
          exitCode: result.status ?? -1,
        });
        if (result.status !== 0)
          throw new Error(`${name} pack failed: ${result.stdout}${result.stderr}`);
        const path = resolve(directory, result.stdout.trim().split('\n').at(-1)!);
        const list = spawn('tar', ['-tf', path], { encoding: 'utf8' });
        if (list.status !== 0)
          throw new Error(`${basename(path)} cannot be listed: ${list.stderr}`);
        const packedManifest = spawn('tar', ['-xOf', path, 'package/package.json'], {
          encoding: 'utf8',
        });
        if (packedManifest.status !== 0)
          throw new Error(`${basename(path)} has no package manifest: ${packedManifest.stderr}`);
        return {
          manifest: JSON.parse(packedManifest.stdout) as Manifest,
          files: list.stdout.trim().split('\n').filter(Boolean),
        };
      };
      const protocolArtifact = packed(protocol.name);
      const sdk = packed(product.name);
      const e2eManifest = JSON.parse(
        await readFile(resolve(root, 'packages', test.directory, 'package.json'), 'utf8'),
      ) as Manifest;
      input = {
        sdkManifest: sdk.manifest,
        protocolManifest: protocolArtifact.manifest,
        sdkFiles: sdk.files,
        protocolFiles: protocolArtifact.files,
        record: {
          sdkVersion: sdk.manifest.version!,
          protocolVersion: protocolArtifact.manifest.version!,
        },
        e2eManifest,
      };
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
  const issues = checkPackageArtifacts(input, protocol.name);
  return {
    commands,
    sdkVersion: input.record.sdkVersion,
    protocolVersion: input.record.protocolVersion,
    issues,
    exitCode: Math.min(1, issues.length),
  };
}

/* v8 ignore start -- the real CLI branch is exercised by SCN-SCENARIO-GATE-010. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  void runPackageCli(process.argv).then((result) => {
    const { exitCode, ...output } = result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = exitCode;
  });
/* v8 ignore stop */
