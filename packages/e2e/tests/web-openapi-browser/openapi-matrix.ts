import {
  createFetchHttp,
  createRestClient,
  type Identity,
  type RestOperation,
  type SecurityScheme,
} from '@daqian/template-openapi';
import { createShadowServer } from '@template-test/shadow';
import { routesFromOpenApiOperations } from '../../../openapi/testing/shadow-routes.ts';

export type OpenApiMatrixPlan = Readonly<{
  input?: Readonly<{
    path?: Readonly<Record<string, unknown>>;
    query?: Readonly<Record<string, unknown>>;
    header?: Readonly<Record<string, string>>;
    body?: unknown;
  }>;
  responses: ReadonlyArray<unknown>;
}>;

export type OpenApiMatrixOptions = Readonly<{
  methods: ReadonlyArray<Readonly<{ name: string }>>;
  operations: ReadonlyArray<RestOperation>;
  plans: Readonly<Record<string, OpenApiMatrixPlan>>;
  securitySchemes: Readonly<Record<string, SecurityScheme>>;
  identity?: Identity;
}>;

function operationMap(operations: ReadonlyArray<RestOperation>) {
  return new Map(operations.map((operation) => [operation.meta.id, operation]));
}

/** 按声明产物遍历接口，经协议包公共客户端与真实 fetch 逐项执行。 */
export async function runOpenApiMatrix(options: OpenApiMatrixOptions) {
  const available = operationMap(options.operations);
  const selected = options.methods.map((method) => {
    const operation = available.get(method.name);
    if (!operation) throw new Error(`generated operation ${method.name} is missing`);
    return operation;
  });
  const routes = routesFromOpenApiOperations(selected, options.operations);
  const plans = new Map(
    selected.map((operation) => {
      const plan = options.plans[operation.meta.id];
      if (!plan || plan.responses.length === 0)
        throw new Error(`matrix plan ${operation.meta.id} is missing responses`);
      return [operation.meta.id, plan] as const;
    }),
  );
  const server = await createShadowServer({
    routes,
    environmentClass: 'integration',
    scenarios: [
      {
        id: 'openapi-matrix',
        routes: Object.fromEntries(
          selected.map((operation) => [
            operation.meta.id,
            {
              expectedRequests: [{ recordOnly: true }],
              steps: plans.get(operation.meta.id)!.responses.map((body) => ({ body })),
            },
          ]),
        ),
      },
    ],
  }).start();
  try {
    const client = createRestClient({
      gatewayBaseUrl: server.url,
      http: createFetchHttp(),
      securitySchemes: options.securitySchemes,
      ...(options.identity ? { identity: options.identity } : {}),
    });
    const results = [];
    for (const operation of selected)
      results.push(await client.request(operation, plans.get(operation.meta.id)!.input));
    return {
      methods: selected.map((operation) => operation.meta.id),
      results,
      records: server.records(),
      verify: server.verify(),
    };
  } finally {
    await server.close();
  }
}
