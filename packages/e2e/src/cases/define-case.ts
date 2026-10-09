import { resolve } from 'node:path';
import { test, type TestContext } from 'vitest';
import { loadFixtureCase } from './fixture-loader.ts';
import { loadProjectManifest } from '../../../../scripts/lib/project-manifest.ts';

export type CaseBinding = Readonly<{
  ownerId: string;
  caseId: string;
  environment: string;
  fixtureCase: string;
  covers: ReadonlyArray<Readonly<{ id: string; caseKey: string; checks: ReadonlyArray<string> }>>;
  flowId?: string;
  flowCase?: string;
}>;

/** 用例可以运行的运行环境类别：集成项目与平台项目；unit 项目不承载公共行为证据。 */
export type CaseEnvironmentClass = 'integration' | 'platform';

/** 按清单解析用例声明的运行环境；未登记或属于 unit 类时返回 undefined。 */
export function environmentClassOf(
  environment: string,
  root = process.cwd(),
): CaseEnvironmentClass | undefined {
  const project = loadProjectManifest(root).testProjects.find((item) => item.name === environment);
  if (!project || project.class === 'unit') return undefined;
  return project.class;
}

export function validateCaseBinding(binding: CaseBinding): string[] {
  const issues: string[] = [];
  if (!/^[A-Z][A-Z0-9-]*$/.test(binding.ownerId)) issues.push('ownerId is invalid');
  if (!binding.caseId) issues.push('caseId must not be empty');
  if (!binding.fixtureCase) issues.push('fixtureCase must not be empty');
  if (!environmentClassOf(binding.environment))
    issues.push(
      `environment ${binding.environment} is not a registered integration or platform test project`,
    );
  if (binding.covers.length === 0)
    issues.push('covers must contain at least one concrete case binding');
  binding.covers.forEach((cover, index) => {
    if (!cover.id || !cover.caseKey)
      issues.push(`covers[${index}] must identify an id and caseKey`);
    if (cover.checks.length === 0) issues.push(`covers[${index}].checks must not be empty`);
  });
  if ((binding.flowId === undefined) !== (binding.flowCase === undefined))
    issues.push('flowId and flowCase must be provided together');
  return issues;
}

type CaseContext = Readonly<{
  fixture: unknown;
  environmentClass: CaseEnvironmentClass;
  expect: TestContext['expect'];
  checkpoint(name: string, assertion: () => void | Promise<void>): Promise<void>;
  flow(continuityId: string, stages: readonly string[]): Promise<void>;
}>;

/** 在 Vitest 上登记具体 case、绑定和真实断言证据，不引入第二个 runner。 */
export function defineCase(
  binding: CaseBinding,
  body: (context: CaseContext) => void | Promise<void>,
  options: Readonly<{ fixtureRoot?: string }> = {},
) {
  const issues = validateCaseBinding(binding);
  if (issues.length > 0) throw new Error(issues.join('; '));
  const environmentClass = environmentClassOf(binding.environment)!;
  test(
    `${binding.ownerId} ${binding.caseId}`,
    { meta: { scenarioCase: binding } },
    async (context: TestContext) => {
      const before = context.expect.getState().assertionCalls;
      const executed = new Set<string>();
      const loaded = await loadFixtureCase({
        root: options.fixtureRoot ?? resolve(process.cwd(), 'packages/e2e/tests/fixtures'),
        ownerId: binding.ownerId,
        caseKey: binding.fixtureCase,
      });
      await body({
        fixture: loaded.data,
        environmentClass,
        expect: context.expect,
        async checkpoint(name, assertion) {
          await assertion();
          executed.add(name);
        },
        async flow(continuityId, stages) {
          if (!binding.flowId || !binding.flowCase)
            throw new Error('flow evidence requires a FLOW binding');
          await context.annotate(
            JSON.stringify({ id: binding.flowId, caseKey: binding.flowCase, continuityId, stages }),
            'scenario-flow',
          );
        },
      });
      const assertions = context.expect.getState().assertionCalls - before;
      if (assertions <= 0) throw new Error(`${binding.caseId} executed no assertions`);
      const required = new Set(binding.covers.flatMap((cover) => cover.checks));
      for (const checkpoint of required)
        if (!executed.has(checkpoint))
          throw new Error(`${binding.caseId} did not execute checkpoint ${checkpoint}`);
      await context.annotate(
        JSON.stringify({ assertions, checkpoints: [...executed] }),
        'scenario-evidence',
      );
    },
  );
}
