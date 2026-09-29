import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export type FixtureManifest = Readonly<{
  formatVersion: 1;
  ownerId: string;
  sources: Readonly<Record<string, unknown>>;
  cases: Readonly<Record<string, string>>;
  sha256: Readonly<Record<string, string>>;
}> & Readonly<Record<string, unknown>>;

const schemaUrl = new URL('../../tests/fixtures/fixture.schema.json', import.meta.url);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

export function resolveFixtureFile(directory: string, file: string): string {
  const casePath = resolve(directory, file);
  if (!casePath.startsWith(`${directory}/`)) throw new Error('fixture path escapes owner directory');
  return casePath;
}

/** 加载已经版本化并通过来源/摘要校验的 Fixture 数据。 */
export async function loadFixtureCase(options: Readonly<{ root: string; ownerId: string; caseKey: string }>) {
  const directory = resolve(options.root, options.ownerId);
  const manifestText = await readFile(join(directory, 'manifest.json'), 'utf8');
  const manifest: unknown = JSON.parse(manifestText);
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8')) as object;
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(manifest)) throw new Error(`fixture manifest schema: ${new Ajv2020().errorsText(validate.errors)}`);
  const typed = manifest as FixtureManifest;
  if (typed.ownerId !== options.ownerId) throw new Error(`fixture ownerId ${typed.ownerId} does not match ${options.ownerId}`);
  const file = typed.cases[options.caseKey];
  if (!file) throw new Error(`fixture case ${options.caseKey} is not declared`);
  const casePath = resolveFixtureFile(directory, file);
  const text = await readFile(casePath, 'utf8');
  if (typed.sha256[file] !== digest(text)) throw new Error(`fixture sha256 mismatch for ${file}`);
  return { manifest: typed, file: casePath, data: JSON.parse(text) as unknown };
}
