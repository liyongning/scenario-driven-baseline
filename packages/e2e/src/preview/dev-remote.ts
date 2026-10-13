import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { loadProjectManifest, packagesByRole } from '../../../../scripts/lib/project-manifest.ts';
import { loadWebConfig } from '../hosts/web-config.ts';

export type DevRemoteSession = Readonly<{
  url: string;
  close(): Promise<void>;
}>;

/** 启动真实开发代理；目标地址只从调用时传入的环境快照读取。 */
export async function startDevRemote(
  options: Readonly<{
    root: string;
    env: Readonly<Record<string, string | undefined>>;
    host?: string;
    port?: number;
    log?: (message: string) => void;
    createViteServer?: (options: Parameters<typeof createViteServer>[0]) => Promise<ViteDevServer>;
  }>,
): Promise<DevRemoteSession> {
  const target = options.env.DEV_REMOTE_TARGET;
  if (typeof target !== 'string' || target.trim() === '')
    throw new Error('需要设置 DEV_REMOTE_TARGET 才能启动开发代理');
  const config = loadWebConfig(options.root);
  const manifest = loadProjectManifest(options.root);
  const web = packagesByRole(manifest, 'product').find((item) => item.form === 'web-app');
  if (!web) throw new Error('project.manifest.json 没有登记 web-app 产品包');
  const proxy = Object.fromEntries(
    config.proxyPrefixes.map((prefix) => [prefix, { target: target.trim(), changeOrigin: true }]),
  );
  const vite = await (options.createViteServer ?? createViteServer)({
    root: `${options.root}/packages/${web.directory}`,
    server: {
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 0,
      strictPort: true,
      proxy,
    },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') {
    await vite.close();
    throw new Error('开发代理没有绑定端口');
  }
  const url = `http://${options.host ?? '127.0.0.1'}:${address.port}/`;
  (options.log ?? console.log)(`开发代理已启动：${url}`);
  let closed = false;
  return {
    url,
    async close() {
      if (closed) return;
      closed = true;
      await vite.close();
    },
  };
}
