import { createExampleClient, type ExampleResourceRef } from '@daqian/template-sdk';

type Input = Readonly<{
  action: 'create-success' | 'observe-completed' | 'normal';
  gatewayBaseUrl: string;
  accessToken: string;
  ownerId?: string;
  externalRef: string;
  units?: number;
  resourceId?: string;
}>;

/** 示例小程序宿主只调用生产 SDK；其网络端口由 SDK 装配真实 wx.request。 */
export async function runExampleCase(input: Input) {
  const client = createExampleClient({
    runtime: 'wechat-miniapp',
    gatewayBaseUrl: input.gatewayBaseUrl,
    getAccessToken: () => input.accessToken,
    catalog: { kind: 'fixture', itemId: 'sku', itemName: 'Fixture', unitValue: 100n },
    policy: { requestTimeoutMs: 10_000, intervalMs: 10, windowMs: 10_000 },
  });
  if (input.action === 'observe-completed') {
    const reference: ExampleResourceRef = {
      id: input.resourceId ?? '',
      externalRef: input.externalRef,
    };
    return { outcome: await client.observe(reference) };
  }
  const created = await client.create({
    ownerId: input.ownerId ?? '',
    externalRef: input.externalRef,
    units: input.units ?? 0,
  });
  if (input.action === 'create-success' || !created.ok) return { created };
  return { created, outcome: await client.observe(created.reference) };
}
