import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { writeProtocolManifest } from '../../../../scripts/lib/protocol-manifest.ts';
import { createEngineeringFormRoot } from '../../tests/tooling/engineering-form-fixture.ts';
import { createProtocolHost, protocolRunnerForBinding } from './protocol-host.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'protocol-host-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/openapi/testing'), { recursive: true });
  mkdirSync(join(root, 'packages/protocol/testing'), { recursive: true });
  writeFileSync(join(root, 'packages/openapi/testing/browser-runner.ts'), 'export {};');
  const manifest = {
    packages: [
      { directory: 'openapi', role: 'protocol', protocolKind: 'openapi' },
      { directory: 'protocol', role: 'protocol', protocolKind: 'idl' },
      { directory: 'e2e', role: 'test' },
    ],
    bindings: [
      { name: 'web-openapi-browser', protocol: 'openapi' },
      { name: 'sdk-idl-weapp', protocol: 'protocol' },
      { name: 'missing-protocol', protocol: 'missing' },
      { name: 'invalid-role', protocol: 'e2e' },
    ],
  } as unknown as ProjectManifest;
  return { root, manifest };
}

test(
  'SCN-BROWSER-PLATFORM-003 protocol-host-runner-selection',
  {
    meta: {
      scenarioCase: {
        ownerId: 'SCN-BROWSER-PLATFORM-003',
        caseId: 'protocol-host-runner-selection',
        fixtureCase: null,
        environment: 'test-tools-unit',
        covers: [
          {
            id: 'SCN-BROWSER-PLATFORM-003',
            caseKey: 'protocol-host-runner-selection',
            checks: ['runner-by-binding', 'runner-missing-rejected'],
          },
        ],
      },
    },
  },
  async (context) => {
    const input = fixture();
    context
      .expect(protocolRunnerForBinding(input.root, input.manifest, 'web-openapi-browser'))
      .toBe(join(input.root, 'packages/openapi/testing/browser-runner.ts'));
    context
      .expect(() => protocolRunnerForBinding(input.root, input.manifest, 'sdk-idl-weapp'))
      .toThrow(/packages\/protocol.*browser-runner\.ts/);
    await context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls,
        checkpoints: ['runner-by-binding', 'runner-missing-rejected'],
      }),
      'scenario-evidence',
    );
  },
);

test('protocol host reports binding errors and starts a real Vite host with defaults', async () => {
  const input = fixture();
  expect(() => protocolRunnerForBinding(input.root, input.manifest, 'missing')).toThrow(
    /未登记绑定/,
  );
  expect(() => protocolRunnerForBinding(input.root, input.manifest, 'missing-protocol')).toThrow(
    /不存在/,
  );
  expect(() => protocolRunnerForBinding(input.root, input.manifest, 'invalid-role')).toThrow(
    /不存在/,
  );
  await expect(
    createProtocolHost({
      root: input.root,
      bindingName: 'missing',
      shadowUrl: 'http://127.0.0.1:1',
      manifest: input.manifest,
      verifyFreshness: () => undefined,
    }),
  ).rejects.toThrow(/未登记绑定/);

  const root = createEngineeringFormRoot(undefined, {
    'packages/web-protocol/testing/browser-runner.ts': 'export {};\n',
    'packages/e2e/host/browser/index.html': '<!doctype html><title>browser host</title>\n',
  });
  try {
    const manifest = loadProjectManifest(root.root);
    const protocol = manifest.packages.find((item) => item.directory === 'web-protocol')!;
    writeProtocolManifest(root.root, manifest, protocol);
    const host = await createProtocolHost({
      root: root.root,
      bindingName: 'web-product-binding',
      shadowUrl: 'http://127.0.0.1:1',
    });
    expect(host.runnerUrl).toContain('browser-runner.ts');
    const response = await fetch(host.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('browser host');
    await host.close();
  } finally {
    root.cleanup();
  }
});
