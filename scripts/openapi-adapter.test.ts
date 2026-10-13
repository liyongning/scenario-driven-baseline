import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, test, type TestContext } from 'vitest';
import adapter from '../packages/openapi/testing/adapter.ts';
import { derivePresence } from '../packages/openapi/testing/presence.ts';
import { contractName, operationById } from '../packages/openapi/testing/contract.ts';
import type { ProtocolDeclarationInput } from './lib/protocol-adapters.ts';

type Checkpoint = (name: string, assertion: () => void | Promise<void>) => Promise<void>;

function evidence(
  ownerId: string,
  caseId: string,
  checks: string[],
  body: (context: TestContext, checkpoint: Checkpoint) => Promise<void>,
) {
  test(
    `${ownerId} ${caseId}`,
    {
      timeout: 30_000,
      meta: {
        scenarioCase: {
          ownerId,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: ownerId, caseKey: caseId, checks }],
        },
      },
    },
    async (context) => {
      const executed: string[] = [];
      await body(context, async (checkpoint, assertion) => {
        await assertion();
        executed.push(checkpoint);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const generatedRoot = join(repositoryRoot, 'packages/openapi/src/generated');
const generatedOperations = join(generatedRoot, 'operations.ts');
const idlOperations = join(
  repositoryRoot,
  'packages/protocol/src/generated/idl/infra/trade/v1/trade.ts',
);

type ProgramFixture = Readonly<{
  root: string;
  source: string;
  program: ts.Program;
  element: ts.Expression;
}>;

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return current;
}

function declarationName(declaration: ts.VariableDeclaration): string | undefined {
  return ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
}

function programFixture(
  declaration: string,
  options: Readonly<{ product?: boolean }> = {},
): ProgramFixture {
  const root = mkdtempSync(join(tmpdir(), 'openapi-adapter-'));
  const sourceRoot = join(root, options.product ? 'packages/web/src' : 'packages/sdk/src');
  mkdirSync(sourceRoot, { recursive: true });
  const source = join(sourceRoot, 'declarations.ts');
  writeFileSync(source, declaration);
  const program = ts.createProgram([source, generatedOperations, idlOperations], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  });
  const file = program.getSourceFile(source)!;
  const statement = file.statements.find(
    (item): item is ts.VariableStatement =>
      ts.isVariableStatement(item) &&
      item.declarationList.declarations.some(
        (declaration) => declarationName(declaration) === 'consumedOperations',
      ),
  )!;
  const declarationNode = statement.declarationList.declarations.find(
    (declaration) => declarationName(declaration) === 'consumedOperations',
  )!;
  const initializer = unwrapExpression(declarationNode.initializer!);
  const element = ts.isArrayLiteralExpression(initializer)
    ? unwrapExpression(initializer.elements[0] as ts.Expression)
    : initializer;
  return { root, source, program, element };
}

function declarationInput(fixture: ProgramFixture): ProtocolDeclarationInput {
  return {
    element: fixture.element,
    checker: fixture.program.getTypeChecker(),
    program: fixture.program,
    generatedRoot,
    modulePath: fixture.source,
    position: 'fixture.ts',
    issues: [],
  };
}

function validCreateTradeDeclaration(requestFields = '{}') {
  return `import { createTrade } from ${JSON.stringify(generatedOperations)};
export const consumedOperations = [{ method: createTrade, requestFields: ${requestFields} }] as const;`;
}

evidence(
  'SCN-OPENAPI-CONTRACT-015',
  'resolve-declaration-unit',
  ['prefix-from-contract-name', 'illegal-element-rejected'],
  async (context, checkpoint) => {
    const valid = programFixture(validCreateTradeDeclaration());
    try {
      const input = declarationInput(valid);
      const operation = adapter.resolveDeclaration(input);
      await checkpoint('prefix-from-contract-name', () => {
        context.expect(input.issues).toEqual([]);
        context.expect(operation).toMatchObject({
          key: 'createTrade',
          prefix: contractName,
          methodName: 'createTrade',
          httpMethod: 'post',
          path: '/api/v1/trades',
        });
        context.expect(operation?.meta).toEqual({
          id: 'createTrade',
          method: 'post',
          path: '/api/v1/trades',
        });
      });
    } finally {
      rmSync(valid.root, { recursive: true, force: true });
    }

    await checkpoint('illegal-element-rejected', async () => {
      const cases = [
        'export const consumedOperations = [{ method: { meta: { id: "createTrade" } }, requestFields: {} }];',
        `import { CreateTrade } from ${JSON.stringify(idlOperations)};
export const consumedOperations = [{ method: CreateTrade, requestFields: {} }];`,
        'export const consumedOperations = [{ requestFields: {} }];',
        `import { createTrade } from ${JSON.stringify(generatedOperations)};
export const consumedOperations = [{ method: createTrade, requestFields: () => ({}) }];`,
        `import { createTrade } from ${JSON.stringify(generatedOperations)};
export const consumedOperations = [{ method: createTrade, requestFields: { "path.x": { cases: "bad", authority: "" }, "body.a": [] } }];`,
      ];
      for (const declaration of cases) {
        const fixture = programFixture(declaration);
        try {
          const input = declarationInput(fixture);
          context.expect(adapter.resolveDeclaration(input)).toBeUndefined();
          context.expect(input.issues.join('\n')).toMatch(/fixture\.ts/);
        } finally {
          rmSync(fixture.root, { recursive: true, force: true });
        }
      }
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-016',
  'scan-calls-unit',
  ['calls-recognized', 'unused-declaration', 'undeclared-call'],
  async (context, checkpoint) => {
    const fixture = programFixture(
      `import { createTrade, getTrade } from ${JSON.stringify(generatedOperations)};
declare const client: { request(...args: unknown[]): unknown };
export const consumedOperations = [{ method: createTrade, requestFields: {} }];
client.request(createTrade, {});
client.request(getTrade, {});
client.request({ meta: { id: "createTrade" } }, {});
const request = client.request;
request(createTrade, {});`,
      { product: true },
    );
    try {
      const calls = adapter.scanCalls({
        checker: fixture.program.getTypeChecker(),
        program: fixture.program,
        productSrc: join(fixture.root, 'packages/web/src'),
        sourceFiles: [fixture.source],
      });
      await checkpoint('calls-recognized', () =>
        context.expect(calls).toEqual([
          { method: 'createTrade', position: 'declarations.ts:4' },
          { method: 'getTrade', position: 'declarations.ts:5' },
        ]),
      );
      await checkpoint('unused-declaration', () =>
        context.expect(calls.some((call) => call.method === 'getTrade')).toBe(true),
      );
      await checkpoint('undeclared-call', () =>
        context.expect(calls.some((call) => call.method === 'createTrade')).toBe(true),
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-017',
  'derive-obligations-unit',
  [
    'obligation-kinds',
    'obligation-id-format',
    'no-leaf-obligations',
    'business-code-per-code',
    'request-fields-keyspace',
    'request-id-obligation',
    'empty-declaration',
  ],
  async (context, checkpoint) => {
    const fixture = programFixture(
      validCreateTradeDeclaration(`{
        "body.merchant_id": { cases: ["mapped-value"], authority: "fixture" },
        "header.X-Request-Id": { cases: ["generated-value"], authority: "fixture" }
      }`),
    );
    try {
      const input = declarationInput(fixture);
      const operation = adapter.resolveDeclaration(input)!;
      const issues: string[] = [];
      const derived = adapter.deriveObligations({
        operation,
        checker: fixture.program.getTypeChecker(),
        program: fixture.program,
        protocolSrc: join(repositoryRoot, 'packages/openapi/src'),
        requiredIn: ['integration', 'browser'],
        integrationOnly: ['integration'],
        issues,
      });
      const ids = derived.obligations.map((item) => item.id);
      await checkpoint('obligation-kinds', () => {
        context.expect(issues).toEqual([]);
        context
          .expect(ids)
          .toEqual(
            expect.arrayContaining([
              'trade.v1.createTrade#route#$',
              'trade.v1.createTrade#identity#$',
              'trade.v1.createTrade#request-headers#$',
              'trade.v1.createTrade#envelope#$',
              'trade.v1.createTrade#transport-failure#$',
              'trade.v1.createTrade#presence#data',
            ]),
          );
      });
      await checkpoint('obligation-id-format', () =>
        context.expect(ids.every((id) => /^trade\.v1\.createTrade#[^#]+#/.test(id))).toBe(true),
      );
      await checkpoint('no-leaf-obligations', () =>
        context.expect(ids.filter((id) => id.includes('body.merchant_id.'))).toEqual([]),
      );
      await checkpoint('business-code-per-code', () =>
        context
          .expect(ids.filter((id) => id.includes('#business-code#')))
          .toEqual([
            'trade.v1.createTrade#business-code#INVALID_REQUEST',
            'trade.v1.createTrade#business-code#TRADE_CONFLICT',
            'trade.v1.createTrade#business-code#TRADE_NOT_FOUND',
          ]),
      );
      await checkpoint('request-fields-keyspace', () => {
        context
          .expect(derived.obligations.find((item) => item.id.endsWith('body.merchant_id')))
          .toMatchObject({ cases: ['mapped-value'] });
        const invalidIssues: string[] = [];
        adapter.deriveObligations({
          operation: {
            ...operation,
            requestFields: {
              'query.x': { cases: ['omitted'], authority: 'fixture' },
              'body.a.b': { cases: ['omitted'], authority: 'fixture' },
              'path.unknown': { cases: ['omitted'], authority: 'fixture' },
            },
          },
          checker: fixture.program.getTypeChecker(),
          program: fixture.program,
          protocolSrc: join(repositoryRoot, 'packages/openapi/src'),
          requiredIn: ['integration'],
          integrationOnly: ['integration'],
          issues: invalidIssues,
        });
        context.expect(invalidIssues.join('\n')).toContain('query.x');
        context.expect(invalidIssues.join('\n')).toContain('body.a.b');
        context.expect(invalidIssues.join('\n')).toContain('path.unknown');
      });
      await checkpoint('request-id-obligation', () =>
        context
          .expect(derived.obligations.find((item) => item.id.includes('#request-headers#')))
          .toMatchObject({
            cases: expect.arrayContaining(['x-request-id-name', 'x-request-id-format']),
          }),
      );
      await checkpoint('empty-declaration', () => {
        const emptyIssues: string[] = [];
        context
          .expect(
            adapter.deriveObligations({
              checker: fixture.program.getTypeChecker(),
              program: fixture.program,
              protocolSrc: join(repositoryRoot, 'packages/openapi/src'),
              requiredIn: ['integration', 'browser'],
              integrationOnly: ['integration'],
              issues: emptyIssues,
            }).obligations,
          )
          .toEqual([]);
        context.expect(emptyIssues).toEqual([]);
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-018',
  'presence-derivation',
  [
    'presence-values',
    'nullable-handled',
    'union-containment',
    'union-pending',
    'no-runtime-exception',
  ],
  async (context, checkpoint) => {
    await checkpoint('presence-values', () => {
      const result = derivePresence({
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            required: ['required', 'nullable'],
            properties: {
              required: { type: 'string' },
              optional: { type: 'string' },
              nullable: { type: 'string', nullable: true },
            },
          },
        },
      });
      context.expect(result).toEqual({
        pending: false,
        data: 'present',
        properties: {
          required: 'present',
          optional: 'optional',
          nullable: 'present-or-null',
        },
      });
    });
    await checkpoint('nullable-handled', () =>
      context
        .expect(derivePresence({ properties: { data: { type: ['string', 'null'] } } }).data)
        .toBe('present-or-null'),
    );
    await checkpoint('union-containment', () => {
      const result = derivePresence({
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            oneOf: [
              {
                type: 'object',
                required: ['a', 'b'],
                properties: { a: { type: 'string' }, b: { type: 'string' } },
              },
              {
                type: 'object',
                required: ['a'],
                properties: { a: { type: 'string' } },
              },
            ],
          },
        },
      });
      context.expect(result).toEqual({
        pending: false,
        data: 'present',
        properties: { a: 'present', b: 'optional' },
      });
    });
    await checkpoint('union-pending', () =>
      context
        .expect(
          derivePresence({
            properties: {
              data: {
                oneOf: [
                  { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
                  { type: 'object', required: ['b'], properties: { b: { type: 'string' } } },
                ],
              },
            },
          }),
        )
        .toEqual({ pending: true, data: 'optional', properties: {} }),
    );
    await checkpoint('no-runtime-exception', () => {
      context
        .expect(
          derivePresence({
            properties: {
              data: {
                anyOf: [
                  { $ref: '#/components/schemas/Unknown' },
                  { type: 'object', properties: { inline: { type: 'string' } } },
                ],
              },
            },
          }),
        )
        .toMatchObject({ pending: false });
      context
        .expect(derivePresence(null))
        .toEqual({ pending: false, data: 'optional', properties: {} });
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-019',
  'unimplemented-hint-unit',
  ['hint-emitted', 'not-blocking'],
  async (context, checkpoint) => {
    const warn = testWarn();
    const issues: string[] = [];
    try {
      const result = adapter.deriveObligations({
        operation: {
          key: 'cancelTrade',
          prefix: contractName,
          methodName: 'cancelTrade',
          httpMethod: 'post',
          path: '/api/v1/trades/{trade_no}/cancel',
          requestFields: {},
          position: 'fixture.ts:1',
          meta: operationById('cancelTrade'),
        },
        checker: undefined,
        program: undefined,
        protocolSrc: join(repositoryRoot, 'packages/openapi/src'),
        requiredIn: ['integration', 'browser'],
        integrationOnly: ['integration'],
        issues,
      });
      await checkpoint('hint-emitted', () =>
        context.expect(warn.mock.calls.join('\n')).toContain('cancelTrade'),
      );
      await checkpoint('not-blocking', () => {
        context.expect(issues).toEqual([]);
        context.expect(result.obligations.length).toBeGreaterThan(0);
      });
    } finally {
      warn.restore();
    }
  },
);

function testWarn() {
  const calls: string[][] = [];
  const original = console.warn;
  console.warn = (...items: unknown[]) => {
    calls.push(items.map(String));
  };
  return {
    mock: { calls },
    restore() {
      console.warn = original;
    },
  };
}
