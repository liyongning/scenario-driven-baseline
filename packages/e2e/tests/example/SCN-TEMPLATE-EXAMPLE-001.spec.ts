import { afterEach } from 'vitest';
import { createExampleClient, ExampleConfigurationError } from '@daqian/template-sdk';
import { defineCase } from '../../src/cases/define-case.ts';

const fixtureRoot = new URL('../fixtures', import.meta.url).pathname;
afterEach(() => {
  delete (globalThis as Record<string, unknown>).wx;
});

defineCase(
  {
    ownerId: 'SCN-TEMPLATE-EXAMPLE-001',
    caseId: 'node-import',
    fixtureCase: 'node-import',
    environment: 'integration',
    binding: 'sdk-idl-weapp',
    covers: [
      {
        id: 'SCN-TEMPLATE-EXAMPLE-001',
        caseKey: 'node-import',
        checks: ['platform-free-import', 'config-validated-first'],
      },
    ],
  },
  async ({ checkpoint, expect }) => {
    delete (globalThis as Record<string, unknown>).wx;
    let tokenReads = 0;
    const valid = {
      runtime: 'wechat-miniapp' as const,
      gatewayBaseUrl: 'https://fixture.invalid',
      getAccessToken: () => {
        tokenReads += 1;
        return 'token';
      },
      catalog: { kind: 'fixture', itemId: 'sku', itemName: 'Fixture', unitValue: 100n },
    };
    await checkpoint('platform-free-import', () =>
      expect(createExampleClient).toBeTypeOf('function'),
    );
    await checkpoint('config-validated-first', () => {
      expect(() => createExampleClient(valid)).not.toThrow();
      expect(() => createExampleClient({ ...valid, gatewayBaseUrl: '' })).toThrow(
        ExampleConfigurationError,
      );
      expect(tokenReads).toBe(0);
    });
  },
  { fixtureRoot },
);
