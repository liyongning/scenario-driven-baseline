import { join } from 'node:path';
import { afterAll, test, type TestContext } from 'vitest';
import type {} from '../vitest.d.ts';
import { createControlledRoot } from '../../tests/tooling/controlled-root.ts';
import {
  bindingNameOfCase,
  defineCase,
  validateCaseBinding,
  type CaseBinding,
} from './define-case.ts';

const fixture = createControlledRoot({
  manifest: {
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
        directory: 'protocol-a',
        name: '@sample/protocol-a',
        role: 'protocol',
        protocolKind: 'idl',
        private: false,
        allowedDirectories: ['src', 'testing'],
      },
      {
        directory: 'product-b',
        name: '@sample/product-b',
        role: 'product',
        form: 'web-app',
        private: true,
        allowedDirectories: ['src'],
      },
      {
        directory: 'protocol-b',
        name: '@sample/protocol-b',
        role: 'protocol',
        protocolKind: 'openapi',
        private: false,
        allowedDirectories: ['src', 'testing', 'contracts'],
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
      },
    ],
    bindings: [
      { name: 'b1', product: 'product', protocol: 'protocol-a', platforms: ['p1'] },
      {
        name: 'b2',
        product: 'product-b',
        protocol: 'protocol-b',
        platforms: ['p2'],
      },
    ],
    requiredCommands: ['check:fast'],
    testProjects: [
      { name: 'test-tools-unit', class: 'unit', config: 'packages/e2e/vitest.config.unit.ts' },
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
  },
  prefix: 'define-case-binding-',
});

afterAll(() => fixture.cleanup());

const base: CaseBinding = {
  ownerId: 'SCN-SAMPLE-CONTRACT-001',
  caseId: 'case',
  environment: 'integration',
  fixtureCase: 'case',
  covers: [{ id: 'SCN-SAMPLE-CONTRACT-001', caseKey: 'case', checks: ['result'] }],
};

const file = (relative: string) => join(fixture.root, 'packages/e2e/tests', relative);

async function evidence(
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `SCN-SCENARIO-GATE-029 ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: 'SCN-SCENARIO-GATE-029',
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: 'SCN-SCENARIO-GATE-029', caseKey: caseId, checks }],
        },
      },
    },
    async (context: TestContext) => {
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
  'case-binding-rules',
  [
    'binding-precedence',
    'environment-within-binding',
    'unbound-integration-only',
    'runtime-rejection',
  ],
  async (context, check) => {
    const manifest = JSON.parse(
      await import('node:fs').then(({ readFileSync }) =>
        readFileSync(join(fixture.root, 'project.manifest.json'), 'utf8'),
      ),
    ) as Parameters<typeof bindingNameOfCase>[1];

    await check('binding-precedence', () => {
      context
        .expect(bindingNameOfCase(base, manifest, fixture.root, file('b1/case.spec.ts')))
        .toBe('b1');
      context
        .expect(
          bindingNameOfCase(
            { ...base, binding: 'b2' },
            manifest,
            fixture.root,
            file('b1/case.spec.ts'),
          ),
        )
        .toBe('b2');
      context
        .expect(bindingNameOfCase(base, manifest, fixture.root, file('tooling/case.spec.ts')))
        .toBeUndefined();
    });

    await check('environment-within-binding', () => {
      context
        .expect(
          validateCaseBinding(base, {
            root: fixture.root,
            testFile: file('b1/case.spec.ts'),
          }),
        )
        .toEqual([]);
      context
        .expect(
          validateCaseBinding(
            { ...base, environment: 'p1' },
            { root: fixture.root, testFile: file('b1/case.spec.ts') },
          ),
        )
        .toEqual([]);
      context
        .expect(
          validateCaseBinding(
            { ...base, environment: 'p2' },
            { root: fixture.root, testFile: file('b1/case.spec.ts') },
          ).join('\n'),
        )
        .toContain('environment p2 is not in binding b1');
      context
        .expect(
          validateCaseBinding(
            { ...base, binding: 'b2', environment: 'p2' },
            { root: fixture.root, testFile: file('b1/case.spec.ts') },
          ),
        )
        .toEqual([]);
    });

    await check('unbound-integration-only', () => {
      context
        .expect(
          validateCaseBinding(base, {
            root: fixture.root,
            testFile: file('tooling/case.spec.ts'),
          }),
        )
        .toEqual([]);
      context
        .expect(
          validateCaseBinding(
            { ...base, environment: 'p1' },
            { root: fixture.root, testFile: file('tooling/case.spec.ts') },
          ).join('\n'),
        )
        .toContain('case case environment p1 is platform but case is not bound');
    });

    await check('runtime-rejection', () => {
      context
        .expect(() => defineCase({ ...base, binding: 'missing' }, () => undefined))
        .toThrow(/case case binding missing is not registered/);
      const invalid = validateCaseBinding(
        { ...base, binding: 'b2', environment: 'p1' },
        { root: fixture.root, testFile: file('b1/case.spec.ts') },
      );
      context.expect(invalid.join('\n')).toContain('case case environment p1 is not in binding b2');
      context
        .expect(
          validateCaseBinding(
            { ...base, binding: 'missing' },
            { root: fixture.root, testFile: file('tooling/case.spec.ts') },
          ).join('\n'),
        )
        .toContain('binding missing is not registered');
    });
  },
);
