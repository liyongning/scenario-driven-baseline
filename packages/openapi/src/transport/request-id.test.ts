import { execFileSync } from 'node:child_process';
import { test, vi } from 'vitest';
import { createRequestId, REQUEST_ID_PATTERN } from './request-id';

const moduleUrl = new URL('./request-id.ts', import.meta.url).href;
const boundaryMs = Date.UTC(2025, 11, 31, 16, 0, 0, 0);
const fixedBytes = [0, 1, 25, 26, 51, 52];

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
  'SCN-PROTOCOL-CONTRACT-009 openapi-generator-non-beijing-tz',
  {
    timeout: 30_000,
    meta: {
      scenarioCase: {
        ownerId: 'SCN-PROTOCOL-CONTRACT-009',
        caseId: 'openapi-generator-non-beijing-tz',
        fixtureCase: null,
        environment: 'openapi-unit',
        covers: [
          {
            id: 'SCN-PROTOCOL-CONTRACT-009',
            caseKey: 'openapi-generator-non-beijing-tz',
            checks: ['beijing-time', 'tz-independent', 'random-suffix', 'fixed-length'],
          },
        ],
      },
    },
  },
  (context) => {
    const before = context.expect.getState().assertionCalls;
    const utc = runInTimezone('UTC');
    const losAngeles = runInTimezone('America/Los_Angeles');
    context.expect(utc).toBe('20260101_000000_000_abzaza');
    context.expect(losAngeles).toBe(utc);
    context.expect(utc).toHaveLength(26);

    const randomSpy = vi.spyOn(Math, 'random');
    const generated = createRequestId(new Date(boundaryMs));
    context.expect(generated).toMatch(REQUEST_ID_PATTERN);
    context.expect(generated).toHaveLength(26);
    context.expect(randomSpy).toHaveBeenCalled();
    randomSpy.mockRestore();

    context.annotate(
      JSON.stringify({
        assertions: context.expect.getState().assertionCalls - before,
        checkpoints: ['beijing-time', 'tz-independent', 'random-suffix', 'fixed-length'],
      }),
      'scenario-evidence',
    );
  },
);
