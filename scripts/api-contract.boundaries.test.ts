import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { normalizeStandardContractConventions } from '../packages/openapi/testing/conventions.ts';
import {
  runApiContractCli,
  statusContract,
  syncContract,
  validateContract,
} from './api-contract.ts';
import {
  checkContractConsistency,
  contractTitle,
  contractVersion,
  generateContractFiles,
} from './lib/openapi-contract-core.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const spawn = vi.mocked(spawnSync);
const roots: string[] = [];
const standardConventions = pathToFileURL(
  fileURLToPath(new URL('../packages/openapi/testing/conventions.ts', import.meta.url)),
).href;
const conventionsFor = (source: string) => normalizeStandardContractConventions(parseYaml(source));

afterEach(() => {
  spawn.mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const validContract = `openapi: 3.0.3
info:
  title: Boundary API
  version: 1.0.0
paths:
  /trades:
    get:
      operationId: getTrade
      security: []
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Envelope'
components:
  schemas:
    Envelope:
      type: object
      properties:
        code:
          type: integer
          enum: [0, 40001]
        message:
          type: string
        data:
          nullable: true
x-business-code-table:
  OK: 0
  INVALID_REQUEST: 40001
`;

function spawnResult(status: number, stdout = '', stderr = '') {
  return { status, stdout, stderr, output: [], pid: 1, signal: null } as ReturnType<
    typeof spawnSync
  >;
}

function writeConventions(root: string, directory: string) {
  const contracts = join(root, 'packages', directory, 'contracts');
  mkdirSync(contracts, { recursive: true });
  writeFileSync(
    join(contracts, 'conventions.ts'),
    `export { normalizeStandardContractConventions as normalizeContractConventions } from ${JSON.stringify(standardConventions)};\n`,
  );
}

function syncFixture() {
  const root = mkdtempSync(join(tmpdir(), 'openapi-boundary-'));
  roots.push(root);
  const manifest = {
    packages: [
      {
        directory: 'product',
        name: '@sample/product',
        role: 'product',
        form: 'sdk',
        private: false,
        allowedDirectories: ['src'],
      },
      {
        directory: 'openapi',
        name: '@sample/openapi',
        role: 'protocol',
        protocolKind: 'openapi',
        private: false,
        allowedDirectories: ['src', 'testing', 'contracts'],
        contract: {
          file: 'packages/openapi/contracts/sample.yaml',
          lock: 'packages/openapi/contracts/sample.lock.json',
        },
      },
      {
        directory: 'e2e',
        name: '@sample/e2e',
        role: 'test',
        private: true,
        allowedDirectories: ['src', 'tests'],
      },
    ],
    bindings: [{ name: 'product-openapi', product: 'product', protocol: 'openapi', platforms: [] }],
    requiredCommands: ['check:fast'],
    testProjects: [
      { name: 'unit', class: 'unit', config: 'packages/product/vitest.config.ts' },
      { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
    ],
    fingerprints: {
      sourceRoots: ['scripts'],
      buildInputs: [],
      protocolInputs: [
        'packages/openapi/contracts/sample.yaml',
        'packages/openapi/contracts/sample.lock.json',
      ],
    },
    quality: { coverageExclusions: [], maxLinesExemptions: [] },
  };
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  for (const pkg of manifest.packages) {
    mkdirSync(join(root, 'packages', pkg.directory), { recursive: true });
    writeFileSync(
      join(root, 'packages', pkg.directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        private: pkg.private,
        ...(pkg.directory === 'product'
          ? { dependencies: { '@sample/openapi': 'workspace:*' } }
          : {}),
      }),
    );
  }
  mkdirSync(join(root, 'packages/openapi/contracts'), { recursive: true });
  writeFileSync(join(root, 'packages/openapi/contracts/sample.yaml'), validContract);
  writeConventions(root, 'openapi');
  return root;
}

test('validate reports redocly failures with and without process output', async () => {
  spawn.mockReturnValue(spawnResult(0, JSON.stringify({ totals: { errors: 0, warnings: 0 } })));
  await expect(validateContract(repositoryRoot)).resolves.toEqual({ issues: [], exitCode: 0 });

  spawn.mockReturnValue(spawnResult(1));
  const silent = await validateContract(repositoryRoot);
  expect(silent.issues.join('\n')).toContain('exit 1');

  spawn.mockReturnValue(spawnResult(1, '', 'lint stderr'));
  const noisy = await validateContract(repositoryRoot);
  expect(noisy.issues.join('\n')).toContain('lint stderr');

  spawn.mockReturnValue(spawnResult(0, JSON.stringify({ totals: { errors: 1, warnings: 2 } })));
  const reported = await validateContract(repositoryRoot);
  expect(reported.issues.join('\n')).toContain('redocly lint failed');
});

test('validate checks every registered OpenAPI contract through the mocked lint boundary', async () => {
  const root = syncFixture();
  const manifest = JSON.parse(readFileSync(join(root, 'project.manifest.json'), 'utf8')) as {
    packages: Array<Record<string, unknown>>;
    fingerprints: { protocolInputs: string[] };
  };
  manifest.packages.push({
    directory: 'player-api',
    name: '@sample/player-api',
    role: 'protocol',
    protocolKind: 'openapi',
    private: false,
    allowedDirectories: ['src', 'testing', 'contracts'],
    contract: {
      file: 'packages/player-api/contracts/player.yaml',
      lock: 'packages/player-api/contracts/player.lock.json',
    },
  });
  manifest.fingerprints.protocolInputs.push(
    'packages/player-api/contracts/player.yaml',
    'packages/player-api/contracts/player.lock.json',
  );
  writeFileSync(join(root, 'project.manifest.json'), JSON.stringify(manifest, null, 2));
  mkdirSync(join(root, 'packages/player-api/contracts'), { recursive: true });
  writeFileSync(
    join(root, 'packages/player-api/package.json'),
    JSON.stringify({ name: '@sample/player-api', private: false }, null, 2),
  );
  writeFileSync(join(root, 'packages/player-api/contracts/player.yaml'), validContract);
  writeConventions(root, 'player-api');

  const lintCalls: unknown[] = [];
  spawn.mockImplementation((_command, args) => {
    lintCalls.push(args);
    return spawnResult(0, JSON.stringify({ totals: { errors: 0, warnings: 0 } }));
  });
  await expect(validateContract(root)).resolves.toEqual({ issues: [], exitCode: 0 });
  expect(lintCalls).toHaveLength(2);
});

test('validate reports missing and malformed contract convention modules', async () => {
  const missing = syncFixture();
  rmSync(join(missing, 'packages/openapi/contracts/conventions.ts'));
  const missingResult = await runApiContractCli(['validate'], missing);
  expect(missingResult.exitCode).toBe(1);
  expect(missingResult.issues.join('\n')).toContain('无法加载契约约定模块');

  const malformed = syncFixture();
  writeFileSync(
    join(malformed, 'packages/openapi/contracts/conventions.ts'),
    'export const normalizeContractConventions = 1;\n',
  );
  const malformedResult = await runApiContractCli(['validate'], malformed);
  expect(malformedResult.exitCode).toBe(1);
  expect(malformedResult.issues.join('\n')).toContain('缺少 normalizeContractConventions');
});

test('sync exposes bundle failures without writing generated output', async () => {
  const root = syncFixture();
  writeFileSync(
    join(root, 'packages/openapi/contracts/sample.yaml'),
    validContract.replace('enum: [0, 40001]', 'enum: [0, 99999]'),
  );
  await expect(syncContract(root, 'fixture')).rejects.toThrow(/envelope code enum/);
  writeFileSync(join(root, 'packages/openapi/contracts/sample.yaml'), validContract);

  spawn.mockReturnValueOnce(spawnResult(1));
  await expect(syncContract(root, 'fixture')).rejects.toThrow(/redocly bundle failed/);

  spawn.mockReturnValueOnce(spawnResult(1, 'bundle stdout', 'bundle stderr'));
  await expect(syncContract(root, 'fixture')).rejects.toThrow(/bundle stdout/);

  await expect(syncContract(root, '   ')).rejects.toThrow(/source argument/);
});

test('CLI dispatch covers direct, package-script, missing, and error paths', async () => {
  spawn.mockReturnValue(spawnResult(0, JSON.stringify({ totals: { errors: 0, warnings: 0 } })));
  await expect(runApiContractCli(['validate'], repositoryRoot)).resolves.toEqual({
    issues: [],
    exitCode: 0,
  });
  await expect(runApiContractCli(['node', 'script', 'validate'], repositoryRoot)).resolves.toEqual({
    issues: [],
    exitCode: 0,
  });
  await expect(
    runApiContractCli(['node', 'script', 'sync'], repositoryRoot),
  ).resolves.toMatchObject({
    exitCode: 1,
  });
  await expect(
    runApiContractCli(['node', 'script', 'unknown'], repositoryRoot),
  ).resolves.toMatchObject({ exitCode: 1 });
  await expect(runApiContractCli([], repositoryRoot)).resolves.toMatchObject({ exitCode: 1 });
  await expect(
    runApiContractCli(['node', 'script', 'sync', 'source'], '/missing-root'),
  ).resolves.toMatchObject({
    exitCode: 1,
  });
});

test('status detects an unknown lock entry after fixing generated files', async () => {
  const root = syncFixture();
  spawn.mockImplementation((_command, args) => {
    const output = args?.at(-1);
    if (output) writeFileSync(output, JSON.stringify({ openapi: '3.0.3' }));
    return spawnResult(0);
  });
  await syncContract(root, 'fixture');
  await expect(runApiContractCli(['sync', 'fixture'], root)).resolves.toEqual({
    issues: [],
    exitCode: 0,
  });
  const lockPath = join(root, 'packages/openapi/contracts/sample.lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { generated: Record<string, string> };
  lock.generated['src/generated/extra.ts'] = 'unexpected';
  writeFileSync(lockPath, JSON.stringify(lock));
  expect((await statusContract(root)).join('\n')).toContain('unknown generated');
  await expect(runApiContractCli(['status'], root)).resolves.toMatchObject({ exitCode: 1 });
});

test('sparse contracts exercise parser and generator fallbacks', async () => {
  expect(() => checkContractConsistency('- invalid', conventionsFor('- invalid'))).toThrow(
    /YAML object/,
  );

  const empty = 'openapi: 3.0.3\ninfo: {}\n';
  expect(checkContractConsistency(empty, conventionsFor(empty)).issues).toEqual([]);
  expect(contractVersion(empty)).toBe('');
  expect(contractTitle(empty, 'fallback')).toBe('fallback');

  const nested = `openapi: 3.0.3
info:
  title: Nested
  version: 1.0.0
security:
  - apiKey: []
paths:
  /items:
    get:
      operationId: listItems
      x-implemented: false
      responses:
        "200":
          description: Success
components:
  schemas:
    Other:
      type: object
    Envelope:
      allOf:
        - properties:
            code:
              enum: [0, 'ignored']
        - null
      oneOf:
        - properties:
            code:
              enum: [0]
        - false
x-business-code-table:
  OK: 0
  IGNORED: text
x-common-business-codes: []
`;
  expect(checkContractConsistency(nested, conventionsFor(nested)).issues).toEqual([]);
  const sparse = `openapi: 3.0.3
security: invalid
paths:
  - invalid
`;
  const generatedSparse = await generateContractFiles(sparse, {
    codeTable: {},
    commonCodes: [],
    operationCodes: {},
    issues: [],
  });
  expect(generatedSparse).toMatchObject({
    'src/generated/codes.ts': expect.any(String),
    'src/generated/operations.ts': expect.any(String),
    'src/generated/schema.d.ts': expect.any(String),
  });
  const nestedSource = nested.replace('        - null\n', '').replace('        - false\n', '');
  const generated = await generateContractFiles(nestedSource, conventionsFor(nestedSource));
  expect(generated['src/generated/operations.ts']).toContain('implemented: false');
  expect(generated['src/generated/operations.ts']).toContain('security: [{"apiKey":[]}]');
});

test('operations without security or registered codes default to empty arrays', async () => {
  const source = `openapi: 3.0.3
info:
  title: Defaults
  version: 1.0.0
paths:
  /anonymous:
    get:
      operationId: anonymous
      responses:
        "200":
          description: Success
`;
  const generated = await generateContractFiles(source, {
    codeTable: {},
    commonCodes: [],
    operationCodes: {},
    issues: [],
  });
  expect(generated['src/generated/operations.ts']).toContain('security: [] as const');
  expect(generated['src/generated/operations.ts']).toContain('codes: []');
});

test('operations inherit top-level security while an explicit empty array remains anonymous', async () => {
  const source = `openapi: 3.0.3
info:
  title: Security inheritance
  version: 1.0.0
security:
  - accountToken: []
paths:
  /inherits:
    get:
      operationId: inherits
      responses:
        "200":
          description: Success
  /anonymous:
    get:
      operationId: anonymous
      security: []
      responses:
        "200":
          description: Success
`;
  const generated = await generateContractFiles(source, {
    codeTable: {},
    commonCodes: [],
    operationCodes: {},
    issues: [],
  });
  expect(generated['src/generated/operations.ts']).toContain(
    'security: [{"accountToken":[]}] as const',
  );
  expect(generated['src/generated/operations.ts']).toContain('security: [] as const');
});
