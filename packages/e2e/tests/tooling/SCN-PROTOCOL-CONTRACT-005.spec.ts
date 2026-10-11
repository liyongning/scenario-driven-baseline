import { cliEvidence, runGate } from './scenario-gate-helpers.ts';
import { declarationRoot } from './declaration-fixture.ts';

type InventoryOutput = Readonly<{ issues?: string[] }>;

const emptyDeclaration = 'export const consumedOperations: ReadonlyArray<never> = [];\n';

/** 只调用 CreateTrade 的产品源码：声明里的 FastCharge 因此没有对应调用。 */
const tradeOnlyCaller = [
  "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  '',
  'declare const client: { request(meta: unknown, request: unknown, context: unknown): Promise<unknown> };',
  '',
  'export const createTrade = () => client.request(CreateTrade.meta, {}, {});',
  '',
].join('\n');

/** 两种未声明调用形式：`X.meta` 属性访问，以及把生成方法描述直接作为参数（FastCharge 不在 trade.ts）。 */
const undeclaredCaller = [
  "import { CreateTrade } from '@daqian/template-protocol/generated/idl/infra/trade/v1/trade';",
  "import { FastCharge } from '@daqian/template-protocol/generated/idl/infra/pay/v1/pay';",
  '',
  'declare const client: { request(meta: unknown, request: unknown, context: unknown): Promise<unknown> };',
  '',
  'const tradeMeta = CreateTrade.meta;',
  '',
  'export const createTrade = () => client.request(tradeMeta, {}, {});',
  'export const fastCharge = () => client.request(FastCharge, {}, {});',
  '',
].join('\n');

const issuesOf = (output: InventoryOutput | undefined) => output?.issues ?? [];
const reconciliation = (issues: ReadonlyArray<string>) =>
  issues.filter((issue) => issue.startsWith('未使用的声明') || issue.startsWith('未声明的调用'));

cliEvidence(
  'SCN-PROTOCOL-CONTRACT-005',
  'declaration-gate-cli',
  ['unused-declaration', 'undeclared-call', 'gate-fails'],
  async (context, check) => {
    const consistent = declarationRoot({ prefix: 'template-contract-005-consistent-' });
    const unused = declarationRoot({
      caller: tradeOnlyCaller,
      prefix: 'template-contract-005-unused-',
    });
    const undeclared = declarationRoot({
      declaration: emptyDeclaration,
      caller: undeclaredCaller,
      prefix: 'template-contract-005-undeclared-',
    });
    try {
      const consistentResult = runGate(consistent.root, ['--inventory']);
      const unusedResult = runGate(unused.root, ['--inventory']);
      const undeclaredResult = runGate(undeclared.root, ['--inventory']);
      const consistentIssues = issuesOf(consistentResult.output as InventoryOutput | undefined);
      const unusedIssues = issuesOf(unusedResult.output as InventoryOutput | undefined);
      const undeclaredIssues = issuesOf(undeclaredResult.output as InventoryOutput | undefined);

      await check('unused-declaration', () => {
        // 声明与调用一致时不报对账问题；声明了但没有调用的方法被报出并指出位置。
        context.expect(reconciliation(consistentIssues)).toEqual([]);
        context.expect(unusedIssues.join('\n')).toContain('未使用的声明：FastCharge');
        context
          .expect(unusedIssues.join('\n'))
          .toContain('packages/sdk/src/consumed-operations.ts');
      });
      await check('undeclared-call', () => {
        // 两种形式都被识别，且识别不限于 trade.ts 中的方法。
        context.expect(undeclaredIssues.join('\n')).toContain('未声明的调用：CreateTrade');
        context.expect(undeclaredIssues.join('\n')).toContain('未声明的调用：FastCharge');
        context.expect(undeclaredIssues.join('\n')).toContain('packages/sdk/src/caller.ts');
      });
      await check('gate-fails', () => {
        // 存在未使用的声明或未声明的调用时场景门禁因该问题失败。
        context.expect(unusedResult.status).not.toBe(0);
        context.expect(undeclaredResult.status).not.toBe(0);
        context.expect(reconciliation(unusedIssues).length).toBeGreaterThan(0);
        context.expect(reconciliation(undeclaredIssues).length).toBeGreaterThan(0);
      });
    } finally {
      consistent.cleanup();
      unused.cleanup();
      undeclared.cleanup();
    }
  },
);
