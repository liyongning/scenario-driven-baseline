import 'vitest';

declare module 'vitest' {
  interface TaskMeta {
    scenarioCase?: Readonly<{
      ownerId: string;
      caseId: string;
      environment: string;
      binding?: string;
      fixtureCase: string | null;
      covers: ReadonlyArray<unknown>;
      flowId?: string;
      flowCase?: string;
    }>;
  }
}
