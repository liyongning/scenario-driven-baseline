import { cliEvidence } from './scenario-gate-helpers.ts';
import { createAffectedFixture } from './affected-fixture.ts';

/** 020 工程证据：全量触发在真实 CLI 上退化为 `pnpm check:fast` 并打印触发原因。 */
cliEvidence(
  'SCN-SCENARIO-GATE-020',
  'full-trigger-cli',
  ['full-run-triggers', 'trigger-reason-printed'],
  async (context, check) => {
    const fixture = createAffectedFixture();
    try {
      const cases = [
        {
          path: 'project.manifest.json',
          label: '清单文件',
          content: (original: string) => `${JSON.stringify(JSON.parse(original), null, 4)}\n`,
        },
        {
          path: 'packages/e2e/src/drivers/platform.ts',
          label: '驱动目录',
          content: () => 'export const driver = 2;\n',
        },
        {
          path: 'packages/e2e/host/weapp/app.js',
          label: '宿主目录',
          content: () => 'export const app = 2;\n',
        },
        {
          path: 'proto-gen.lock',
          label: '协议来源输入',
          content: () => 'fixture changed\n',
        },
      ];
      const results = cases.map((item) => {
        const original = fixture.read(item.path);
        fixture.write(item.path, item.content(original));
        const result = fixture.run(['--dry-run']);
        fixture.write(item.path, original);
        return { ...item, result };
      });
      await check('full-run-triggers', () => {
        for (const item of results) {
          context.expect(item.result.status, item.path).toBe(0);
          context.expect(item.result.output, item.path).toContain('全量触发：pnpm check:fast');
        }
      });
      await check('trigger-reason-printed', () => {
        for (const item of results) {
          context.expect(item.result.output, item.path).toContain(item.path);
          context.expect(item.result.output, item.path).toContain(item.label);
        }
      });
    } finally {
      fixture.cleanup();
    }
  },
);
