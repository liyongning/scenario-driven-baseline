import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { createRepositoryCopy } from './repository-copy.ts';
import { runPnpm } from './web-cli-helpers.ts';

const untestedVue = 'packages/web/src/Untested/Untested.vue';

cliEvidence(
  'SCN-WEB-APP-010',
  'untested-vue-cli',
  ['vitest-root-fixed', 'untested-vue-reported', 'coverage-restorable'],
  async (context, check) => {
    const copy = createRepositoryCopy({ prefix: 'web-app-010-' });
    const untestedPath = join(copy.root, untestedVue);
    try {
      await check('vitest-root-fixed', () => {
        const config = readFileSync(join(copy.root, 'packages/web/vitest.config.ts'), 'utf8');
        context.expect(config).toContain("name: 'app-unit'");
        context.expect(config).toContain("environment: 'jsdom'");
        context.expect(config).toContain("root: fileURLToPath(new URL('../..', import.meta.url))");
      });
      await check('untested-vue-reported', () => {
        mkdirSync(dirname(untestedPath), { recursive: true });
        writeFileSync(untestedPath, '<template><p>untested</p></template>\n');
        const build = runPnpm(copy, ['build']);
        context.expect(build.status, build.output).toBe(0);
        const result = runPnpm(copy, ['test:unit']);
        context.expect(result.status, result.output).not.toBe(0);
        context.expect(result.output).toContain('Untested.vue');
        context.expect(result.output).toMatch(/coverage|Coverage/);
        const coverage = runPnpm(copy, ['check:coverage']);
        context.expect(coverage.status, coverage.output).not.toBe(0);
        context.expect(coverage.output).toContain('Untested.vue');
      });
      await check('coverage-restorable', () => {
        rmSync(untestedPath, { force: true });
        const tests = runPnpm(copy, ['test:unit']);
        context.expect(tests.status, tests.output).toBe(0);
        const coverage = runPnpm(copy, ['check:coverage']);
        context.expect(coverage.status, coverage.output).toBe(0);
      });
    } finally {
      copy.cleanup();
    }
  },
  { timeoutMs: 240_000 },
);
