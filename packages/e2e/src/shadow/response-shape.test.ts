// @SCN-PROTOCOL-CONTRACT-006/007: 中立路由与注入校验器的引擎 side。
import { test } from 'vitest';
import type { ShadowRoute } from './routes.ts';
import { createShadowServer } from './server.ts';

type ValidationCall = Readonly<{ body: unknown; status: number }>;

function routeWith(calls: ValidationCall[], rejectUnknown = false): ShadowRoute {
  return {
    methodName: 'CreateTrade',
    httpMethod: 'POST',
    path: '/api/neutral/trade',
    validateResponse(body, status) {
      calls.push({ body, status });
      return rejectUnknown && body && typeof body === 'object' && 'unknownField' in body
        ? ['$.unknownField: unknown response field']
        : [];
    },
  };
}

function scenario(body: unknown, status?: number) {
  return {
    id: 'both-sources',
    routes: {
      CreateTrade: {
        expectedRequests: [{ body: {} }],
        steps: [{ body, ...(status === undefined ? {} : { status }) }],
      },
    },
  };
}

function constructionError(build: () => unknown): string {
  try {
    build();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected shadow construction to fail');
}

test(
  'SCN-PROTOCOL-CONTRACT-006 shadow-construction',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-006',
        caseId: 'shadow-construction',
        environment: 'test-tools-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-006',
            caseKey: 'shadow-construction',
            checks: [
              'issues-reject-construction',
              'error-location',
              'both-sources',
              'status-passed',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;

    const acceptedCalls: ValidationCall[] = [];
    const acceptedRoute = routeWith(acceptedCalls);
    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [acceptedRoute],
          scenarios: [scenario({ tradeNo: 'TN-1' })],
        }),
      )
      .not.toThrow();
    context.expect(acceptedCalls).toEqual([{ body: { tradeNo: 'TN-1' }, status: 200 }]);

    const statusCalls: ValidationCall[] = [];
    const statusRoute = routeWith(statusCalls);
    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [statusRoute],
          scenarios: [scenario({ tradeNo: 'TN-1' }, 503)],
        }),
      )
      .not.toThrow();
    context.expect(statusCalls).toEqual([{ body: { tradeNo: 'TN-1' }, status: 503 }]);

    const rejectedCalls: ValidationCall[] = [];
    const rejectedRoute = routeWith(rejectedCalls, true);
    const inlineError = constructionError(() =>
      createShadowServer({
        environmentClass: 'integration',
        routes: [rejectedRoute],
        scenarios: [scenario({ tradeNo: 'TN-1', unknownField: 'x' })],
      }),
    );
    context.expect(inlineError).toContain('both-sources/CreateTrade step 1');
    context.expect(inlineError).toContain('$.unknownField: unknown response field');
    context
      .expect(rejectedCalls)
      .toEqual([{ body: { tradeNo: 'TN-1', unknownField: 'x' }, status: 200 }]);

    const fixtureBody = JSON.parse('{"tradeNo":"TN-1","unknownField":"x"}') as unknown;
    const fixtureError = constructionError(() =>
      createShadowServer({
        environmentClass: 'integration',
        routes: [rejectedRoute],
        scenarios: [scenario(fixtureBody)],
      }),
    );
    context.expect(fixtureError).toBe(inlineError);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: [
          'issues-reject-construction',
          'error-location',
          'both-sources',
          'status-passed',
        ],
      }),
      'scenario-evidence',
    );
  },
);

test(
  'SCN-PROTOCOL-CONTRACT-007 malformed-claim-rules',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-007',
        caseId: 'malformed-claim-rules',
        environment: 'test-tools-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-007',
            caseKey: 'malformed-claim-rules',
            checks: ['claimed-skipped', 'unclaimed-rejected'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const calls: ValidationCall[] = [];
    const route = routeWith(calls, true);
    const invalid = { tradeNo: 'TN-1', unknownField: 'x' };
    const withStep = (step: Record<string, unknown>) => ({
      id: 'claim',
      routes: { CreateTrade: { expectedRequests: [{ body: {} }], steps: [step] } },
    });

    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [route],
          scenarios: [withStep({ body: invalid, malformed: { reason: 'decoder contract' } })],
        }),
      )
      .not.toThrow();
    context.expect(calls).toEqual([]);

    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [route],
          scenarios: [withStep({ body: invalid, malformed: { reason: '   ' } })],
        }),
      )
      .toThrow(/malformed reason must not be empty/);

    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [route],
          scenarios: [withStep({ body: invalid })],
        }),
      )
      .toThrow(/响应与协议不一致/);

    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [route],
          scenarios: [withStep({ rawBody: '{', contentType: 'application/json' })],
        }),
      )
      .toThrow(/rawBody 必须显式声明 malformed/);

    context
      .expect(() =>
        createShadowServer({
          environmentClass: 'integration',
          routes: [route],
          scenarios: [
            withStep({
              rawBody: '{',
              contentType: 'application/json',
              malformed: { reason: 'decoder contract' },
            }),
          ],
        }),
      )
      .not.toThrow();

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['claimed-skipped', 'unclaimed-rejected'],
      }),
      'scenario-evidence',
    );
  },
);
