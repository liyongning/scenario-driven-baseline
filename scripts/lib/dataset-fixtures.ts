import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import type { ProtocolAdapter } from './protocol-adapters.ts';

type DatasetManifest = Readonly<{
  formatVersion: number;
  protocol: string;
  contractCarrier?: 'product' | 'engine';
  description?: string;
  entries: ReadonlyArray<
    Readonly<{
      operationId: string;
      pathParams?: Readonly<Record<string, string | number | boolean>>;
      responses: ReadonlyArray<Readonly<{ status?: number; body: unknown }>>;
    }>
  >;
}>;

/** 校验 preview 数据集：先按 schema 解析，再经对应协议适配器认领 operationId 与响应体。 */
export async function checkDatasets(options: {
  fixtureRoot: string;
  protocols: ReadonlySet<string>;
  validate: ValidateFunction;
  ajv: Ajv2020;
  adapterFor(protocolDirectory: string): Promise<ProtocolAdapter>;
  issues: string[];
}) {
  const datasetsRoot = join(options.fixtureRoot, '_datasets');
  let entries: Dirent<string>[];
  try {
    entries = await readdir(datasetsRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directory = join(datasetsRoot, entry.name);
    let manifestText: string;
    try {
      manifestText = await readFile(join(directory, 'manifest.json'), 'utf8');
    } catch {
      options.issues.push(`${entry.name}: dataset manifest.json missing`);
      continue;
    }
    let manifest: DatasetManifest;
    try {
      manifest = JSON.parse(manifestText) as DatasetManifest;
    } catch {
      options.issues.push(`${entry.name}: dataset manifest JSON invalid`);
      continue;
    }
    if (!options.validate(manifest)) {
      options.issues.push(
        `${entry.name}: dataset manifest schema ${options.ajv.errorsText(options.validate.errors)}`,
      );
      continue;
    }
    if (!options.protocols.has(manifest.protocol)) {
      options.issues.push(
        `${entry.name}: protocol ${manifest.protocol} is not a registered protocol package`,
      );
      continue;
    }
    let adapter: ProtocolAdapter;
    try {
      adapter = await options.adapterFor(manifest.protocol);
    } catch (error) {
      options.issues.push(
        `${entry.name}: protocol adapter ${manifest.protocol} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const item of manifest.entries) {
      const validator = adapter.responseValidator(item.operationId, { manifest });
      if (!validator) {
        options.issues.push(
          `${entry.name}: operationId ${item.operationId} cannot be resolved by protocol ${manifest.protocol}`,
        );
        continue;
      }
      for (const response of item.responses) {
        const status = response.status ?? 200;
        const found = validator(response.body, status);
        if (found.length > 0)
          options.issues.push(
            ...found.map(
              (issue) => `${entry.name}: ${item.operationId} status ${status}: ${issue}`,
            ),
          );
      }
    }
    try {
      const delegated = await adapter.checkFixture(manifest, { manifest: manifestText });
      options.issues.push(...delegated.map((issue) => `${entry.name}: ${issue}`));
    } catch (error) {
      options.issues.push(
        `${entry.name}: protocol adapter ${manifest.protocol} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
