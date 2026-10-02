import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const contractsUrl = new URL('../../../sdk/src/example/contracts.ts', import.meta.url);
const declarationUrls = ['index.d.ts', 'index.d.cts'].map(file => new URL(`../../../sdk/dist/${file}`, import.meta.url));
type DocRequirement = Readonly<{ name: string; fields?: readonly string[]; values?: readonly string[] }>;

function chineseJsDoc(source: string, file: ts.SourceFile, node: ts.Node): boolean {
  const before = source.slice(0, node.getStart(file));
  const start = before.lastIndexOf('/**');
  const end = before.indexOf('*/', start);
  if (start < 0 || end < 0 || !/^[\s|]*$/.test(before.slice(end + 2))) return false;
  return /[\u3400-\u9fff]/.test(before.slice(start, end + 2));
}

function publicDocIssues(source: string, requirements: readonly DocRequirement[]): string[] {
  const file = ts.createSourceFile('contracts.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const issues: string[] = [];
  for (const requirement of requirements) {
    const node = file.statements.find(statement =>
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name.text === requirement.name);
    if (!node) { issues.push(`${requirement.name}: missing`); continue; }
    if (!chineseJsDoc(source, file, node)) issues.push(`${requirement.name}: missing Chinese JSDoc`);
    const fields = new Map<string, ts.Node>();
    const values = new Map<string, ts.Node>();
    const visit = (child: ts.Node, parent?: ts.Node): void => {
      if ((ts.isPropertySignature(child) || ts.isMethodSignature(child)) && !fields.has(child.name.getText(file))) {
        fields.set(child.name.getText(file), child);
      }
      if (ts.isLiteralTypeNode(child)) {
        const anchor = parent && (ts.isPropertySignature(parent) || ts.isTypeAliasDeclaration(parent)) ? parent : child;
        if (ts.isStringLiteral(child.literal)) values.set(child.literal.text, anchor);
        else if (child.literal.kind === ts.SyntaxKind.TrueKeyword) values.set('true', anchor);
        else if (child.literal.kind === ts.SyntaxKind.FalseKeyword) values.set('false', anchor);
      }
      ts.forEachChild(child, next => visit(next, child));
    };
    ts.forEachChild(node, child => visit(child, node));
    for (const field of requirement.fields ?? []) {
      const member = fields.get(field);
      if (!member) issues.push(`${requirement.name}.${field}: missing`);
      else if (!chineseJsDoc(source, file, member)) issues.push(`${requirement.name}.${field}: missing Chinese JSDoc`);
    }
    for (const value of requirement.values ?? []) {
      const literal = values.get(value);
      if (!literal) issues.push(`${requirement.name}.${value}: missing`);
      else if (!chineseJsDoc(source, file, literal)) issues.push(`${requirement.name}.${value}: missing Chinese JSDoc`);
    }
  }
  return issues;
}

function removeNearestComment(source: string, needle: string, after = ''): string {
  const base = after ? source.indexOf(after) : 0;
  const at = source.indexOf(needle, Math.max(base, 0));
  if (at < 0) throw new Error(`mutation target not found: ${needle}`);
  const start = source.lastIndexOf('/**', at);
  if (start < 0) throw new Error(`no JSDoc before: ${needle}`);
  const end = source.indexOf('*/', start);
  return source.slice(0, start) + source.slice(end + 2);
}

defineCase({ ownerId: 'SCN-TEMPLATE-ENGINEERING-003', caseId: 'source-and-dual-declarations', fixtureCase: 'source-and-dual-declarations', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-003', caseKey: 'source-and-dual-declarations', checks: ['source-comment-structure', 'dual-declaration-structure'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const requirements = (value as { types: DocRequirement[] }).types;
  const source = await readFile(contractsUrl, 'utf8');
  await checkpoint('source-comment-structure', () => expect(publicDocIssues(source, requirements)).toEqual([]));
  const declarations = await Promise.all(declarationUrls.map(url => readFile(url, 'utf8')));
  await checkpoint('dual-declaration-structure', () => expect(declarations.map(text => publicDocIssues(text, requirements))).toEqual([[], []]));
}, { fixtureRoot });

defineCase({ ownerId: 'SCN-TEMPLATE-ENGINEERING-003', caseId: 'missing-comment-rejected', fixtureCase: 'missing-comment-rejected', environment: 'integration',
  covers: [{ id: 'SCN-TEMPLATE-ENGINEERING-003', caseKey: 'missing-comment-rejected', checks: ['source-comment-structure', 'dual-declaration-structure'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const mutations = (value as { mutations: string[] }).mutations;
  const requirements: DocRequirement[] = [
    { name: 'ExampleState', values: ['pending'] },
    { name: 'ExampleOutcome', fields: ['lastState'], values: ['window_elapsed'] },
    { name: 'ExampleCreateResult', values: ['true'] },
    { name: 'ExampleClient', fields: ['observe'] },
  ];
  const source = await readFile(contractsUrl, 'utf8');
  const declaration = await readFile(declarationUrls[0]!, 'utf8');
  await checkpoint('source-comment-structure', () => {
    expect(mutations).toContain('type');
    expect(publicDocIssues(removeNearestComment(source, 'export type ExampleState'), [{ name: 'ExampleState' }])).toContain('ExampleState: missing Chinese JSDoc');
    expect(mutations).toContain('field');
    expect(publicDocIssues(removeNearestComment(source, 'lastState: ExampleState'), requirements)).toContain('ExampleOutcome.lastState: missing Chinese JSDoc');
    expect(mutations).toContain('union-value');
    expect(publicDocIssues(removeNearestComment(source, "| 'window_elapsed'"), requirements)).toContain('ExampleOutcome.window_elapsed: missing Chinese JSDoc');
    expect(mutations).toContain('boolean-value');
    expect(publicDocIssues(removeNearestComment(source, 'ok: true'), requirements)).toContain('ExampleCreateResult.true: missing Chinese JSDoc');
    expect(mutations).toContain('method');
    expect(publicDocIssues(removeNearestComment(source, 'observe(reference'), requirements)).toContain('ExampleClient.observe: missing Chinese JSDoc');
  });
  await checkpoint('dual-declaration-structure', () => {
    expect(mutations).toContain('declaration');
    expect(publicDocIssues(removeNearestComment(declaration, "| 'unknown'", 'ExampleState ='), [{ name: 'ExampleState', values: ['unknown'] }])).toContain('ExampleState.unknown: missing Chinese JSDoc');
  });
}, { fixtureRoot });
