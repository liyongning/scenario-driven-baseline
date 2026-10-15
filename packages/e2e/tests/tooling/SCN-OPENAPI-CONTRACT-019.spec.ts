import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import adapter from '../../../openapi/testing/adapter.ts';
import { contractName, operationById } from '../../../openapi/testing/contract.ts';
import { cliEvidence } from './scenario-gate-helpers.ts';
import { repositoryRoot } from './helpers.ts';

function guideDocumentsUnimplemented(content: string): boolean {
  return [
    'x-implemented: false',
    '开发代理连接真实服务端时',
    '未实现错误',
    'pnpm preview:local',
  ].every((text) => content.includes(text));
}

cliEvidence(
  'SCN-OPENAPI-CONTRACT-019',
  'unimplemented-hint-gate',
  ['not-blocking', 'guide-documented'],
  async (context, check) => {
    await check('not-blocking', () => {
      const warnings: string[] = [];
      const original = console.warn;
      console.warn = (...values: unknown[]) => warnings.push(values.map(String).join(' '));
      const issues: string[] = [];
      try {
        const result = adapter.deriveObligations({
          operation: {
            key: 'cancelTrade',
            prefix: contractName,
            methodName: 'cancelTrade',
            httpMethod: 'post',
            path: '/api/v1/trades/{trade_no}/cancel',
            requestFields: {},
            position: 'SCN-OPENAPI-CONTRACT-019.spec.ts:1',
            meta: operationById('cancelTrade'),
          },
          checker: undefined,
          program: undefined,
          protocolSrc: join(repositoryRoot, 'packages/openapi/src'),
          requiredIn: ['integration', 'browser'],
          integrationOnly: ['integration'],
          issues,
        });
        context.expect(warnings.join('\n')).toContain('cancelTrade');
        context.expect(issues).toEqual([]);
        context.expect(result.obligations.length).toBeGreaterThan(0);
      } finally {
        console.warn = original;
      }
    });

    await check('guide-documented', () => {
      const guide = readFileSync(join(repositoryRoot, 'docs/template-guide.md'), 'utf8');
      context.expect(guideDocumentsUnimplemented(guide)).toBe(true);
      context
        .expect(guideDocumentsUnimplemented(guide.replace('开发代理连接真实服务端时', '开发代理')))
        .toBe(false);
    });
  },
);
