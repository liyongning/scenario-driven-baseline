import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanCaseBindings } from '../../../../scripts/lib/affected-bindings.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';
import { createControlledRoot } from './controlled-root.ts';
import { defineCase } from '../../src/cases/define-case.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const vitest = resolve(repositoryRoot, 'node_modules/.bin/vitest');
const defineCaseUrl = pathToFileURL(
  resolve(repositoryRoot, 'packages/e2e/src/cases/define-case.ts'),
).href;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const childManifest = {
  packages: [
    {
      directory: 'product-a',
      name: '@sample/product-a',
      role: 'product',
      form: 'sdk',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'product-b',
      name: '@sample/product-b',
      role: 'product',
      form: 'web-app',
      private: true,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
    },
    {
      directory: 'protocol-a',
      name: '@sample/protocol-a',
      role: 'protocol',
      protocolKind: 'idl',
      private: false,
      allowedDirectories: ['src', 'testing'],
      moduleRoots: ['src', 'testing'],
    },
    {
      directory: 'protocol-b',
      name: '@sample/protocol-b',
      role: 'protocol',
      protocolKind: 'openapi',
      private: false,
      allowedDirectories: ['src', 'testing', 'contracts'],
      moduleRoots: ['src', 'testing'],
      contract: {
        file: 'packages/protocol-b/contracts/openapi.yaml',
        lock: 'packages/protocol-b/contracts/openapi.lock.json',
      },
    },
    {
      directory: 'e2e',
      name: '@sample/e2e',
      role: 'test',
      private: true,
      allowedDirectories: ['src', 'tests'],
      moduleRoots: ['src', 'tests'],
    },
  ],
  bindings: [
    { name: 'b1', product: 'product-a', protocol: 'protocol-a', platforms: ['p1'] },
    { name: 'b2', product: 'product-b', protocol: 'protocol-b', platforms: ['p2'] },
  ],
  requiredCommands: ['check:fast'],
  testProjects: [
    { name: 'unit', class: 'unit', config: 'packages/e2e/vitest.config.unit.ts' },
    { name: 'integration', class: 'integration', config: 'packages/e2e/vitest.config.ts' },
    { name: 'p1', class: 'platform', config: 'packages/e2e/vitest.config.p1.ts' },
    { name: 'p2', class: 'platform', config: 'packages/e2e/vitest.config.p2.ts' },
  ],
  fingerprints: {
    sourceRoots: ['scripts'],
    buildInputs: [],
    protocolInputs: [
      'proto-gen.lock',
      'packages/protocol-b/contracts/openapi.yaml',
      'packages/protocol-b/contracts/openapi.lock.json',
    ],
  },
  quality: { coverageExclusions: [], maxLinesExemptions: [] },
};

function childCaseSource(options: { environment: string; binding: string }): string {
  return [
    `import { defineCase } from '${defineCaseUrl}';`,
    '',
    'defineCase(',
    '  {',
    "    ownerId: 'SCN-SAMPLE-CONTRACT-001',",
    "    caseId: 'runtime-binding',",
    "    fixtureCase: 'result',",
    `    environment: '${options.environment}',`,
    `    binding: '${options.binding}',`,
    "    covers: [{ id: 'SCN-SAMPLE-CONTRACT-001', caseKey: 'result', checks: ['result'] }],",
    '  },',
    '  async ({ checkpoint, expect }) => {',
    "    await checkpoint('result', () => expect(true).toBe(true));",
    '  },',
    ');',
  ].join('\n');
}

function runChild(options: { environment: string; binding: string }) {
  const root = createControlledRoot({
    manifest: childManifest,
    files: { 'runtime-binding.spec.ts': childCaseSource(options) },
    prefix: 'case-binding-runtime-',
  });
  try {
    const fixtureDirectory = join(root.root, 'packages/e2e/tests/fixtures/SCN-SAMPLE-CONTRACT-001');
    const fixtureText = '{"ok":true}';
    mkdirSync(fixtureDirectory, { recursive: true });
    writeFileSync(join(fixtureDirectory, 'result.json'), fixtureText);
    writeFileSync(
      join(fixtureDirectory, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        ownerId: 'SCN-SAMPLE-CONTRACT-001',
        sources: { spec: { requirementDigest: '0'.repeat(64) } },
        cases: { result: 'result.json' },
        sha256: { 'result.json': sha(fixtureText) },
      }),
    );
    const environment = { ...process.env };
    delete environment.SCENARIO_GATE_CHANGES;
    const result = spawnSync(vitest, ['run', '--root', root.root, 'runtime-binding.spec.ts'], {
      cwd: root.root,
      env: environment,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    root.cleanup();
  }
}

defineCase(
  {
    ownerId: 'SCN-SCENARIO-GATE-029',
    caseId: 'case-binding-cli',
    fixtureCase: 'case-binding-cli',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-SCENARIO-GATE-029',
        caseKey: 'case-binding-cli',
        checks: ['environment-within-binding', 'runtime-rejection', 'template-case-bindings'],
      },
    ],
  },
  async ({ fixture, checkpoint, expect }) => {
    const data = fixture as { bindings: string[] };

    await checkpoint('environment-within-binding', () => {
      expect(data.bindings).toEqual(['b1', 'b2']);
      const accepted = runChild({ environment: 'p2', binding: 'b2' });
      expect(accepted.status, accepted.output).toBe(0);
      const rejected = runChild({ environment: 'p1', binding: 'b2' });
      expect(rejected.status).not.toBe(0);
      expect(rejected.output).toContain('case runtime-binding environment p1 is not in binding b2');
    });

    await checkpoint('runtime-rejection', () => {
      const rejected = runChild({ environment: 'integration', binding: 'missing' });
      expect(rejected.status).not.toBe(0);
      expect(rejected.output).toContain('case runtime-binding binding missing is not registered');
      expect(rejected.output).toContain('runtime-binding');
    });

    await checkpoint('template-case-bindings', () => {
      const manifest = loadProjectManifest(repositoryRoot);
      const idlBinding = manifest.bindings.find((binding) => binding.name === 'sdk-idl-weapp');
      expect(idlBinding).toBeDefined();
      const cases = scanCaseBindings(repositoryRoot, manifest);
      const idlCases = cases.filter((item) => {
        const manifestPath = join(
          repositoryRoot,
          'packages/e2e/tests/fixtures',
          item.ownerId,
          'manifest.json',
        );
        if (!existsSync(manifestPath)) return false;
        const fixtureManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          protocol?: string;
        };
        return fixtureManifest.protocol === idlBinding!.protocol;
      });
      expect(idlCases.length).toBeGreaterThan(0);
      expect(idlCases.filter((item) => item.binding !== idlBinding!.name)).toEqual([]);
      const webCases = cases.filter((item) => item.file.includes('/tests/web-openapi-browser/'));
      if (manifest.bindings.some((binding) => binding.name === 'web-openapi-browser'))
        expect(webCases.filter((item) => item.binding !== 'web-openapi-browser')).toEqual([]);
      else expect(webCases.every((item) => item.binding === undefined)).toBe(true);
    });
  },
  { timeoutMs: 30_000 },
);
