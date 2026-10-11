import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { collectFiles } from '../../../../scripts/lib/fingerprints.ts';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';

export type AdapterProtocol = 'a' | 'b';

export type AdapterFixtureOptions = Readonly<{
  manifest?: unknown;
  missingAdapter?: AdapterProtocol;
  missingMethod?: AdapterProtocol;
  namedAdapter?: AdapterProtocol;
  files?: Readonly<Record<string, string>>;
  prefix?: string;
}>;

export type AdapterFixture = Readonly<{
  root: string;
  logPath: string;
  manifest: ReturnType<typeof adapterFixtureManifest>;
  cleanup: () => void;
}>;

export const adapterFixtureManifest = () => ({
  packages: [
    {
      directory: 'product-a',
      name: '@sample/product-a',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
      consumedOperations: ['packages/product-a/src/consumed-operations.ts'],
    },
    {
      directory: 'product-b',
      name: '@sample/product-b',
      role: 'product',
      form: 'web-app',
      private: true,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
      consumedOperations: ['packages/product-b/src/consumed-operations.ts'],
    },
    {
      directory: 'protocol-a',
      name: '@sample/protocol-a',
      role: 'protocol',
      protocolKind: 'idl',
      checks: ['proto:validate'],
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'protocol-b',
      name: '@sample/protocol-b',
      role: 'protocol',
      protocolKind: 'openapi',
      checks: ['api:validate'],
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'e2e',
      name: '@sample/e2e',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'tests', 'host'],
      moduleRoots: ['src', 'tests', 'host'],
    },
  ],
  bindings: [
    {
      name: 'binding-a',
      product: 'product-a',
      protocol: 'protocol-a',
      platforms: ['platform-a'],
    },
    {
      name: 'binding-b',
      product: 'product-b',
      protocol: 'protocol-b',
      platforms: ['platform-b'],
    },
  ],
  requiredCommands: ['check:fast', 'proto:validate', 'api:validate'],
  testProjects: [
    {
      name: 'test-tools-unit',
      class: 'unit',
      config: 'packages/e2e/vitest.config.unit.ts',
    },
    {
      name: 'integration',
      class: 'integration',
      config: 'packages/e2e/vitest.config.integration.ts',
    },
    {
      name: 'platform-a',
      class: 'platform',
      config: 'packages/e2e/vitest.config.platform-a.ts',
    },
    {
      name: 'platform-b',
      class: 'platform',
      config: 'packages/e2e/vitest.config.platform-b.ts',
    },
  ],
  fingerprints: {
    sourceRoots: ['scripts'],
    buildInputs: [],
    protocolInputs: ['proto-gen.lock'],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
});

function stubAdapterSource(
  protocol: AdapterProtocol,
  logPath: string,
  options: Readonly<{ missingMethod?: boolean; namedExport?: boolean }> = {},
) {
  const method = options.missingMethod
    ? ''
    : [
        `  scanCalls(input) {`,
        `    record('scanCalls', { protocol, sourceFiles: input.sourceFiles.length });`,
        `    return [{ method: '${protocol}-op', position: 'packages/product-${protocol}/src/call.ts' }];`,
        '  },',
      ].join('\n');
  return [
    "import { appendFileSync, readFileSync } from 'node:fs';",
    `const protocol = '${protocol}';`,
    `const logPath = ${JSON.stringify(logPath)};`,
    `const controlPath = ${JSON.stringify(join(logPath, '..', 'adapter-control.json'))};`,
    '',
    'function record(name, detail = {}) {',
    '  appendFileSync(logPath, `${JSON.stringify({ protocol, name, detail })}\\n`);',
    '}',
    'function control() {',
    "  try { return JSON.parse(readFileSync(controlPath, 'utf8')); } catch { return {}; }",
    '}',
    options.namedExport ? 'export const adapter = {' : 'export default {',
    '  resolveDeclaration(input) {',
    "    record('resolveDeclaration', { position: input.position });",
    '    return {',
    '      key: `${protocol}-op`,',
    '      prefix: protocol,',
    '      methodName: `${protocol}-op`,',
    "      httpMethod: 'POST',",
    '      path: `/api/${protocol}`,',
    '      requestFields: {},',
    '      position: input.position,',
    '      meta: { protocol },',
    '    };',
    '  },',
    '  deriveObligations(input) {',
    "    record('deriveObligations', { operation: Boolean(input.operation) });",
    '    if (!input.operation) return {',
    "      obligations: [{ id: `${protocol}.error-contract#business-error#$`, cases: ['error'], requiredIn: [...input.integrationOnly] }],",
    '      discoveries: [],',
    '    };',
    '    return {',
    '      obligations: [{ id: `${protocol}-op#http-route#$`, cases: [`${protocol}-op`], requiredIn: [...input.requiredIn] }],',
    '      discoveries: [],',
    '    };',
    '  },',
    '  responseValidator(operationId) {',
    "    record('responseValidator', { operationId });",
    "    if (operationId === 'unknown-operation' || operationId.includes(':')) return undefined;",
    '    return (body, status) => {',
    '      const expected = status ?? 200;',
    "      if (!body || typeof body !== 'object' || body.ok !== true || body.status !== expected)",
    '        return [`response does not match ${protocol} shape for status ${expected}`];',
    '      return [];',
    '    };',
    '  },',
    '  checkFixture(manifest) {',
    '    const settings = control();',
    "    const dataset = !('ownerId' in (manifest ?? {}));",
    "    record('checkFixture', { protocol, dataset, name: manifest?.ownerId ?? manifest?.description ?? null });",
    '    if (dataset && settings.failDataset) return [`forced ${protocol} dataset issue`];',
    '    if (!dataset && settings.failFixtureOwner === manifest?.ownerId)',
    '      return [`forced ${protocol} fixture issue`];',
    '    if (dataset && settings.throwDataset) {',
    '      if (settings.throwDatasetAsString) throw `forced ${protocol} dataset error`;',
    '      throw new Error(`forced ${protocol} dataset error`);',
    '    }',
    '    if (!dataset && settings.throwFixtureOwner === manifest?.ownerId) {',
    '      if (settings.throwFixtureOwnerAsString) throw `forced ${protocol} fixture error`;',
    '      throw new Error(`forced ${protocol} fixture error`);',
    '    }',
    '    return [];',
    '  },',
    method,
    '};',
    '',
  ].join('\n');
}

/** 受控双协议根：两个 product 各绑定一个协议桩，调用记录写入根目录外的 JSONL。 */
export function createAdapterFixture(options: AdapterFixtureOptions = {}): AdapterFixture {
  const manifest = (options.manifest ?? adapterFixtureManifest()) as ReturnType<
    typeof adapterFixtureManifest
  >;
  const controlled: ControlledRoot = createControlledRoot({
    manifest,
    protocolAdapters: false,
    files: {
      'scenario-gate.config.json': JSON.stringify({
        scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
        ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
      }),
      'openspec/specs/sample/spec.md': [
        '# Sample Specification',
        '',
        '## Requirements',
        '',
        '### Requirement: SAMPLE-01 contract adapters',
        '',
        '系统 SHALL 按绑定加载协议适配器。',
        '',
        '#### Scenario: SCN-SAMPLE-CONTRACT-001 adapter loading',
        '',
        '- **WHEN** 运行门禁',
        '- **THEN** 使用绑定协议',
        '',
        '```json verification',
        JSON.stringify({
          formatVersion: 2,
          checkpoints: { done: '门禁按绑定加载协议适配器', fixture: 'Fixture 委托协议适配器' },
          cases: [
            { key: 'normal', kind: 'engineering', requiredIn: ['integration'], checks: ['done'] },
          ],
          blockedBy: [],
        }),
        '```',
        '',
        '#### Scenario: SCN-SAMPLE-CONTRACT-002 fixture without protocol',
        '',
        '- **WHEN** Fixture 不声明协议',
        '- **THEN** 不调用协议适配器',
        '',
        '```json verification',
        JSON.stringify({
          formatVersion: 2,
          checkpoints: { fixture: 'Fixture 委托协议适配器' },
          cases: [
            {
              key: 'fixture',
              kind: 'engineering',
              requiredIn: ['integration'],
              checks: ['fixture'],
            },
          ],
          blockedBy: [],
        }),
        '```',
        '',
      ].join('\n'),
      'packages/product-a/src/consumed-operations.ts':
        'export const consumedOperations = [{ method: { name: "a-op" }, requestFields: {} }];\n',
      'packages/product-a/src/call.ts': "export const callA = 'a-op';\n",
      'packages/product-b/src/consumed-operations.ts':
        'export const consumedOperations = [{ method: { name: "b-op" }, requestFields: {} }];\n',
      'packages/product-b/src/call.ts': "export const callB = 'b-op';\n",
      'packages/protocol-a/src/index.ts': 'export {};\n',
      'packages/protocol-b/src/index.ts': 'export {};\n',
      ...(options.files ?? {}),
    },
    prefix: options.prefix ?? 'protocol-adapter-',
  });
  const logPath = join(controlled.root, 'adapter-calls.jsonl');
  for (const protocol of ['a', 'b'] as const) {
    if (
      options.missingAdapter === protocol ||
      !manifest.packages.some((pkg) => pkg.directory === `protocol-${protocol}`)
    )
      continue;
    writeStub(
      join(controlled.root, 'packages', `protocol-${protocol}`, 'testing', 'adapter.ts'),
      stubAdapterSource(protocol, logPath, {
        missingMethod: options.missingMethod === protocol,
        namedExport: options.namedAdapter === protocol,
      }),
    );
  }
  return {
    root: controlled.root,
    logPath,
    manifest,
    cleanup: controlled.cleanup,
  };
}

function writeStub(path: string, source: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, source);
}

export function readAdapterCalls(
  fixture: AdapterFixture,
): Array<{ protocol: AdapterProtocol; name: string; detail: Record<string, unknown> }> {
  try {
    return readFileSync(fixture.logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            protocol: AdapterProtocol;
            name: string;
            detail: Record<string, unknown>;
          },
      );
  } catch {
    return [];
  }
}

/** 扫描门禁非测试源码，拒绝按 `protocolKind` 的取值分支。 */
export function protocolKindBranchOffenders(root: string): string[] {
  const offenders: string[] = [];
  for (const path of collectFiles(
    join(root, 'scripts'),
    (candidate) => candidate.endsWith('.ts') && !candidate.endsWith('.test.ts'),
  )) {
    const source = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const isKind = (node: ts.Node | undefined): boolean =>
      Boolean(
        node &&
        ((ts.isIdentifier(node) && node.text === 'protocolKind') ||
          (ts.isPropertyAccessExpression(node) && node.name.text === 'protocolKind')),
      );
    const hasKind = (node: ts.Node | undefined): boolean => {
      if (!node) return false;
      let found = false;
      const visit = (candidate: ts.Node | undefined) => {
        if (!candidate || found) return;
        if (isKind(candidate)) found = true;
        if (!found) ts.forEachChild(candidate, visit);
      };
      visit(node);
      return found;
    };
    const visit = (node: ts.Node) => {
      const comparedLiteral =
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(node.operatorToken.kind) &&
        [node.left, node.right].some(
          (side) => ts.isStringLiteralLike(side) && ['idl', 'openapi'].includes(side.text),
        ) &&
        [node.left, node.right].some(hasKind);
      const switchesKind = ts.isSwitchStatement(node) && hasKind(node.expression);
      if (comparedLiteral || switchesKind)
        offenders.push(
          `${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return offenders;
}
