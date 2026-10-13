import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test, type TestContext } from 'vitest';
import type {} from '../packages/e2e/src/vitest.d.ts';
import {
  cleanupArchitectureFixtures,
  createArchitectureFixture as fixture,
} from '../packages/e2e/tests/tooling/check-architecture-fixture.ts';
import { checkArchitecture } from './check-architecture';

afterEach(cleanupArchitectureFixtures);

function evidence(
  id: string,
  caseId: string,
  checks: string[],
  body: (
    context: TestContext,
    check: (name: string, assertion: () => void | Promise<void>) => Promise<void>,
  ) => Promise<void>,
) {
  test(
    `${id} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: id,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id, caseKey: caseId, checks }],
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
  'SCN-TEMPLATE-ENGINEERING-012',
  'architecture-doc-rules',
  ['architecture-present-and-linked', 'capability-sections', 'architecture-links-resolve'],
  async (context, check) => {
    await check('architecture-present-and-linked', async () => {
      const missing = fixture();
      rmSync(join(missing, 'docs/architecture.md'));
      context.expect(await checkArchitecture(missing, 0)).toContain('missing docs/architecture.md');

      const unlinked = fixture();
      writeFileSync(join(unlinked, 'AGENTS.md'), '# facts\n');
      writeFileSync(join(unlinked, 'README.md'), '# facts\n');
      const errors = await checkArchitecture(unlinked, 0);
      context.expect(errors).toContain('AGENTS.md does not link docs/architecture.md');
      context.expect(errors).toContain('README.md does not link docs/architecture.md');
    });

    await check('capability-sections', async () => {
      const root = fixture();
      const guide = readFileSync(join(root, 'docs/template-guide.md'), 'utf8');
      writeFileSync(
        join(root, 'docs/template-guide.md'),
        guide.replace(
          '| Web 示例 | 临时根占位 | 无 |',
          '| Web 示例 | 临时根占位 | 无 |\n| 未登记能力 | 临时根占位 | 无 |',
        ),
      );
      context
        .expect(await checkArchitecture(root, 0))
        .toContain('docs/architecture.md: missing capability section 未登记能力');

      const noTable = fixture();
      writeFileSync(
        join(noTable, 'docs/template-guide.md'),
        '# 指南\n\n## 能力地图\n\n（缺表格）\n',
      );
      context
        .expect(await checkArchitecture(noTable, 0))
        .toContain('docs/template-guide.md: capability map table not found');
    });

    await check('architecture-links-resolve', async () => {
      const root = fixture();
      writeFileSync(
        join(root, 'docs/architecture.md'),
        `${readFileSync(join(root, 'docs/architecture.md'), 'utf8')}\n[存在](template-guide.md)、[缺失](missing.md)\n`,
      );
      const errors = await checkArchitecture(root, 0);
      context
        .expect(errors.filter((error) => error.startsWith('broken link')))
        .toEqual(['broken link docs/architecture.md -> missing.md']);
    });
  },
);
