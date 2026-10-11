import { test, type TestContext } from 'vitest';
import adapter from '../packages/openapi/testing/adapter';
import { operationById } from '../packages/openapi/testing/contract';
import { checkOpenApiFixture } from '../packages/openapi/testing/fixture-check';

type Checkpoint = (name: string, assertion: () => void | Promise<void>) => Promise<void>;

function evidence(
  ownerId: string,
  caseId: string,
  checks: string[],
  body: (context: TestContext, checkpoint: Checkpoint) => Promise<void>,
) {
  test(
    `${ownerId} ${caseId}`,
    {
      meta: {
        scenarioCase: {
          ownerId,
          caseId,
          fixtureCase: null,
          environment: 'test-tools-unit',
          covers: [{ id: ownerId, caseKey: caseId, checks }],
        },
      },
    },
    async (context) => {
      const before = context.expect.getState().assertionCalls;
      const executed: string[] = [];
      await body(context, async (name, assertion) => {
        await assertion();
        executed.push(name);
      });
      context.expect(executed.sort()).toEqual([...checks].sort());
      await context.annotate(
        JSON.stringify({
          assertions: context.expect.getState().assertionCalls - before,
          checkpoints: executed,
        }),
        'scenario-evidence',
      );
    },
  );
}

const validCreateBody = {
  code: 0,
  message: 'ok',
  data: { trade_no: 'T-1', status: 'CREATED', amount: 1, merchant_id: 1 },
};

function fixtureFile(body: unknown) {
  return { 'case.json': JSON.stringify(body) };
}

evidence(
  'SCN-OPENAPI-CONTRACT-024',
  'claim-rules',
  [
    'envelopes-claim',
    'contract-claim',
    'unclaimed-rejected',
    'dangling-claim-rejected',
    'envelope-detection',
  ],
  async (context, checkpoint) => {
    await checkpoint('envelopes-claim', () => {
      const issues = checkOpenApiFixture(
        { envelopes: { '$.body': 'createTrade' } },
        fixtureFile({ body: validCreateBody }),
      );
      context.expect(issues).toEqual([]);
    });
    await checkpoint('contract-claim', () => {
      context
        .expect(checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(validCreateBody)))
        .toEqual([]);
    });
    await checkpoint('unclaimed-rejected', () =>
      context
        .expect(checkOpenApiFixture({}, fixtureFile(validCreateBody)).join('\n'))
        .toContain('未被认领'),
    );
    await checkpoint('dangling-claim-rejected', () =>
      context
        .expect(
          checkOpenApiFixture({ envelopes: { '$.body': 'createTrade' } }, fixtureFile({})).join(
            '\n',
          ),
        )
        .toContain('登记路径不存在'),
    );
    await checkpoint('envelope-detection', () => {
      context.expect(checkOpenApiFixture({}, fixtureFile({ code: '0', data: {} }))).toEqual([]);
      context
        .expect(checkOpenApiFixture({}, fixtureFile({ code: 0, data: {} })).join('\n'))
        .toContain('未被认领');
    });
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-025',
  'malformed-counter-proof',
  ['malformed-accepted', 'malformed-counter-proof', 'reason-required'],
  async (context, checkpoint) => {
    const malformed = (reason: string) => ({
      contract: 'createTrade',
      malformed: { reason },
      body: validCreateBody,
    });
    await checkpoint('malformed-accepted', () =>
      context
        .expect(
          checkOpenApiFixture(
            {},
            fixtureFile({
              contract: 'createTrade',
              malformed: { reason: 'invalid' },
              body: { code: 999, message: 'bad', data: { unknown: true } },
            }),
          ).join('\n'),
        )
        .not.toContain('malformed 实际符合接口'),
    );
    await checkpoint('malformed-counter-proof', () => {
      context
        .expect(
          checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(malformed('invalid'))).join(
            '\n',
          ),
        )
        .toContain('malformed 实际符合接口 createTrade');
    });
    await checkpoint('reason-required', () =>
      context
        .expect(
          checkOpenApiFixture(
            {},
            fixtureFile({
              contract: 'createTrade',
              malformed: { reason: '' },
              body: { invalid: true },
            }),
          ).join('\n'),
        )
        .toContain('malformed reason 不得为空'),
    );
  },
);

evidence(
  'SCN-OPENAPI-CONTRACT-026',
  'business-code-check',
  ['own-and-common-accepted', 'foreign-code-rejected', 'fixture-and-shadow-consistent'],
  async (context, checkpoint) => {
    await checkpoint('own-and-common-accepted', () => {
      const common = { code: 40001, message: 'invalid', data: {} };
      const own = {
        code: 40901,
        message: 'conflict',
        data: { trade_no: 'T', conflict_code: 'DUPLICATE_REQUEST' },
      };
      context
        .expect(checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(common)))
        .toEqual([]);
      context
        .expect(checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(own)))
        .toEqual([]);
    });
    await checkpoint('foreign-code-rejected', () => {
      const foreign = { code: 40401, message: 'not found', data: {} };
      const unknown = { code: 99999, message: 'unknown', data: {} };
      context
        .expect(checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(foreign)).join('\n'))
        .toContain('业务码 40401');
      context
        .expect(checkOpenApiFixture({ contract: 'createTrade' }, fixtureFile(unknown)).join('\n'))
        .toContain('99999');
    });
    await checkpoint('fixture-and-shadow-consistent', () => {
      const validator = adapter.responseValidator(operationById('createTrade')!)!;
      context.expect(validator(validCreateBody, 200)).toEqual([]);
      context
        .expect(validator({ code: 40401, message: 'not found', data: {} }, 200).join('\n'))
        .toContain('业务码');
    });
  },
);
