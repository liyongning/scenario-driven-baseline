import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrade } from '@daqian/template-openapi/generated/operations';
import { createShadowServer } from '@template-test/shadow';
import { defineCase } from '../../src/cases/define-case.ts';
import { routesFor } from './openapi-wire.ts';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

defineCase(
  {
    ownerId: 'SCN-OPENAPI-CONTRACT-023',
    caseId: 'shadow-injection',
    fixtureCase: 'shadow-injection',
    environment: 'integration',
    covers: [
      {
        id: 'SCN-OPENAPI-CONTRACT-023',
        caseKey: 'shadow-injection',
        checks: ['engine-no-generated', 'no-loose-claim'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    const routes = routesFor([createTrade]);
    await checkpoint('engine-no-generated', () => {
      const shadowRoot = join(repositoryRoot, 'packages/e2e/src/shadow');
      const imported = readdirSync(shadowRoot)
        .filter((name) => name.endsWith('.ts'))
        .map((name) => readFileSync(join(shadowRoot, name), 'utf8'))
        .join('\n');
      expect(imported).not.toContain('@daqian/template-openapi');
      expect(() =>
        createShadowServer({
          routes,
          environmentClass: 'integration',
          scenarios: [
            {
              id: 'shadow-injection',
              routes: {
                createTrade: {
                  expectedRequests: [{ recordOnly: true }],
                  steps: [
                    {
                      body: {
                        code: 0,
                        message: 'ok',
                        data: { ...trade(), unexpected: true },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      ).toThrow(/createTrade step 1.*unexpected/s);
    });
    await checkpoint('no-loose-claim', () => {
      const issues = routes[0]?.validateResponse?.(
        { code: 0, message: 'ok', data: { ...trade(), unexpected: true } },
        200,
      );
      expect(issues?.join('\n')).toContain('unexpected');
      expect(Object.keys(routes[0] ?? {})).toEqual([
        'methodName',
        'httpMethod',
        'path',
        'validateResponse',
      ]);
    });
  },
);

function trade() {
  return { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1001 };
}
