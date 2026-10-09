import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

test(
  'SCN-TEMPLATE-EXAMPLE-007 core-neutrality',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-007',
        caseId: 'core-neutrality',
        environment: 'integration',
        fixtureCase: 'core-neutrality',
        covers: [
          { id: 'SCN-TEMPLATE-EXAMPLE-007', caseKey: 'core-neutrality', checks: ['core-neutral'] },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const root = process.cwd();
    const core = readFileSync(resolve(root, 'packages/sdk/src/example/core/client.ts'), 'utf8');
    const ports = readFileSync(resolve(root, 'packages/sdk/src/example/ports/backend.ts'), 'utf8');
    context.expect(core).not.toMatch(/TradeStatus|CreateTrade|QueryTrade|GoodsType|generated/);
    const imports = [...core.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]);
    context
      .expect(imports)
      .toEqual(
        context.expect.arrayContaining([
          '../contracts',
          '../ports/backend',
          '@daqian/template-protocol',
        ]),
      );
    context
      .expect(
        imports?.every(
          (path) =>
            path === '../contracts' ||
            path === '../ports/backend' ||
            path === '@daqian/template-protocol',
        ),
      )
      .toBe(true);
    context
      .expect(ports)
      .not.toMatch(/TradeStatus|CreateTrade|QueryTrade|GoodsType|generated|\bwx\b/);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['core-neutral'],
      }),
      'scenario-evidence',
    );
  },
);
