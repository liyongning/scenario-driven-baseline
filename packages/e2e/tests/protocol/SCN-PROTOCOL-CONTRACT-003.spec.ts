// @SCN-PROTOCOL-CONTRACT-003: IDL 5539be8；仅消费协议包构建 exports，Go 原文给出独立期望。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type TestContext } from 'vitest';
import { parse } from 'yaml';
import * as protocol from '@daqian/payment-protocol';
import { canonicalErrorCodeToJSON } from '@daqian/payment-protocol/generated/idl/common/v1/enums';
import expected from '../fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json';
import manifest from '../fixtures/SCN-PROTOCOL-CONTRACT-003/manifest.json';

const fixtureRoot = 'packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003';
const historicalBaseline = manifest.sources.generatedCompatibility;
const currentBaseline = manifest.sources.generatedCurrent;
type GeneratedBaseline = typeof historicalBaseline;
type LockedSource = GeneratedBaseline['source'] & {
  resolvedCommit: string;
  producerInputDigest: string;
  outputs: Record<string, GeneratedBaseline['output']>;
};
type Lock = { lockVersion: number; tool: GeneratedBaseline['tool']; sources: Record<string, LockedSource> };
function readLock(path: string): Lock { return parse(readFileSync(path, 'utf8')) as Lock; }
function paymentSource(lock: Lock, baseline: GeneratedBaseline): LockedSource { return lock.sources[baseline.sourceId]!; }
function verifyGenerated(lock: Lock, baseline: GeneratedBaseline) {
  // 仅两个来源元数据字段可刷新；其余完整锁定结构（含 source/output ID）必须匹配已验收基线。
  const source = paymentSource(lock, baseline);
  expect(source).toBeDefined();
  expect(source.resolvedCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(source.producerInputDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  const stable = structuredClone(lock) as Omit<Lock, 'sources'> & { sources: Record<string, Partial<LockedSource>> };
  delete stable.sources[baseline.sourceId]!.resolvedCommit;
  delete stable.sources[baseline.sourceId]!.producerInputDigest;
  expect(stable).toEqual({
    lockVersion: baseline.lockVersion,
    tool: baseline.tool,
    sources: { [baseline.sourceId]: { ...baseline.source, outputs: { [baseline.outputId]: baseline.output } } },
  });
}

type Catalog = Record<string, protocol.PaymentBusinessErrorDescriptor>;
function verify(catalog: Catalog, commit: string) {
  expect(manifest.sources.idlCommit).toBe('5539be8f09323709fa65f6568efe22896ec35d24');
  expect(commit).toBe(manifest.sources.idlCommit);
  expect(Object.keys(catalog).sort()).toEqual(expected.map(e => e.name).sort());
  expect(Object.entries(catalog).map(([name, d]) => ({ name, ...d, statusCode: d.statusCode.toString(), canonicalCode: canonicalErrorCodeToJSON(d.canonicalCode) })).sort((a,b) => a.name.localeCompare(b.name)))
    .toEqual([...expected].sort((a,b) => a.name.localeCompare(b.name)));
}
function copy(): Catalog { expect(protocol).toHaveProperty('paymentBusinessErrors'); return structuredClone(protocol.paymentBusinessErrors); }

const scenarioChecks = {
  'all-errors': ['catalog-parity', 'source-alignment'],
  'wrong-code': ['drift-rejected'],
  'wrong-description': ['drift-rejected'],
  'missing-error': ['drift-rejected'],
  'source-mismatch': ['drift-rejected'],
  'metadata-only-sync': ['source-alignment', 'compatible-refresh'],
  'projection-mismatch': ['projection-drift'],
} as const;

function contractTest(caseKey: keyof typeof scenarioChecks, body: () => void | Promise<void>) {
  const checks = scenarioChecks[caseKey];
  const idlCovers = caseKey === 'all-errors'
    ? expected.map(item => ({ id: 'idl.error-contract#business-error#$', caseKey: item.name, checks: ['catalog-parity'] }))
    : [];
  test(`SCN-PROTOCOL-CONTRACT-003/${caseKey}`, { meta: { paymentCase: {
    ownerId: 'SCN-PROTOCOL-CONTRACT-003', caseId: caseKey, environment: 'integration', fixtureCase: caseKey,
    covers: [{ id: 'SCN-PROTOCOL-CONTRACT-003', caseKey, checks: [...checks] }, ...idlCovers],
  } } }, async (context: TestContext) => {
    const before = expect.getState().assertionCalls;
    await body();
    const assertions = expect.getState().assertionCalls - before;
    if (assertions <= 0) throw new Error(`${caseKey} executed no assertions`);
    await context.annotate(JSON.stringify({ assertions, checkpoints: [...checks] }), 'payment-evidence');
  });
}

contractTest('all-errors', () => {
  expect(protocol).toHaveProperty('paymentBusinessErrors');
  verify(protocol.paymentBusinessErrors, protocol.paymentBusinessErrorsIdlCommit);
  verifyGenerated(readLock('proto-gen.lock'), currentBaseline);
  expect(expected).toHaveLength(7);
  for (const file of ['idl-errors.json', 'extract.go'] as const) {
    const want = file === 'extract.go' ? manifest.sources.extraction.programSha256 : manifest.sha256[file];
    expect(createHash('sha256').update(readFileSync(`packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/${file}`)).digest('hex')).toBe(want);
  }
});
contractTest('wrong-code', () => {
  const catalog = copy(); const key = expected[0]!.name;
  catalog[key] = { ...catalog[key]!, statusCode: 1n };
  expect(() => verify(catalog, protocol.paymentBusinessErrorsIdlCommit)).toThrow();
});
contractTest('wrong-description', () => {
  for (const field of ['bizCodeName','source','canonicalCode','retryable'] as const) {
    const catalog = copy(); const key = expected[0]!.name;
    catalog[key] = { ...catalog[key]!, [field]: field === 'retryable' ? true : 'INVALID' };
    expect(() => verify(catalog, protocol.paymentBusinessErrorsIdlCommit)).toThrow();
  }
});
contractTest('missing-error', () => {
  for (const {name} of expected) { const catalog = copy(); delete catalog[name]; expect(() => verify(catalog, protocol.paymentBusinessErrorsIdlCommit)).toThrow(); }
});
contractTest('source-mismatch', () => {
  const catalog = copy();
  expect(() => verify(catalog, '0000000000000000000000000000000000000000')).toThrow();
});


// 固定 Go 事实不随生成来源更新；该正例来自真实 5539→fa352 工具输出，不把 fa352 当永久 current。
contractTest('metadata-only-sync', () => {
  const before = readLock(`${fixtureRoot}/provenance/before.lock`);
  const after = readLock(`${fixtureRoot}/provenance/after.lock`);
  expect(paymentSource(before, historicalBaseline).resolvedCommit).toBe(manifest.sources.idlCommit);
  expect(paymentSource(after, historicalBaseline).resolvedCommit).toBe('fa352692de4577bd1538a4175fa835b51d52dd92');
  expect(paymentSource(after, historicalBaseline).producerInputDigest).not.toBe(paymentSource(before, historicalBaseline).producerInputDigest);
  for (const lock of [before, after]) verifyGenerated(lock, historicalBaseline);
  verifyGenerated(readLock('proto-gen.lock'), currentBaseline);
  verify(protocol.paymentBusinessErrors, protocol.paymentBusinessErrorsIdlCommit);
  expect(createHash('sha256').update(readFileSync(`${fixtureRoot}/idl-errors.json`)).digest('hex')).toBe(manifest.sha256['idl-errors.json']);
  for (const [name, digest] of Object.entries(manifest.provenance.sha256)) {
    expect(createHash('sha256').update(readFileSync(`${fixtureRoot}/provenance/${name}`)).digest('hex')).toBe(digest);
  }
  for (const name of ['sync', 'status']) {
    const evidence = JSON.parse(readFileSync(`${fixtureRoot}/provenance/${name}.json`, 'utf8'));
    expect(evidence.command).toBe(`consumer ${name}`);
    expect(evidence.exitCode).toBe(0);
    expect(evidence.status).toBe(name === 'sync' ? 'synchronized' : 'up_to_date');
    expect(evidence.diagnostics).toEqual([]);
    expect(evidence.data.branch).toBe(historicalBaseline.source.requestedBranch);
    expect(evidence.data.evaluation.status).toBe('up_to_date');
    expect(evidence.data.evaluation.outputs).toEqual([{
      action: 'none', currentPath: historicalBaseline.output.path, previousPath: historicalBaseline.output.path,
      fileDiff: { added: null, changed: null, removed: null }, rootDiff: { added: null, changed: null, removed: null },
      outputId: historicalBaseline.outputId, sourceId: historicalBaseline.sourceId, ownership: 'locked', status: 'up_to_date',
    }]);
    expect(evidence.data.sources).toHaveLength(1);
    const actual = evidence.data.sources.find((source: { sourceId: string }) => source.sourceId === historicalBaseline.sourceId);
    expect(actual).toBeDefined();
    expect(actual.consumerId).toBe(historicalBaseline.source.consumerId);
    expect(actual.contractDigest).toBe(historicalBaseline.source.contractDigest);
    expect(actual.projectionDigest).toBe(historicalBaseline.source.projection.digest);
    expect(actual.projectionRoots).toEqual(historicalBaseline.source.projection.roots);
    expect(actual.files).toEqual(historicalBaseline.source.projection.files);
    expect(actual.outputs).toEqual([{ ...historicalBaseline.output, outputId: historicalBaseline.outputId, present: true }]);
    expect(actual.producerInputDigest).toBe(paymentSource(after, historicalBaseline).producerInputDigest);
    expect(actual.provenance).toMatchObject({
      requestedBranch: historicalBaseline.source.requestedBranch, resolvedBranch: historicalBaseline.source.resolvedBranch,
      fallbackUsed: false, resolvedCommit: paymentSource(after, historicalBaseline).resolvedCommit,
    });
  }
});

// 每次仅污染一个已评审字段或集合，再要求实际兼容校验拒绝，避免负例被错误事实的前置失败遮蔽。
contractTest('projection-mismatch', () => {
  const good = readLock(`${fixtureRoot}/provenance/current.lock`);
  verifyGenerated(good, currentBaseline);
  const mutations: [string, (lock: Lock) => void][] = [
    ['lockVersion', lock => { lock.lockVersion++; }],
    ['tool.version', lock => { lock.tool.version = 'invalid'; }],
    ['tool.projectionVersion', lock => { lock.tool.projectionVersion++; }],
    ['sourceId', lock => { lock.sources.wrong = paymentSource(lock, currentBaseline); delete lock.sources[currentBaseline.sourceId]; }],
    ['extra source', lock => { lock.sources.extra = structuredClone(paymentSource(lock, currentBaseline)); }],
    ['consumerId', lock => { paymentSource(lock, currentBaseline).consumerId = 'wrong'; }],
    ['contractDigest', lock => { paymentSource(lock, currentBaseline).contractDigest = 'wrong'; }],
    ['requestedBranch', lock => { paymentSource(lock, currentBaseline).requestedBranch = 'wrong'; }],
    ['resolvedBranch', lock => { paymentSource(lock, currentBaseline).resolvedBranch = 'wrong'; }],
    ['fallbackUsed', lock => { paymentSource(lock, currentBaseline).fallbackUsed = true; }],
    ['projection.digest', lock => { paymentSource(lock, currentBaseline).projection.digest = 'wrong'; }],
    ['extra root', lock => { paymentSource(lock, currentBaseline).projection.roots.push(structuredClone(currentBaseline.source.projection.roots[0]!)); }],
    ['extra file', lock => { paymentSource(lock, currentBaseline).projection.files.push(structuredClone(currentBaseline.source.projection.files[0]!)); }],
    ['outputId', lock => { const s = paymentSource(lock, currentBaseline); s.outputs.wrong = s.outputs[currentBaseline.outputId]!; delete s.outputs[currentBaseline.outputId]; }],
    ['extra output', lock => { paymentSource(lock, currentBaseline).outputs.extra = structuredClone(currentBaseline.output); }],
    ['missing output', lock => { delete paymentSource(lock, currentBaseline).outputs[currentBaseline.outputId]; }],
  ];
  for (const field of ['path', 'generator', 'profile', 'profileDigest', 'configDigest', 'treeDigest'] as const) {
    mutations.push([`output.${field}`, lock => { paymentSource(lock, currentBaseline).outputs[currentBaseline.outputId]![field] = 'wrong'; }]);
  }
  mutations.push(['output.generatorVersion', lock => { paymentSource(lock, currentBaseline).outputs[currentBaseline.outputId]!.generatorVersion++; }]);
  currentBaseline.source.projection.roots.forEach((_, index) => {
    mutations.push([`missing root ${index}`, lock => { paymentSource(lock, currentBaseline).projection.roots.splice(index, 1); }]);
    for (const field of ['id', 'kind', 'closureDigest'] as const) {
      mutations.push([`root ${index}.${field}`, lock => { paymentSource(lock, currentBaseline).projection.roots[index]![field] = 'wrong'; }]);
    }
  });
  currentBaseline.source.projection.files.forEach((file, index) => {
    mutations.push([`missing ${file.path}`, lock => { paymentSource(lock, currentBaseline).projection.files.splice(index, 1); }]);
    for (const field of ['path', 'descriptorDigest'] as const) {
      mutations.push([`${file.path}.${field}`, lock => { paymentSource(lock, currentBaseline).projection.files[index]![field] = 'wrong'; }]);
    }
    mutations.push([`${file.path} extra selectedBy`, lock => { paymentSource(lock, currentBaseline).projection.files[index]!.selectedBy.push({ kind: 'proto_file', id: 'wrong' }); }]);
    file.selectedBy.forEach((_, selectedIndex) => {
      mutations.push([`${file.path} missing selectedBy`, lock => { paymentSource(lock, currentBaseline).projection.files[index]!.selectedBy.splice(selectedIndex, 1); }]);
      for (const field of ['id', 'kind'] as const) {
        mutations.push([`${file.path} selectedBy.${field}`, lock => { paymentSource(lock, currentBaseline).projection.files[index]!.selectedBy[selectedIndex]![field] = 'wrong'; }]);
      }
    });
  });
  expect(mutations).toHaveLength(111);
  for (const [label, mutate] of mutations) {
    const lock = structuredClone(good);
    verifyGenerated(lock, currentBaseline);
    mutate(lock);
    expect(() => verifyGenerated(lock, currentBaseline), label).toThrow();
  }
});
