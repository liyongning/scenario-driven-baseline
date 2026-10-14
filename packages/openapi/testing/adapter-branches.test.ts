import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, expect, test } from 'vitest';
import adapter from './adapter.ts';
import {
  contractName,
  operationById,
  operations,
  type OpenApiOperationContract,
} from './contract.ts';

const added: OpenApiOperationContract[] = [];
const mutableOperations = operations as unknown as OpenApiOperationContract[];
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  while (added.length > 0) {
    const operation = added.pop()!;
    const index = mutableOperations.indexOf(operation);
    if (index >= 0) mutableOperations.splice(index, 1);
  }
});

function addOperation(operation: OpenApiOperationContract) {
  added.push(operation);
  mutableOperations.push(operation);
  return operation;
}

function resolveDeclaration(generatedRoot = '', generatedOperation = 'getTrade') {
  const root = mkdtempSync(join(tmpdir(), 'openapi-adapter-declaration-'));
  temporaryRoots.push(root);
  const defaultGeneratedOperations = join(
    process.cwd(),
    'packages/openapi/testing/engine/generated/operations.ts',
  );
  let generatedOperations = defaultGeneratedOperations;
  if (generatedOperation !== 'getTrade') {
    const generatedRoot = join(root, 'generated');
    mkdirSync(generatedRoot, { recursive: true });
    generatedOperations = join(generatedRoot, 'operations.ts');
    writeFileSync(
      generatedOperations,
      `export const ${generatedOperation} = { meta: { id: ${JSON.stringify(generatedOperation)}, ` +
        "method: 'get', path: '/fixture', security: [], codes: [] } };\n",
    );
  }
  const modulePath = join(root, 'declarations.ts');
  writeFileSync(
    modulePath,
    `import { ${generatedOperation} } from ${JSON.stringify(generatedOperations)};\n` +
      `export const consumedOperations = [{ method: ${generatedOperation}, requestFields: {} }];\n`,
  );
  const program = ts.createProgram([modulePath, generatedOperations], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  });
  const source = program.getSourceFile(modulePath)!;
  const statement = source.statements.find(
    (item): item is ts.VariableStatement =>
      ts.isVariableStatement(item) &&
      item.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === 'consumedOperations',
      ),
  )!;
  const declaration = statement.declarationList.declarations.find(
    (item) => ts.isIdentifier(item.name) && item.name.text === 'consumedOperations',
  )!;
  const initializer = declaration.initializer!;
  const element = ts.isArrayLiteralExpression(initializer) ? initializer.elements[0]! : initializer;
  const issues: string[] = [];
  return {
    operation: adapter.resolveDeclaration({
      element,
      checker: program.getTypeChecker(),
      program,
      generatedRoot,
      modulePath,
      position: 'fixture.ts',
      issues,
    }),
    issues,
  };
}

test('OpenAPI adapter derives pending presence and security-specific obligations', () => {
  const operation = addOperation({
    id: 'pendingPresence',
    method: 'post',
    path: '/pending',
    security: [{ accessToken: [] }],
    codes: [],
    implemented: true,
    parameters: [{ in: 'path', name: 'id' }],
    requestBody: { properties: { name: { type: 'string' } } },
    codeTable: {},
    componentSchemas: {},
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'message', 'data'],
              properties: {
                code: { type: 'integer' },
                message: { type: 'string' },
                data: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['a'],
                      properties: { a: { type: 'string' } },
                    },
                    {
                      type: 'object',
                      required: ['b'],
                      properties: { b: { type: 'string' } },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
  const issues: string[] = [];
  const result = adapter.deriveObligations({
    operation: {
      key: operation.id,
      prefix: contractName,
      methodName: operation.id,
      httpMethod: operation.method,
      path: operation.path,
      requestFields: {
        'path.id': { cases: ['encoded'], authority: 'fixture' },
        'body.name': { cases: ['mapped-value'], authority: 'fixture' },
        'header.content-type': { cases: ['content-type'], authority: 'fixture' },
      },
      position: 'fixture.ts:1',
      meta: operation,
    },
    checker: undefined,
    program: undefined,
    protocolSrc: 'packages/openapi/src',
    requiredIn: ['integration'],
    integrationOnly: ['integration'],
    issues,
  });

  expect(issues.join('\n')).toContain('presence data 联合类型无法判定');
  expect(result.obligations).toContainEqual({
    id: `${contractName}.pendingPresence#identity#$`,
    cases: ['header:accessToken'],
    requiredIn: ['integration'],
  });
});

test('OpenAPI adapter rejects unknown operations and resolves validator input shapes', async () => {
  const issues: string[] = [];
  expect(
    adapter.deriveObligations({
      operation: {
        key: 'missing',
        prefix: contractName,
        methodName: 'missing',
        httpMethod: 'get',
        path: '/missing',
        requestFields: {},
        position: 'fixture.ts:1',
        meta: {},
      },
      checker: undefined,
      program: undefined,
      protocolSrc: 'packages/openapi/src',
      requiredIn: ['integration'],
      integrationOnly: ['integration'],
      issues,
    }).obligations,
  ).toEqual([]);
  expect(issues.join('\n')).toContain('OpenAPI 契约中不存在接口 missing');

  expect(adapter.responseValidator(false)).toBeUndefined();
  expect(adapter.responseValidator({ meta: 'invalid' })).toBeUndefined();
  expect(adapter.responseValidator({ meta: { id: 1 } })).toBeUndefined();
  expect(adapter.responseValidator({ meta: { id: 'missing' } })).toBeUndefined();
  expect(() =>
    adapter.responseValidator('createTrade', {
      manifest: { contractCarrier: 'unsupported' },
    }),
  ).toThrow('OpenAPI 适配器不支持 contractCarrier=unsupported');
  const response = {
    code: 0,
    message: 'ok',
    data: { trade_no: 'T', status: 'CREATED', amount: 1, merchant_id: 1 },
  };
  const engine = { manifest: { contractCarrier: 'engine' } } as const;
  expect(adapter.responseValidator('createTrade', engine)!(response, 200)).toEqual([]);
  expect(
    adapter.responseValidator({ meta: { id: 'createTrade' } }, engine)!(response, 200),
  ).toEqual([]);

  const anonymousIssues: string[] = [];
  adapter.deriveObligations({
    operation: {
      key: 'listTrades',
      prefix: contractName,
      methodName: 'listTrades',
      httpMethod: 'get',
      path: '/list',
      requestFields: {},
      position: 'fixture.ts:1',
      meta: operationById('listTrades')!,
    },
    checker: undefined,
    program: undefined,
    protocolSrc: 'packages/openapi/src',
    requiredIn: ['integration'],
    integrationOnly: ['integration'],
    issues: anonymousIssues,
  });
  expect(anonymousIssues).toEqual([]);
  expect(await adapter.checkFixture({}, {})).toEqual([]);
  expect((await adapter.checkFixture({ contractCarrier: 'unsupported' }, {})).join('\n')).toContain(
    'OpenAPI 适配器不支持 contractCarrier=unsupported',
  );
});

test(
  'OpenAPI adapter resolves declarations against the selected contract carrier',
  {
    timeout: 60_000,
  },
  () => {
    expect(
      resolveDeclaration(join(process.cwd(), 'packages/openapi/testing/engine/generated')).operation
        ?.methodName,
    ).toBe('getTrade');
    const productCarrier = resolveDeclaration('', 'missingProductOperation');
    expect(productCarrier.operation).toBeUndefined();
    expect(productCarrier.issues.join('\n')).toContain(
      '声明元素的 method 不是 OpenAPI generated 描述常量',
    );
  },
);

test('OpenAPI adapter preserves non-Error fixture failures', async () => {
  const manifest = {};
  Object.defineProperty(manifest, 'contractCarrier', {
    get() {
      throw 'fixture failure';
    },
  });
  expect(adapter.checkFixture(manifest, {})).toEqual(['fixture failure']);
});
