import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, expect, test } from 'vitest';
import { resolveOpenApiDeclaration } from './ast.ts';

const generatedOperations = join(process.cwd(), 'packages/openapi/src/generated/operations.ts');
const cleanups: string[] = [];

afterEach(() => {
  for (const root of cleanups.splice(0)) rmSync(root, { recursive: true, force: true });
});

function declarationFixture(declaration: string, options: { generatedRoot?: string } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'openapi-ast-')));
  cleanups.push(root);
  const generatedRoot =
    options.generatedRoot ?? join(process.cwd(), 'packages/openapi/src/generated');
  const modulePath = join(root, 'declarations.ts');
  writeFileSync(modulePath, declaration);
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
  const declarationNode = statement.declarationList.declarations.find(
    (item) => ts.isIdentifier(item.name) && item.name.text === 'consumedOperations',
  )!;
  const initializer = declarationNode.initializer!;
  const element = ts.isArrayLiteralExpression(initializer) ? initializer.elements[0]! : initializer;
  return { root, modulePath, program, element, generatedRoot };
}

function resolve(declaration: string, modulePath?: string, generatedRoot?: string) {
  const fixture = declarationFixture(declaration, { ...(generatedRoot ? { generatedRoot } : {}) });
  const issues: string[] = [];
  const operation = resolveOpenApiDeclaration({
    element: fixture.element,
    checker: fixture.program.getTypeChecker(),
    program: fixture.program,
    generatedRoot: fixture.generatedRoot,
    modulePath: modulePath ?? fixture.modulePath,
    position: 'fixture.ts',
    issues,
  });
  return { operation, issues };
}

test(
  'OpenAPI AST rejects non-object declarations and malformed request fields',
  { timeout: 120_000 },
  () => {
    const generatedImport = JSON.stringify(generatedOperations);
    expect(
      resolve(`import { createTrade } from ${generatedImport};
export const consumedOperations = [createTrade];`).issues.join('\n'),
    ).toContain('声明元素不是');

    expect(
      resolve(`import { createTrade } from ${generatedImport};
export const consumedOperations = [{ method: createTrade }];`).operation?.requestFields,
    ).toEqual({});

    for (const fields of [
      '() => ({})',
      '{ ...base }',
      '{ [key]: { cases: ["mapped"], authority: "fixture" } }',
      '{ "body.name": { cases: "bad", authority: "fixture" } }',
      '{ "body.name": { cases: [1], authority: "fixture" } }',
      '{ "body.name": { cases: ["mapped"], authority: 1 } }',
      '{ bad }',
    ]) {
      const result = resolve(`import { createTrade } from ${generatedImport};
declare const base: object;
declare const key: string;
declare const bad: unknown;
export const consumedOperations = [{ method: createTrade, requestFields: ${fields} }];`);
      expect(result.operation).toBeUndefined();
      expect(result.issues.join('\n')).toMatch(/requestFields|策略/);
    }

    expect(
      resolve(`import { createTrade } from ${generatedImport};
export const consumedOperations = [{ method: createTrade, requestFields: { 1: { cases: ["mapped"], authority: "fixture" } } }];`)
        .operation?.requestFields,
    ).toEqual({ 1: { cases: ['mapped'], authority: 'fixture' } });
    expect(
      resolve(`import { createTrade as trade } from ${generatedImport};
export const consumedOperations = [{ method: trade, requestFields: {} }];`).operation?.methodName,
    ).toBe('createTrade');

    expect(
      resolve(`declare const method: unknown;
export const consumedOperations = [{ method, requestFields: {} }];`).operation,
    ).toBeUndefined();

    const missingSource = resolve(
      `import { createTrade } from ${generatedImport};
export const consumedOperations = [{ method: createTrade, requestFields: {} }];`,
      join(tmpdir(), 'does-not-exist.ts'),
    );
    expect(missingSource.operation?.position).toBe('fixture.ts:1');
  },
);

test(
  'OpenAPI AST rejects generated constants with invalid initializer, meta, and id',
  { timeout: 30_000 },
  () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'openapi-ast-generated-')));
    cleanups.push(root);
    const generatedRoot = join(root, 'generated');
    mkdirSync(generatedRoot, { recursive: true });
    const generatedPath = join(generatedRoot, 'operations-invalid.ts');
    writeFileSync(
      generatedPath,
      `export const notObject = 1;
export declare const noInitializer: unknown;
export const noMeta = {};
export const badMeta = { meta: 1 };
export const badId = { meta: { id: 1 } };
export const valid = { meta: { id: "createTrade" } };`,
    );
    for (const method of ['notObject', 'noInitializer', 'noMeta', 'badMeta', 'badId']) {
      const result = resolve(
        `import { ${method} } from ${JSON.stringify(generatedPath)};
export const consumedOperations = [{ method: ${method}, requestFields: {} }];`,
        undefined,
        generatedRoot,
      );
      expect(result.operation).toBeUndefined();
      expect(result.issues.join('\n')).toContain('OpenAPI generated 描述常量');
    }

    const local = resolve(`const method = { meta: { id: "createTrade" } };
export const consumedOperations = [{ method: method, requestFields: {} }];`);
    expect(local.operation).toBeUndefined();
  },
);
