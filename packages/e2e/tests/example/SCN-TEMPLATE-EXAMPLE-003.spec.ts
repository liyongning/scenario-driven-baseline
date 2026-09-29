import { afterEach } from 'vitest';
import { defineCase } from '../../src/cases/define-case.ts';
import { exampleClient, exampleServer, installWx, type ExampleServer } from './example-harness.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
let restore: (() => void) | undefined;
let server: ExampleServer | undefined;
afterEach(async () => { restore?.(); restore = undefined; await server?.close(); server = undefined; });

defineCase({ ownerId: 'SCN-TEMPLATE-EXAMPLE-003', caseId: 'invalid-input', fixtureCase: 'invalid-input', environment: 'integration', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-003', caseKey: 'invalid-input', checks: ['input-before-request'] }] }, async ({ checkpoint, expect }) => {
  server = await exampleServer('invalid-input', {});
  restore = installWx();
  const result = await exampleClient(server.url).create({ ownerId: 'not-an-int64', externalRef: '', units: 0 });
  await checkpoint('input-before-request', () => { expect(result).toMatchObject({ ok: false, error: { category: 'invalid_input' } }); expect(server!.records()).toHaveLength(0); });
}, { fixtureRoot });

defineCase({ ownerId: 'SCN-TEMPLATE-EXAMPLE-003', caseId: 'create-failures', fixtureCase: 'create-failures', environment: 'integration', covers: [{ id: 'SCN-TEMPLATE-EXAMPLE-003', caseKey: 'create-failures', checks: ['error-category', 'server-code-preserved', 'no-auto-retry'] }] }, async ({ checkpoint, expect }) => {
  server = await exampleServer('create-failures', { CreateTrade: { expectedRequests: [{ recordOnly: true }], steps: [{ body: { baseResp: { statusCode: '10100801003070' } } }] } });
  restore = installWx();
  const result = await exampleClient(server.url).create({ ownerId: '42', externalRef: 'example-003', units: 1 });
  await checkpoint('error-category', () => expect(result).toMatchObject({ ok: false, error: { category: 'server' } }));
  await checkpoint('server-code-preserved', () => expect(result).toMatchObject({ ok: false, error: { serverCode: '10100801003070' } }));
  await checkpoint('no-auto-retry', () => expect(server!.records()).toHaveLength(1));
}, { fixtureRoot });
