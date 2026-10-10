// @SCN-PROTOCOL-CONTRACT-009: 标准生成器按北京时间生成且不依赖宿主时区。
import { execFileSync } from 'node:child_process';
import { test, vi } from 'vitest';
import { createRequestId } from './request-id.ts';

const moduleUrl = new URL('./request-id.ts', import.meta.url).href;

/** 固定时钟：UTC 2025-12-31 16:00:00.000，即北京时间 2026-01-01 00:00:00.000（跨日期边界）。 */
const boundaryMs = Date.UTC(2025, 11, 31, 16, 0, 0, 0);
/** 可控随机源：字节 [0,1,25,26,51,52] 映射为小写字母 abzaza。 */
const fixedBytes = [0, 1, 25, 26, 51, 52];

/** 在指定 TZ 的子进程里调用生成器，证明结果与宿主时区无关。 */
function runInTimezone(tz: string): string {
  const script = [
    `const { createRequestId } = await import(${JSON.stringify(moduleUrl)});`,
    `process.stdout.write(createRequestId(new Date(${boundaryMs}), (length) => Uint8Array.from([${fixedBytes.join(', ')}]).slice(0, length)));`,
  ].join('\n');
  return execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, TZ: tz },
  });
}

test(
  'SCN-PROTOCOL-CONTRACT-009 generator-non-beijing-tz',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-009',
        caseId: 'generator-non-beijing-tz',
        fixtureCase: null,
        environment: 'protocol-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-009',
            caseKey: 'generator-non-beijing-tz',
            checks: ['beijing-time', 'tz-independent', 'random-suffix', 'fixed-length'],
          },
        ],
      },
    },
  },
  (context) => {
    const assertionsBefore = context.expect.getState().assertionCalls;
    const fixedRandom = (length: number) => Uint8Array.from(fixedBytes).slice(0, length);
    const utc = runInTimezone('UTC');
    const losAngeles = runInTimezone('America/Los_Angeles');

    // beijing-time：UTC 16:00 之后按 UTC+8 已跨到次日，日期部分正确。
    context.expect(utc).toBe('20260101_000000_000_abzaza');
    // tz-independent：非 +8 宿主时区下结果一致。
    context.expect(losAngeles).toBe(utc);
    // fixed-length：恰好 26 个字符。
    context.expect(utc).toHaveLength(26);
    // random-suffix：末尾 6 位来自注入的随机源，全为小写字母。
    context.expect(utc.slice(-6)).toBe('abzaza');
    context.expect(createRequestId(new Date(boundaryMs), fixedRandom)).toBe(utc);

    // 默认随机源是 Math.random（PC-05 修订）：未注入随机源时仍生成新值，格式不变。
    const randomSpy = vi.spyOn(Math, 'random');
    const generate = () => createRequestId(new Date(boundaryMs));
    context.expect(generate()).toMatch(/^\d{8}_\d{6}_\d{3}_[a-z]{6}$/);
    context.expect(generate()).not.toBe(generate());
    context.expect(randomSpy).toHaveBeenCalled();
    randomSpy.mockRestore();

    context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - assertionsBefore,
        checkpoints: ['beijing-time', 'tz-independent', 'random-suffix', 'fixed-length'],
      }),
      'scenario-evidence',
    );
  },
);
