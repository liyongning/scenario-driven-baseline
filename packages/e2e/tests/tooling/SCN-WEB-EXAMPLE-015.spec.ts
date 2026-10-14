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
  previewRouteStatus: number | null;
  previewRouteOutput: string;
  productHookStatus: number | null;
  productHookOutput: string;
  changed: ReadonlyArray<string>;
  removed: ReadonlyArray<string>;
  markerFiles: ReadonlyArray<string>;
}>;

type PreviewRouteEvidence = Readonly<{
  datasetName: string;
  productOperation: Readonly<{ id: string; method: string; path: string }>;
  route: Readonly<{ methodName: string; httpMethod: string; path: string }>;
  engineHasOperation: boolean;
}>;

type ProductHookEvidence = Readonly<{
  operationId: string;
  status: number;
  adapterIssueCount: number;
  unnormalizedIssueCount: number;
}>;

function resultJson<T>(output: string): T {
  const line = output.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
  if (!line) throw new Error(`命令没有输出 RESULT 证据：${output}`);
  return JSON.parse(line.slice('RESULT:'.length)) as T;
}

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

function checkPreviewStartup(copy: RepositoryCopy) {
  return run(copy, 'pnpm', [
    'exec',
    'tsx',
    '--eval',
    [
      "import { startLocalPreview } from './packages/e2e/src/preview/preview-launcher.ts';",
      "import { previewRoutes } from './scripts/preview-local.ts';",
      "import { engineContract, productContract } from './packages/openapi/testing/contract.ts';",
      '(async () => {',
      "  const productOperation = productContract().operations.find((operation) => operation.id === 'retrieveAccount');",
      "  const engineHasOperation = engineContract.operations.some((operation) => operation.id === 'retrieveAccount');",
      "  if (!productOperation || engineHasOperation) throw new Error('replacement operation is not exclusively owned by the product contract');",
      '  const routes = await previewRoutes(process.cwd());',
      "  const route = routes.find((item) => item.methodName === 'retrieveAccount');",
      "  if (!route) throw new Error('retrieveAccount route is missing');",
      "  if (route.httpMethod !== productOperation.method || route.path !== productOperation.path) throw new Error('preview route does not match the product contract');",
      '  const preview = await startLocalPreview({ root: process.cwd(), routes });',
      "  try { console.log('RESULT:' + JSON.stringify({ datasetName: preview.datasetName, productOperation: { id: productOperation.id, method: productOperation.method, path: productOperation.path }, route: { methodName: route.methodName, httpMethod: route.httpMethod, path: route.path }, engineHasOperation })); }",
      '  finally { await preview.close(); }',
      '})();',
    ].join('\n'),
  ]);
}

function checkProductHook(copy: RepositoryCopy) {
  return run(copy, 'pnpm', [
    'exec',
    'tsx',
    '--eval',
    [
      "import { readFileSync } from 'node:fs';",
      "import { productContract } from './packages/openapi/testing/contract.ts';",
      "import { createResponseValidator } from './packages/openapi/testing/schema.ts';",
      "import { loadProjectManifest } from './scripts/lib/project-manifest.ts';",
      "import { loadProtocolAdapter } from './scripts/lib/protocol-adapters.ts';",
      '(async () => {',
      "  const dataset = JSON.parse(readFileSync('packages/e2e/tests/fixtures/_datasets/player-api-primary/manifest.json', 'utf8'));",
      "  const entry = dataset.entries.find((item) => item.operationId === 'retrieveAccount');",
      "  if (!entry) throw new Error('replacement dataset is missing retrieveAccount');",
      '  const response = entry.responses.find((item) => (item.status ?? 200) === 200);',
      "  if (!response) throw new Error('replacement dataset is missing the success response');",
      "  const adapter = await loadProtocolAdapter(loadProjectManifest(process.cwd()), 'openapi', { root: process.cwd() });",
      "  const validator = adapter.responseValidator('retrieveAccount', { manifest: dataset });",
      "  if (!validator) throw new Error('product adapter cannot resolve retrieveAccount');",
      '  const adapterIssues = validator(response.body, 200);',
      "  const operation = productContract().operations.find((item) => item.id === 'retrieveAccount');",
      "  if (!operation) throw new Error('product contract is missing retrieveAccount');",
      '  const unnormalizedIssues = createResponseValidator(operation)(response.body, 200);',
      "  if (adapterIssues.length > 0) throw new Error('product adapter rejected fixture: ' + adapterIssues.join('; '));",
      "  if (unnormalizedIssues.length === 0) throw new Error('without the product hook the fixture unexpectedly passed');",
      "  console.log('RESULT:' + JSON.stringify({ operationId: entry.operationId, status: response.status ?? 200, adapterIssueCount: adapterIssues.length, unnormalizedIssueCount: unnormalizedIssues.length }));",
      '})();',
    ].join('\n'),
  ]);
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
    const previewStartup = checkPreviewStartup(copy);
    const productHook = checkProductHook(copy);

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
      previewRouteStatus: previewStartup.status,
      previewRouteOutput: previewStartup.output,
      productHookStatus: productHook.status,
      productHookOutput: productHook.output,
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

function assertPreviewFromProduct(value: Evidence, expect: Expect): void {
  expect(value.previewRouteStatus, value.previewRouteOutput).toBe(0);
  const result = resultJson<PreviewRouteEvidence>(value.previewRouteOutput);
  expect(result).toEqual({
    datasetName: 'player-api-primary',
    productOperation: {
      id: 'retrieveAccount',
      method: 'get',
      path: '/api/v2/accounts/{account_ref}',
    },
    route: {
      methodName: 'retrieveAccount',
      httpMethod: 'get',
      path: '/api/v2/accounts/{account_ref}',
    },
    engineHasOperation: false,
  });
}

function assertProductHookApplied(value: Evidence, expect: Expect): void {
  expect(value.productHookStatus, value.productHookOutput).toBe(0);
  const result = resultJson<ProductHookEvidence>(value.productHookOutput);
  expect(result.operationId).toBe('retrieveAccount');
  expect(result.status).toBe(200);
  expect(result.adapterIssueCount).toBe(0);
  expect(result.unnormalizedIssueCount).toBeGreaterThan(0);
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
          'preview-from-product',
          'product-hook-applied',
          'baseline-green-after-replace',
          'engine-untouched',
        ],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const value = await evidence();
    await checkpoint('replace-contract-and-conventions', () => assertReplacement(value, expect));
    await checkpoint('preview-from-product', () => assertPreviewFromProduct(value, expect));
    await checkpoint('product-hook-applied', () => assertProductHookApplied(value, expect));
    await checkpoint('baseline-green-after-replace', () => assertBaseline(value, expect));
    await checkpoint('engine-untouched', () => assertEngineUntouched(value, expect));
  },
  { fixtureRoot, timeoutMs: 900_000 },
);
