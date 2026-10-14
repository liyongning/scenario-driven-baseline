import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { afterEach, expect, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import { normalizeStandardContractConventions } from '../packages/openapi/testing/conventions.ts';
import {
  checkContractConsistency,
  generateContractFiles,
  runApiContractCli,
  statusContract,
  syncContract,
} from './api-contract.ts';

const roots: string[] = [];
const conventionsFor = (source: string) => normalizeStandardContractConventions(parseYaml(source));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const validContract = `openapi: 3.0.3
info:
  title: Sample API
  version: 1.2.3
paths:
  /trades:
    post:
      operationId: createTrade
      summary: Create a trade
      security:
        - apiKey: []
      x-business-codes: [TRADE_CONFLICT]
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Envelope'
  /trades/{trade_no}:
    get:
      operationId: getTrade
      summary: Read a trade
      security: []
      parameters:
        - name: trade_no
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Envelope'
components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-Access-Token
  schemas:
    Envelope:
      type: object
      required: [code, message, data]
      properties:
        code:
          type: integer
          enum: [0, 40001, 40901]
        message:
          type: string
        data:
          nullable: true
x-common-business-codes: [INVALID_REQUEST]
x-business-code-table:
  OK: 0
  INVALID_REQUEST: 40001
  TRADE_CONFLICT: 40901
`;

const redoclyConfig = `extends:\n  - recommended\nrules:\n  operation-4xx-response: off # 业务错误统一经 HTTP 200 信封返回，不使用 4xx 状态码表达。\n`;
const standardConventions = pathToFileURL(
  fileURLToPath(new URL('../packages/openapi/testing/conventions.ts', import.meta.url)),
).href;

function writeConventions(root: string, directory: string) {
  const contracts = join(root, 'packages', directory, 'contracts');
  mkdirSync(contracts, { recursive: true });
  writeFileSync(
    join(contracts, 'conventions.ts'),
    `export { normalizeStandardContractConventions as normalizeContractConventions } from ${JSON.stringify(standardConventions)};\n`,
  );
}

function fixture(contract = validContract) {
  const root = mkdtempSync(join(tmpdir(), 'template-api-contract-'));
  roots.push(root);
  const packages = [
    {
      directory: 'sample-product',
      name: '@sample/product',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'sample-protocol',
      name: '@sample/protocol',
      role: 'protocol',
      protocolKind: 'idl',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'openapi',
      name: '@sample/openapi',
      role: 'protocol',
      protocolKind: 'openapi',
      private: false,
      allowedDirectories: ['src', 'testing', 'contracts'],
      moduleRoots: ['src', 'testing'],
      contract: {
        file: 'packages/openapi/contracts/sample.yaml',
        lock: 'packages/openapi/contracts/sample.lock.json',
      },
    },
    {
      directory: 'sample-test',
      name: '@sample/test',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'tests'],
      moduleRoots: ['src', 'tests'],
    },
  ];
  writeFileSync(
    join(root, 'project.manifest.json'),
    JSON.stringify(
      {
        packages,
        bindings: [
          {
            name: 'sample-product-protocol',
            product: 'sample-product',
            protocol: 'sample-protocol',
            platforms: [],
          },
        ],
        requiredCommands: ['check:fast'],
        testProjects: [
          {
            name: 'product-unit',
            class: 'unit',
            config: 'packages/sample-product/vitest.config.ts',
          },
          {
            name: 'integration',
            class: 'integration',
            config: 'packages/sample-test/vitest.config.ts',
          },
        ],
        fingerprints: {
          sourceRoots: ['scripts'],
          buildInputs: [],
          protocolInputs: [
            'packages/openapi/contracts/sample.yaml',
            'packages/openapi/contracts/sample.lock.json',
          ],
        },
      },
      null,
      2,
    ),
  );
  for (const pkg of packages) {
    mkdirSync(join(root, 'packages', pkg.directory), { recursive: true });
    writeFileSync(
      join(root, 'packages', pkg.directory, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        private: pkg.private,
        ...(pkg.directory === 'sample-product'
          ? { dependencies: { '@sample/protocol': 'workspace:*' } }
          : {}),
      }),
    );
  }
  mkdirSync(join(root, 'packages/openapi/contracts'), { recursive: true });
  writeFileSync(join(root, 'packages/openapi/contracts/sample.yaml'), contract);
  writeConventions(root, 'openapi');
  writeFileSync(join(root, 'redocly.yaml'), redoclyConfig);
  return root;
}

function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      timeout: 20_000,
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
        },
      },
    },
    async (context) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

evidence(
  'SCN-OPENAPI-CONTRACT-001',
  'contract-consistency-rules',
  ['envelope-enum-equals-table', 'codes-subset-of-table', 'convention-from-module'],
  async (context, check) => {
    await check('envelope-enum-equals-table', () => {
      const contract = checkContractConsistency(validContract, conventionsFor(validContract));
      context.expect(contract.issues).toEqual([]);

      const extraEnum = validContract.replace(
        'enum: [0, 40001, 40901]',
        'enum: [0, 40001, 40901, 50001]',
      );
      context
        .expect(checkContractConsistency(extraEnum, conventionsFor(extraEnum)).issues.join('\n'))
        .toContain('50001');

      const extraTable = validContract.replace(
        'TRADE_CONFLICT: 40901',
        'TRADE_CONFLICT: 40901\n  SERVER_ERROR: 50001',
      );
      context
        .expect(checkContractConsistency(extraTable, conventionsFor(extraTable)).issues.join('\n'))
        .toContain('50001');
    });
    await check('codes-subset-of-table', () => {
      const common = validContract.replace(
        'x-common-business-codes: [INVALID_REQUEST]',
        'x-common-business-codes: [INVALID_REQUEST, UNKNOWN]',
      );
      context
        .expect(checkContractConsistency(common, conventionsFor(common)).issues.join('\n'))
        .toContain('top-level UNKNOWN');

      const operation = validContract.replace(
        'x-business-codes: [TRADE_CONFLICT]',
        'x-business-codes: [TRADE_CONFLICT, UNKNOWN]',
      );
      context
        .expect(checkContractConsistency(operation, conventionsFor(operation)).issues.join('\n'))
        .toContain('createTrade UNKNOWN');
    });
    await check('convention-from-module', async () => {
      const root = fixture();
      writeFileSync(
        join(root, 'packages/openapi/contracts/conventions.ts'),
        [
          'export function normalizeContractConventions() {',
          '  return {',
          '    codeTable: {},',
          '    commonCodes: [],',
          '    operationCodes: {},',
          "    issues: ['custom-convention'],",
          '  };',
          '}',
          '',
        ].join('\n'),
      );
      const result = await runApiContractCli(['validate'], root);
      context.expect(result.exitCode).not.toBe(0);
      context.expect(result.issues.join('\n')).toContain('custom-convention');
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-002',
  'sync-lock-writer',
  ['source-from-argument', 'lock-covers-all-generated', 'paths-from-manifest'],
  async (context, check) => {
    await check('source-from-argument', async () => {
      const root = fixture();
      await syncContract(root, 'gitlab:sample/repo@main#abc123');
      const lock = JSON.parse(
        readFileSync(join(root, 'packages/openapi/contracts/sample.lock.json'), 'utf8'),
      ) as { source?: string };
      context.expect(lock.source).toBe('gitlab:sample/repo@main#abc123');
    });
    await check('lock-covers-all-generated', async () => {
      const root = fixture();
      await syncContract(root, '本仓库');
      const lock = JSON.parse(
        readFileSync(join(root, 'packages/openapi/contracts/sample.lock.json'), 'utf8'),
      ) as { generated?: Record<string, string> };
      context
        .expect(Object.keys(lock.generated ?? {}).sort())
        .toEqual([
          'src/generated/codes.ts',
          'src/generated/operations.ts',
          'src/generated/schema.d.ts',
        ]);
      for (const [path, digest] of Object.entries(lock.generated ?? {})) {
        const content = readFileSync(join(root, 'packages/openapi', path));
        context.expect(digest).toMatch(/^[a-f0-9]{64}$/);
        context.expect(content.length).toBeGreaterThan(0);
      }
    });
    await check('paths-from-manifest', async () => {
      const root = fixture();
      await syncContract(root, 'local-source');
      context
        .expect(() => readFileSync(join(root, 'contracts/trade-v1.lock.json'), 'utf8'))
        .toThrow();
      context
        .expect(readFileSync(join(root, 'packages/openapi/contracts/sample.lock.json'), 'utf8'))
        .toContain('"version": "1.2.3"');
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-003',
  'status-comparator',
  ['contract-drift-detected', 'generated-drift-detected', 'generated-set-checked'],
  async (context, check) => {
    await check('contract-drift-detected', async () => {
      const root = fixture();
      await syncContract(root, '本仓库');
      writeFileSync(
        join(root, 'packages/openapi/contracts/sample.yaml'),
        validContract.replace('version: 1.2.3', 'version: 2.0.0'),
      );
      context.expect((await statusContract(root)).join('\n')).toContain('version');
    });
    await check('generated-drift-detected', async () => {
      const root = fixture();
      await syncContract(root, '本仓库');
      writeFileSync(join(root, 'packages/openapi/src/generated/codes.ts'), 'tampered\n');
      context.expect((await statusContract(root)).join('\n')).toContain('codes.ts');
    });
    await check('generated-set-checked', async () => {
      const root = fixture();
      await syncContract(root, '本仓库');
      const path = join(root, 'packages/openapi/contracts/sample.lock.json');
      const lock = JSON.parse(readFileSync(path, 'utf8')) as { generated: Record<string, string> };
      delete lock.generated['src/generated/codes.ts'];
      writeFileSync(path, JSON.stringify(lock, null, 2));
      context.expect((await statusContract(root)).join('\n')).toContain('codes.ts');

      lock.generated['src/generated/extra.ts'] = 'unexpected';
      writeFileSync(path, JSON.stringify(lock, null, 2));
      context
        .expect((await statusContract(root)).join('\n'))
        .toContain('unknown generated src/generated/extra.ts');

      await syncContract(root, '本仓库');
      rmSync(join(root, 'packages/openapi/src/generated/codes.ts'));
      context
        .expect((await statusContract(root)).join('\n'))
        .toContain('src/generated/codes.ts: generated file is missing');

      writeFileSync(path, '[]');
      context.expect((await statusContract(root)).join('\n')).toContain('version');
      writeFileSync(path, JSON.stringify({ version: '1.2.3', generated: [] }));
      context
        .expect((await statusContract(root)).join('\n'))
        .toContain('missing generated src/generated/codes.ts');
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-005',
  'generator-output',
  [
    'generated-location',
    'types-zero-runtime',
    'operations-minimal',
    'meta-from-contract',
    'codes-table-matches',
  ],
  async (context, check) => {
    const generated = await generateContractFiles(validContract, conventionsFor(validContract));
    await check('generated-location', () => {
      context
        .expect(Object.keys(generated).sort())
        .toEqual([
          'src/generated/codes.ts',
          'src/generated/operations.ts',
          'src/generated/schema.d.ts',
        ]);
    });
    await check('types-zero-runtime', () => {
      context.expect(generated['src/generated/schema.d.ts']).toContain('export interface');
      context.expect(generated['src/generated/schema.d.ts']).not.toMatch(/\bconst\b|\bfunction\b/);
    });
    await check('operations-minimal', () => {
      const operations = generated['src/generated/operations.ts']!;
      context.expect(operations).toContain('createTrade');
      context.expect(operations).not.toContain('Create a trade');
      context.expect(operations).not.toContain('x-fixture');
    });
    await check('meta-from-contract', () => {
      const operations = generated['src/generated/operations.ts']!;
      context.expect(operations).toContain('"INVALID_REQUEST"');
      context.expect(operations).toContain('"TRADE_CONFLICT"');
      context.expect(operations).toContain('implemented: true');
      context.expect(operations).toContain('security: []');
    });
    await check('codes-table-matches', () => {
      const codes = generated['src/generated/codes.ts']!;
      context.expect(codes).toContain('OK: 0');
      context.expect(codes).toContain('INVALID_REQUEST: 40001');
      context.expect(codes).toContain('TRADE_CONFLICT: 40901');
    });
  },
);

test('missing sync source is rejected without writing the lock', async () => {
  const root = fixture();
  const result = await runApiContractCli(['sync'], root);
  expect(result.exitCode).not.toBe(0);
  expect(result.issues.join('\n')).toContain('source');
  expect(() => readFileSync(join(root, 'packages/openapi/contracts/sample.lock.json'))).toThrow();
});
