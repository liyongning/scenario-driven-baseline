import { test, type TestContext } from 'vitest';

export type CaseBinding = Readonly<{
  ownerId: string;
  caseId: string;
  checks: ReadonlyArray<string>;
  flowId?: string;
  flowCase?: string;
}>;

type ScenarioContext = Readonly<{
  expect: TestContext['expect'];
  checkpoint(name: string, assertion: () => void | Promise<void>): Promise<void>;
  flow(continuityId: string, stages: ReadonlyArray<string>): Promise<void>;
}>;

/** 只在 FLOW 两字段都登记时写入绑定；否则 Scenario 元数据不携带半套 FLOW 信息。 */
export function optionalFlowBinding(flowId?: string, flowCase?: string) {
  return {
    ...(flowId === undefined ? {} : { flowId }),
    ...(flowCase === undefined ? {} : { flowCase }),
  };
}

/** 生成并由基础测试校验的 FLOW 连续性证据。 */
export function scenarioFlowEvidence(
  binding: CaseBinding,
  continuityId: string,
  stages: ReadonlyArray<string>,
) {
  if (!binding.flowId || !binding.flowCase)
    throw new Error('flow evidence requires a flow binding');
  return JSON.stringify({
    id: binding.flowId,
    caseKey: binding.flowCase,
    continuityId,
    stages,
  });
}

/** 在基础测试上下文中写入经校验的 FLOW 连续性证据。 */
export async function recordScenarioFlow(
  context: Pick<TestContext, 'annotate'>,
  binding: CaseBinding,
  continuityId: string,
  stages: ReadonlyArray<string>,
) {
  await context.annotate(scenarioFlowEvidence(binding, continuityId, stages), 'scenario-flow');
}

/** 拒绝没有真实断言或漏执行 checkpoint 的场景用例。 */
export function validateScenarioExecution(
  caseId: string,
  checks: ReadonlyArray<string>,
  assertions: number,
  executed: ReadonlySet<string>,
) {
  if (assertions <= 0) throw new Error(`${caseId} executed no assertions`);
  for (const checkpoint of checks)
    if (!executed.has(checkpoint))
      throw new Error(`${caseId} did not execute checkpoint ${checkpoint}`);
}

/** app-unit 中登记真实断言与 Scenario checkpoint，供场景门禁消费。 */
export function scenarioTest(
  binding: CaseBinding,
  body: (context: ScenarioContext) => void | Promise<void>,
) {
  test(
    `${binding.ownerId} ${binding.caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId: binding.ownerId,
          caseId: binding.caseId,
          environment: 'app-unit',
          fixtureCase: null,
          covers: [{ id: binding.ownerId, caseKey: binding.caseId, checks: binding.checks }],
          ...optionalFlowBinding(binding.flowId, binding.flowCase),
        },
      },
    },
    async (context) => {
      const before = context.expect.getState().assertionCalls;
      const executed = new Set<string>();
      await body({
        expect: context.expect,
        async checkpoint(name, assertion) {
          await assertion();
          executed.add(name);
        },
        flow: recordScenarioFlow.bind(null, context, binding),
      });
      const assertions = context.expect.getState().assertionCalls - before;
      validateScenarioExecution(binding.caseId, binding.checks, assertions, executed);
      await context.annotate(
        JSON.stringify({ assertions, checkpoints: [...executed] }),
        'scenario-evidence',
      );
    },
  );
}
