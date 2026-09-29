import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { defineCase } from '../../src/cases/define-case.ts';
import { buildVerificationFingerprints } from '../../../../scripts/lib/fingerprints.ts';

const root = resolve(import.meta.dirname, '../../../..');
const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
const contractsUrl = new URL('../../../payment-sdk/src/contracts.ts', import.meta.url);
const declarationUrls = ['index.d.ts', 'index.d.cts'].map(file => new URL(`../../../payment-sdk/dist/${file}`, import.meta.url));
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
    const fields = new Map<string, ts.PropertySignature>();
    const values = new Map<string, ts.LiteralTypeNode>();
    const visit = (child: ts.Node): void => {
      if (ts.isPropertySignature(child)) fields.set(child.name.getText(file), child);
      if (ts.isLiteralTypeNode(child) && ts.isStringLiteral(child.literal)) values.set(child.literal.text, child);
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
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

function removeNearestComment(source: string, needle: string): string {
  const at = source.indexOf(needle);
  const start = source.lastIndexOf('/**', at);
  const end = source.indexOf('*/', start);
  return source.slice(0, start) + source.slice(end + 2);
}

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-021', caseId: 'source-and-dual-declarations', fixtureCase: 'source-and-dual-declarations', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CONTRACT-021', caseKey: 'source-and-dual-declarations', checks: ['source-comment-structure', 'dual-declaration-structure'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const requirements = (value as { types: DocRequirement[] }).types;
  const source = await readFile(contractsUrl, 'utf8');
  await checkpoint('source-comment-structure', () => expect(publicDocIssues(source, requirements)).toEqual([]));
  const declarations = await Promise.all(declarationUrls.map(url => readFile(url, 'utf8')));
  await checkpoint('dual-declaration-structure', () => expect(declarations.map(text => publicDocIssues(text, requirements))).toEqual([[], []]));
}, { fixtureRoot });

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-021', caseId: 'missing-comment-rejected', fixtureCase: 'missing-comment-rejected', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CONTRACT-021', caseKey: 'missing-comment-rejected', checks: ['source-comment-structure', 'dual-declaration-structure'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const mutations = (value as { mutations: string[] }).mutations;
  const requirements: DocRequirement[] = [
    { name: 'TradeState', values: ['PAID'] },
    { name: 'PaymentOutcome', fields: ['interruptedPhase'] },
  ];
  const source = await readFile(contractsUrl, 'utf8');
  const declaration = await readFile(declarationUrls[0]!, 'utf8');
  await checkpoint('source-comment-structure', () => {
    expect(mutations).toContain('type');
    expect(publicDocIssues(removeNearestComment(source, 'export type TradeState'), [{ name: 'TradeState' }])).toContain('TradeState: missing Chinese JSDoc');
    expect(mutations).toContain('field');
    expect(publicDocIssues(removeNearestComment(source, 'interruptedPhase?:'), requirements)).toContain('PaymentOutcome.interruptedPhase: missing Chinese JSDoc');
    expect(mutations).toContain('union-value');
    expect(publicDocIssues(removeNearestComment(source, "| 'PAID'"), requirements)).toContain('TradeState.PAID: missing Chinese JSDoc');
  });
  await checkpoint('dual-declaration-structure', () => {
    expect(mutations).toContain('declaration');
    expect(publicDocIssues(removeNearestComment(declaration, "| 'PAID'"), requirements)).toContain('TradeState.PAID: missing Chinese JSDoc');
  });
}, { fixtureRoot });

type SemanticEntry = Readonly<{ term: string; conclusion: string; locations: ReadonlyArray<Readonly<{ path: string; line: number; contains: string }>> }>;

defineCase({ ownerId: 'TC-PAYSDK-CONTRACT-021', caseId: 'semantic-review-evidence', fixtureCase: 'semantic-review-evidence', environment: 'integration',
  covers: [{ id: 'TC-PAYSDK-CONTRACT-021', caseKey: 'semantic-review-evidence', checks: ['semantic-review-record'] }],
}, async ({ fixture: value, checkpoint, expect }) => {
  const record = value as { sourceDigest: string; entries: SemanticEntry[] };
  await checkpoint('semantic-review-record', async () => {
    expect(record.sourceDigest).toBe(buildVerificationFingerprints(root).sourceDigest);
    expect(record.entries.map(entry => entry.term)).toEqual([
      'confirmed', 'PAID', 'CLOSED', 'confirming', 'unknown callback', 'no callback', 'cancelled', 'stopped',
      'interruptedPhase', 'onPhase', 'backend mapping', 'core stop branch', 'channel stop branch',
    ]);
    for (const entry of record.entries) {
      expect(entry.conclusion).toMatch(/[\u3400-\u9fff]/);
      expect(entry.locations.length).toBeGreaterThan(0);
      for (const location of entry.locations) {
        const lines = (await readFile(resolve(root, location.path), 'utf8')).split('\n');
        expect(lines[location.line - 1], `${entry.term} at ${location.path}:${location.line}`).toContain(location.contains);
      }
    }
    for (const term of ['confirmed', 'PAID', 'CLOSED', 'confirming', 'cancelled', 'stopped', 'interruptedPhase', 'onPhase']) {
      const paths = record.entries.find(entry => entry.term === term)!.locations.map(location => location.path);
      expect(paths).toContain('packages/payment-sdk/src/contracts.ts');
      expect(paths).toContain('packages/payment-sdk/dist/index.d.ts');
      expect(paths).toContain('packages/payment-sdk/dist/index.d.cts');
    }
  });
}, { fixtureRoot });
