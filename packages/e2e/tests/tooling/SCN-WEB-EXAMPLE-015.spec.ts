// @SCN-WEB-EXAMPLE-015: 产品契约与协议约定替换后通用基线仍全绿。
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, vi, type TestContext } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { expectedMissingBindings, type InventoryOutput } from './removal-expected.ts';
import {
  git,
  markerFiles,
  parseInventory,
  removeWhitelistedPaths,
  run,
  stripMarkedFragments,
  syncCoverageExclusions,
  writeLog,
  type RemovalFixture,
} from './removal-support.ts';
import { createRepositoryCopy, workspaceRealpath, type RepositoryCopy } from './repository-copy.ts';

vi.setConfig({ testTimeout: 900_000 });

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const ownerFixtureRoot = join(fixtureRoot, 'SCN-WEB-EXAMPLE-015');
const replacementRoot = join(ownerFixtureRoot, 'replacement');
const matrixFixture = 'packages/e2e/tests/fixtures/SCN-OPENAPI-CONTRACT-021/openapi-matrix.json';

type Expect = TestContext['expect'];
type Evidence = Readonly<{
  copy: RepositoryCopy;
  validateStatus: number | null;
  statusStatus: number | null;
  validateOutput: string;
  statusOutput: string;
  fastStatus: number | null;
  fastOutput: string;
  fastLog: string;
  inventoryStatus: number | null;
  inventory: InventoryOutput;
  inventoryLog: string;
  changed: ReadonlyArray<string>;
  removed: ReadonlyArray<string>;
  markerFiles: ReadonlyArray<string>;
}>;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceProductContract(copy: RepositoryCopy): void {
  const contractFile = 'packages/openapi/contracts/accounts-v2.yaml';
  const lockFile = 'packages/openapi/contracts/accounts-v2.lock.json';
  copyFileSync(join(replacementRoot, 'contracts/accounts-v2.yaml'), join(copy.root, contractFile));
  copyFileSync(
    join(replacementRoot, 'contracts/conventions.ts'),
    join(copy.root, 'packages/openapi/contracts/conventions.ts'),
  );
  copyFileSync(
    join(replacementRoot, 'contracts/conventions.test.ts'),
    join(copy.root, 'packages/openapi/contracts/conventions.test.ts'),
  );
  cpSync(
    join(replacementRoot, 'dataset/player-api-primary'),
    join(copy.root, 'packages/e2e/tests/fixtures/_datasets/player-api-primary'),
    { recursive: true },
  );

  const manifest = readJson(join(copy.root, 'project.manifest.json')) as {
    packages: Array<Record<string, unknown>>;
    fingerprints: { protocolInputs: string[] };
  };
  const openapi = manifest.packages.find((pkg) => pkg.directory === 'openapi');
  if (!openapi) throw new Error('replacement copy has no openapi package');
  const previous = openapi.contract as { file: string; lock: string };
  openapi.contract = { file: contractFile, lock: lockFile };
  manifest.fingerprints.protocolInputs = [
    ...manifest.fingerprints.protocolInputs.filter(
      (path) => path !== previous.file && path !== previous.lock,
    ),
    contractFile,
    lockFile,
  ];
  writeJson(join(copy.root, 'project.manifest.json'), manifest);

  const webConfigPath = join(copy.root, 'packages/e2e/host/web.config.json');
  const webConfig = readJson(webConfigPath);
  webConfig.defaultDataset = 'player-api-primary';
  writeJson(webConfigPath, webConfig);

  const sync = run(copy, 'pnpm', ['api:sync', contractFile]);
  if (sync.status !== 0) throw new Error(`api:sync failed: ${sync.output}`);
}

function removeWebExample(copy: RepositoryCopy, removal: RemovalFixture['removal']) {
  const marked = markerFiles(copy.root, 'web-example');
  for (const path of marked) {
    const absolute = join(copy.root, path);
    const stripped = stripMarkedFragments(path, readFileSync(absolute, 'utf8'), 'web-example');
    writeFileSync(absolute, stripped.text);
  }
  return { marked, removed: removeWhitelistedPaths(copy.root, removal) };
}

function addReplacementDeclaration(copy: RepositoryCopy): void {
  const declarationPath = join(copy.root, 'packages/web/src/app/consumed-operations.ts');
  writeFileSync(
    declarationPath,
    [
      "import { retrieveAccount } from '@daqian/template-openapi/generated/operations';",
      '',
      'type RequestPolicy = Readonly<{ cases: ReadonlyArray<string>; authority: string }>;',
      'type ConsumedOperation = Readonly<{',
      '  method: unknown;',
      '  requestFields: Readonly<Record<string, RequestPolicy>>;',
      '}>;',
      '',
      '/** Replacement product declaration for the neutral account contract. */',
      'export const consumedOperations: ReadonlyArray<ConsumedOperation> = [',
      '  {',
      '    method: retrieveAccount,',
      '    requestFields: {',
      "      'path.account_ref': { cases: ['mapped-value'], authority: 'replacement-fixture' },",
      "      'header.X-Request-Id': { cases: ['generated-value'], authority: 'openapi-client' },",
      '    },',
      '  },',
      '];',
      '',
    ].join('\n'),
  );

  const clientPath = join(copy.root, 'packages/web/src/account-client.ts');
  writeFileSync(
    clientPath,
    [
      "import { retrieveAccount } from '@daqian/template-openapi/generated/operations';",
      "import type { RestClient } from '@daqian/template-openapi';",
      '',
      '/** Replacement product call used by WEX-09 to prove declarations and calls derive from the new contract. */',
      'export function retrieveAccountByRef(client: RestClient, accountRef: string) {',
      '  return client.request(retrieveAccount, { path: { account_ref: accountRef } });',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(copy.root, 'packages/web/src/account-client.test.ts'),
    [
      "import { expect, test, vi } from 'vitest';",
      "import { retrieveAccount } from '@daqian/template-openapi/generated/operations';",
      "import { retrieveAccountByRef } from './account-client.ts';",
      '',
      "test('replacement product client calls the declared account operation', async () => {",
      "  const request = vi.fn().mockResolvedValue({ kind: 'success', data: { account_ref: 'A-1' } });",
      "  await expect(retrieveAccountByRef({ request } as never, 'A-1')).resolves.toEqual({",
      "    kind: 'success',",
      "    data: { account_ref: 'A-1' },",
      '  });',
      "  expect(request).toHaveBeenCalledWith(retrieveAccount, { path: { account_ref: 'A-1' } });",
      '});',
      '',
    ].join('\n'),
  );
}

function installReplacementMatrix(copy: RepositoryCopy): void {
  const target = join(copy.root, matrixFixture);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(replacementRoot, 'matrix/openapi-matrix.json'), target);
  const refresh = run(copy, 'pnpm', ['fixtures:refresh', 'SCN-OPENAPI-CONTRACT-021']);
  if (refresh.status !== 0) throw new Error(`fixtures:refresh failed: ${refresh.output}`);
}

async function runReplacement(): Promise<Evidence> {
  const fixture = JSON.parse(
    readFileSync(join(ownerFixtureRoot, 'web-example-removal.json'), 'utf8'),
  ) as RemovalFixture;
  const copy = createRepositoryCopy({ prefix: 'web-example-015-' });
  try {
    const baselineFormat = run(copy, 'pnpm', ['format']);
    if (baselineFormat.status !== 0) throw new Error(`format failed: ${baselineFormat.output}`);
    git(copy.root, ['add', '-A']);
    if (git(copy.root, ['status', '--porcelain']) !== '')
      git(copy.root, [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '-m',
        'copy: archive scoped change',
      ]);

    replaceProductContract(copy);
    const validate = run(copy, 'pnpm', ['api:validate']);
    const status = run(copy, 'pnpm', ['api:status']);
    const removedExample = removeWebExample(copy, fixture.removal);
    syncCoverageExclusions(copy.root);
    addReplacementDeclaration(copy);
    installReplacementMatrix(copy);

    const formatted = run(copy, 'pnpm', ['format']);
    if (formatted.status !== 0) throw new Error(`format failed: ${formatted.output}`);
    git(copy.root, ['add', '-A']);
    const changed = git(copy.root, ['diff', '--cached', '--name-only', 'HEAD'])
      .split('\n')
      .filter(Boolean);

    const fast = run(copy, 'pnpm', ['check:fast']);
    const fastLog = writeLog('wex-015-copy-check-fast.log', fast.output);
    if (fast.status !== 0)
      throw new Error(
        `副本内 check:fast 退出码 ${fast.status}（日志 ${fastLog}）：\n${fast.output.slice(-8000)}`,
      );
    const inventoryRun = run(copy, 'pnpm', ['check:scenarios', '--inventory']);
    const inventoryLog = writeLog('wex-015-copy-inventory.log', inventoryRun.output);
    const inventory = parseInventory(inventoryRun.output);
    return {
      copy,
      validateStatus: validate.status,
      statusStatus: status.status,
      validateOutput: validate.output,
      statusOutput: status.output,
      fastStatus: fast.status,
      fastOutput: fast.output,
      fastLog,
      inventoryStatus: inventoryRun.status,
      inventory,
      inventoryLog,
      changed,
      removed: removedExample.removed,
      markerFiles: removedExample.marked,
    };
  } catch (error) {
    copy.cleanup();
    throw error;
  }
}

let pending: Promise<Evidence> | undefined;
function evidence(): Promise<Evidence> {
  pending ??= runReplacement();
  return pending;
}

afterAll(async () => {
  const value = await pending;
  value?.copy.cleanup();
});

function assertReplacement(value: Evidence, expect: Expect): void {
  expect(value.validateStatus, value.validateOutput).toBe(0);
  expect(value.statusStatus, value.statusOutput).toBe(0);
}

function assertBaseline(value: Evidence, expect: Expect): void {
  expect(value.fastStatus, `${value.fastLog}\n${value.fastOutput.slice(-8000)}`).toBe(0);
  const expectedIssues = expectedMissingBindings(value.copy, value.inventory);
  expect(value.inventoryStatus).toBe(expectedIssues.length > 0 ? 1 : 0);
  expect([...new Set(value.inventory.issues)].sort()).toEqual(expectedIssues);
  expect(
    value.inventory.issues.some(
      (issue) =>
        issue.includes('retrieveAccount') && !issue.includes('missing binding for browser'),
    ),
  ).toBe(false);
}

function assertEngineUntouched(value: Evidence, expect: Expect): void {
  const removed = (path: string) =>
    value.removed.some((item) => path === item || path.startsWith(`${item}/`));
  const marker = (path: string) => value.markerFiles.includes(path);
  const allowed = new Set([
    'packages/openapi/contracts/accounts-v2.yaml',
    'packages/openapi/contracts/accounts-v2.lock.json',
    'packages/openapi/contracts/conventions.ts',
    'packages/openapi/contracts/conventions.test.ts',
    'packages/openapi/src/generated/schema.d.ts',
    'packages/openapi/src/generated/operations.ts',
    'packages/openapi/src/generated/codes.ts',
    'packages/openapi/testing/contract.bundle.json',
    'packages/e2e/host/web.config.json',
    'packages/e2e/tests/fixtures/_datasets/player-api-primary/manifest.json',
    'packages/web/src/account-client.ts',
    'packages/web/src/account-client.test.ts',
    matrixFixture,
    'packages/e2e/tests/fixtures/SCN-OPENAPI-CONTRACT-021/manifest.json',
    'project.manifest.json',
  ]);
  expect(
    value.changed.filter((path) => !removed(path) && !marker(path) && !allowed.has(path)),
  ).toEqual([]);
  expect(
    value.changed.filter(
      (path) =>
        !removed(path) &&
        !marker(path) &&
        (path.startsWith('packages/openapi/testing/engine/') ||
          path.startsWith('packages/e2e/tests/protocol/') ||
          path.startsWith('scripts/')),
    ),
  ).toEqual([]);
  expect(workspaceRealpath(value.copy.root).startsWith(realpathSync(value.copy.root))).toBe(true);
  expect(existsSync(join(value.copy.root, 'packages/web/src/trade-create'))).toBe(false);
  expect(existsSync(join(value.copy.root, 'openspec/specs/web-example'))).toBe(false);
}

defineCase(
  {
    ownerId: 'SCN-WEB-EXAMPLE-015',
    caseId: 'product-contract-replacement',
    fixtureCase: 'product-contract-replacement',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-WEB-EXAMPLE-015',
        caseKey: 'product-contract-replacement',
        checks: [
          'replace-contract-and-conventions',
          'baseline-green-after-replace',
          'engine-untouched',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const value = await evidence();
    await checkpoint('replace-contract-and-conventions', () => assertReplacement(value, expect));
    await checkpoint('baseline-green-after-replace', () => assertBaseline(value, expect));
    await checkpoint('engine-untouched', () => assertEngineUntouched(value, expect));
  },
  { fixtureRoot, timeoutMs: 900_000 },
);
