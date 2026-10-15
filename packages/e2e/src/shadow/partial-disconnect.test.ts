import { request } from 'node:http';
import { afterEach, test } from 'vitest';
import type { ShadowRoute } from './routes.ts';
import { createShadowServer, type RunningShadowServer } from './server.ts';

const routes: ShadowRoute[] = [
  { methodName: 'Partial', httpMethod: 'POST', path: '/api/faults/partial' },
  { methodName: 'ZeroByte', httpMethod: 'POST', path: '/api/faults/zero-byte' },
];

const running: RunningShadowServer[] = [];
afterEach(async () => Promise.all(running.splice(0).map((server) => server.close())));

type RawResult = Readonly<{
  status?: number | undefined;
  bytes: Buffer;
  error?: Error | undefined;
}>;

function rawPost(url: string, path: string): Promise<RawResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RawResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const outgoing = request(
      new URL(path, url),
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (incoming) => {
        const chunks: Buffer[] = [];
        let responseError: Error | undefined;
        incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        incoming.on('error', (error) => {
          responseError = error;
        });
        incoming.on('aborted', () => {
          responseError ??= new Error('response aborted');
        });
        incoming.on('close', () =>
          finish({
            status: incoming.statusCode,
            bytes: Buffer.concat(chunks),
            ...(responseError ? { error: responseError } : {}),
          }),
        );
      },
    );
    outgoing.on('error', (error) => finish({ bytes: Buffer.alloc(0), error }));
    outgoing.end('{}');
  });
}

test(
  'SCN-PROTOCOL-CONTRACT-020 partial-disconnect-fault',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-020',
        caseId: 'partial-disconnect-fault',
        environment: 'test-tools-unit',
        fixtureCase: null,
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-020',
            caseKey: 'partial-disconnect-fault',
            checks: ['partial-then-destroyed', 'zero-byte-contrast', 'fault-recorded'],
          },
        ],
      },
    },
  },
  async (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const server = await createShadowServer({
      environmentClass: 'integration',
      routes,
      scenarios: [
        {
          id: 'faults',
          routes: {
            Partial: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ body: { state: 'partial' }, partialThenDisconnect: true }],
            },
            ZeroByte: {
              expectedRequests: [{ recordOnly: true }],
              steps: [{ disconnect: true }],
            },
          },
        },
      ],
    }).start();
    running.push(server);

    const partial = await rawPost(server.url, '/api/faults/partial');
    context.expect(partial.status).toBe(200);
    context.expect(partial.bytes.length).toBeGreaterThan(0);
    context.expect(() => JSON.parse(partial.bytes.toString('utf8'))).toThrow();
    context.expect(partial.error).toBeDefined();

    const zeroByte = await rawPost(server.url, '/api/faults/zero-byte');
    context.expect(zeroByte.status).toBeUndefined();
    context.expect(zeroByte.bytes).toHaveLength(0);
    context.expect(zeroByte.error).toBeDefined();

    context.expect(server.records()).toHaveLength(2);
    context
      .expect(server.records().map((record) => record.methodName))
      .toEqual(['Partial', 'ZeroByte']);
    context.expect(server.verify()).toEqual([]);

    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['partial-then-destroyed', 'zero-byte-contrast', 'fault-recorded'],
      }),
      'scenario-evidence',
    );
  },
);
