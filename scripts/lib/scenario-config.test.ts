import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenarioConfig, matchesAny, validateScenarioConfig } from './scenario-config.ts';

describe('scenario config', () => {
  it('loads configured formats and validates malformed regexes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-config-'));
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'scenario-gate.config.json'), JSON.stringify({ scenarioIdPatterns: ['^SCN-'], flowIdPatterns: ['^FLOW-'], ownerIdPattern: '^[A-Z]+$' }));
    const config = await loadScenarioConfig(root);
    expect(matchesAny('SCN-1', config.scenarioIdPatterns)).toBe(true);
    expect(validateScenarioConfig({ ...config, flowIdPatterns: ['['] })).toContain('flowIdPatterns contains invalid pattern [');
  });
});
