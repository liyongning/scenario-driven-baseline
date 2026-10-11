import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenarioConfig, matchesAny, validateScenarioConfig } from './scenario-config.ts';

describe('scenario config', () => {
  it('loads configured formats and validates malformed regexes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-config-'));
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'scenario-gate.config.json'),
      JSON.stringify({
        scenarioIdPatterns: ['^SCN-'],
        flowIdPatterns: ['^FLOW-'],
        ownerIdPattern: '^[A-Z]+$',
      }),
    );
    const config = await loadScenarioConfig(root);
    expect(matchesAny('SCN-1', config.scenarioIdPatterns)).toBe(true);
    expect(validateScenarioConfig({ ...config, flowIdPatterns: ['['] })).toContain(
      'flowIdPatterns contains invalid pattern [',
    );
    expect(validateScenarioConfig({ ...config, scenarioIdPatterns: [] })).toContain(
      'scenarioIdPatterns must contain at least one pattern',
    );
    expect(validateScenarioConfig({ ...config, flowIdPatterns: [] })).toContain(
      'flowIdPatterns must contain at least one pattern',
    );
    expect(validateScenarioConfig({ ...config, ownerIdPattern: '[' })).toContain(
      'ownerIdPattern is invalid',
    );
    expect(validateScenarioConfig({ ...config, scenarioIdPatterns: ['['] })).toContain(
      'scenarioIdPatterns contains invalid pattern [',
    );
    expect(validateScenarioConfig({ ...config, scenarioIdPatterns: null as never })).toContain(
      'scenarioIdPatterns must contain at least one pattern',
    );
    expect(matchesAny('BAD-1', config.scenarioIdPatterns)).toBe(false);
  });

  it('uses fallback patterns only when config is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-config-'));
    const fallback = await loadScenarioConfig(root);
    expect(matchesAny('SCN-TEMPLATE-EXAMPLE-001', fallback.scenarioIdPatterns)).toBe(true);
    expect(matchesAny('FLOW-TEMPLATE-EXAMPLE-001', fallback.flowIdPatterns)).toBe(true);
    await writeFile(
      join(root, 'scenario-gate.config.json'),
      JSON.stringify({
        $schema: './scenario-gate.config.schema.json',
        scenarioIdPatterns: ['^SCN-'],
        flowIdPatterns: ['^FLOW-'],
        ownerIdPattern: '^[A-Z]+$',
      }),
    );
    expect(await loadScenarioConfig(root)).toEqual({
      $schema: './scenario-gate.config.schema.json',
      scenarioIdPatterns: ['^SCN-'],
      flowIdPatterns: ['^FLOW-'],
      ownerIdPattern: '^[A-Z]+$',
    });
    await writeFile(join(root, 'scenario-gate.config.json'), '{invalid');
    await expect(loadScenarioConfig(root)).rejects.toThrow('Expected property name');
    await writeFile(
      join(root, 'scenario-gate.config.json'),
      JSON.stringify({
        scenarioIdPatterns: ['^SCN-'],
        flowIdPatterns: ['^FLOW-'],
        ownerIdPattern: '^[A-Z]+$',
        extra: true,
      }),
    );
    await expect(loadScenarioConfig(root)).rejects.toThrow('does not match schema');
  });
});
