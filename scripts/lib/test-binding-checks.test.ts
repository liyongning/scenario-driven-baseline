import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { ProjectManifest } from './project-manifest.ts';
import { checkTestBindingDeclarations } from './test-binding-checks.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const manifest = {
  packages: [
    { directory: 'product-a', name: '@scope/product-a', role: 'product' },
    { directory: 'product-b', name: '@scope/product-b', role: 'product' },
    { directory: 'protocol-a', name: '@scope/protocol-a', role: 'protocol' },
    { directory: 'shared-protocol', name: '@scope/shared-protocol', role: 'protocol' },
    { directory: 'e2e', name: '@scope/e2e', role: 'test' },
  ],
  bindings: [
    { name: 'b1', product: 'product-a', protocol: 'protocol-a', platforms: [] },
    { name: 'b2', product: 'product-b', protocol: 'shared-protocol', platforms: [] },
    { name: 'b3', product: 'product-b', protocol: 'shared-protocol', platforms: [] },
  ],
} as unknown as ProjectManifest;

function writeSpec(root: string, path: string, source: string) {
  const target = join(root, 'packages/e2e/tests', path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}

test('requires binding declarations for imports of binding-exclusive packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'test-binding-checks-'));
  roots.push(root);
  writeSpec(
    root,
    'tooling/exact.spec.ts',
    "import '@scope/protocol-a';\nconst x = { binding: 'b1' };\n",
  );
  writeSpec(
    root,
    'tooling/subpath.spec.ts',
    "import '@scope/protocol-a/testing/adapter';\nexport { value } from '@scope/protocol-a/testing/adapter';\n",
  );
  writeSpec(root, 'tooling/local.spec.ts', "import '/tmp/packages/protocol-a/src/index';\n");
  writeSpec(
    root,
    'tooling/string-key.spec.ts',
    "import '@scope/protocol-a';\nconst x = { 'binding': 'b1' };\n",
  );
  writeSpec(root, 'tooling/shared.spec.ts', "import '@scope/shared-protocol';\n");
  writeSpec(
    root,
    'tooling/invalid-import.spec.ts',
    'import value from protocolA;\nexport { value };\nconst object = { binding };\n',
  );
  writeSpec(
    root,
    'b1/directory.spec.ts',
    "import '@scope/protocol-a/testing/adapter';\nconst object = { binding: other };\n",
  );
  writeSpec(
    root,
    'tooling/non-binding.spec.ts',
    'const key = "binding";\nconst object = { [key]: "b1", value() {}, other: "b1" };\n',
  );

  expect(checkTestBindingDeclarations(root, manifest)).toEqual([
    'packages/e2e/tests/tooling/local.spec.ts: imports binding-exclusive package protocol-a without binding b1',
    'packages/e2e/tests/tooling/subpath.spec.ts: imports binding-exclusive package protocol-a without binding b1',
  ]);
});
