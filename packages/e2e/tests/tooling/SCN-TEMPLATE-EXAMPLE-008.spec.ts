import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';

function execute(command: string, args: string[]) {
  return spawnSync(resolve('node_modules/.bin', command), args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

// 用例串行启动多个 depcruise/eslint 子进程，高负载下可能超过 5 秒默认超时；单独放宽到 60 秒，断言不变。
test(
  'SCN-TEMPLATE-EXAMPLE-008 dependency-violations',
  {
    timeout: 60_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-TEMPLATE-EXAMPLE-008',
        caseId: 'dependency-violations',
        environment: 'integration',
        fixtureCase: 'dependency-violations',
        covers: [
          {
            id: 'SCN-TEMPLATE-EXAMPLE-008',
            caseKey: 'dependency-violations',
            checks: [
              'example-core-isolated',
              'no-cross-domain-import',
              'new-domain-guarded',
              'restored-passes',
            ],
          },
        ],
      },
    },
  },
  async (context) => {
    const before = context.expect.getState().assertionCalls;
    const root = process.cwd();
    const sampleDomain = resolve(root, 'packages/sdk/src/sample-domain');
    const temporaryFiles = [
      resolve(root, 'packages/sdk/src/example/core/example-rule-generated.ts'),
      resolve(sampleDomain, 'contracts.ts'),
      resolve(sampleDomain, 'example-rule-cross.ts'),
      resolve(root, 'packages/sdk/src/example/example-rule-cross.ts'),
      resolve(root, 'packages/sdk/src/example/core/example-rule-wx.ts'),
      resolve(sampleDomain, 'core/domain-rule-generated.ts'),
      resolve(sampleDomain, 'core/domain-rule-wx.ts'),
      resolve(sampleDomain, 'core/domain-rule-node.ts'),
    ];
    try {
      writeFileSync(
        temporaryFiles[0]!,
        "import { BaseReq } from '@daqian/template-protocol/generated/idl/base';\nvoid BaseReq;\n",
      );
      const generated = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src/example/core/example-rule-generated.ts',
      ]);
      context.expect(generated.status).not.toBe(0);
      context.expect(generated.stdout + generated.stderr).toContain('domain-core-no-generated');
      mkdirSync(sampleDomain, { recursive: true });
      writeFileSync(temporaryFiles[1]!, 'export type SampleThing = { value: string };\n');
      writeFileSync(
        temporaryFiles[2]!,
        "import type { ExampleClient } from '../example/contracts';\nvoid (null as unknown as ExampleClient);\n",
      );
      const sampleToExample = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src/sample-domain/example-rule-cross.ts',
      ]);
      context.expect(sampleToExample.status).not.toBe(0);
      context.expect(sampleToExample.stdout + sampleToExample.stderr).toContain('domain-isolation');
      writeFileSync(
        temporaryFiles[3]!,
        "import type { SampleThing } from '../sample-domain/contracts';\nvoid (null as unknown as SampleThing);\n",
      );
      const exampleToSample = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src/example/example-rule-cross.ts',
      ]);
      context.expect(exampleToSample.status).not.toBe(0);
      context.expect(exampleToSample.stdout + exampleToSample.stderr).toContain('domain-isolation');
      writeFileSync(temporaryFiles[4]!, 'void wx;\n');
      const wx = execute('eslint', ['packages/sdk/src/example/core/example-rule-wx.ts']);
      context.expect(wx.status).not.toBe(0);
      context.expect(wx.stdout + wx.stderr).toContain('no-restricted-globals');
      // 新增业务模块不改任何门禁配置，也必须受 core/ports 守卫约束（EX-05）。
      mkdirSync(resolve(sampleDomain, 'core'), { recursive: true });
      writeFileSync(
        temporaryFiles[5]!,
        "import { BaseReq } from '@daqian/template-protocol/generated/idl/base';\nvoid BaseReq;\n",
      );
      const domainGenerated = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src/sample-domain/core/domain-rule-generated.ts',
      ]);
      context.expect(domainGenerated.status).not.toBe(0);
      context
        .expect(domainGenerated.stdout + domainGenerated.stderr)
        .toContain('domain-core-no-generated');
      writeFileSync(temporaryFiles[6]!, 'void wx;\n');
      const domainWx = execute('eslint', ['packages/sdk/src/sample-domain/core/domain-rule-wx.ts']);
      context.expect(domainWx.status).not.toBe(0);
      context.expect(domainWx.stdout + domainWx.stderr).toContain('no-restricted-globals');
      writeFileSync(
        temporaryFiles[7]!,
        "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n",
      );
      const domainNode = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src/sample-domain/core/domain-rule-node.ts',
      ]);
      context.expect(domainNode.status).not.toBe(0);
      context.expect(domainNode.stdout + domainNode.stderr).toContain('core-no-platform-or-node');
      for (const path of temporaryFiles) rmSync(path, { force: true });
      rmSync(sampleDomain, { recursive: true, force: true });
      const restored = execute('depcruise', [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
        'packages/sdk/src',
        'packages/protocol/src',
      ]);
      context.expect(restored.status).toBe(0);
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: [
            'example-core-isolated',
            'no-cross-domain-import',
            'new-domain-guarded',
            'restored-passes',
          ],
        }),
        'scenario-evidence',
      );
    } finally {
      for (const path of temporaryFiles) rmSync(path, { force: true });
      rmSync(sampleDomain, { recursive: true, force: true });
    }
  },
);
