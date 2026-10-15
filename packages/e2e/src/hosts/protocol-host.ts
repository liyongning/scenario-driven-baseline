import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  loadProjectManifest,
  type ProjectManifest,
} from '../../../../scripts/lib/project-manifest.ts';
import { assertProtocolBundleFresh } from './freshness.ts';
import { createSharedProxy } from './proxy.ts';

export type ProtocolHost = Readonly<{
  url: string;
  runnerUrl: string;
  close(): Promise<void>;
}>;

/** 按绑定选择协议包自己的页面执行器；不按 protocolKind 分支。 */
export function protocolRunnerForBinding(
  root: string,
  manifest: ProjectManifest,
  bindingName: string,
): string {
  const binding = manifest.bindings.find((item) => item.name === bindingName);
  if (!binding) throw new Error(`project.manifest.json 未登记绑定 ${bindingName}`);
  const protocol = manifest.packages.find((item) => item.directory === binding.protocol);
  if (!protocol || protocol.role !== 'protocol')
    throw new Error(`绑定 ${bindingName} 的协议包 ${binding.protocol} 不存在`);
  const path = `${root}/packages/${protocol.directory}/testing/browser-runner.ts`;
  if (!existsSync(path))
    throw new Error(`协议包 packages/${protocol.directory} 缺少 testing/browser-runner.ts`);
  return path;
}

function viteFileUrl(path: string): string {
  return `/@fs/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** 启动只托管协议包产物的最小宿主，并为当次 Shadow 复用同源代理。 */
export async function createProtocolHost(
  options: Readonly<{
    root: string;
    bindingName: string;
    shadowUrl: string;
    manifest?: ProjectManifest;
    verifyFreshness?: (root: string, protocolDirectory: string) => void;
  }>,
): Promise<ProtocolHost> {
  const manifest = options.manifest ?? loadProjectManifest(options.root);
  const binding = manifest.bindings.find((item) => item.name === options.bindingName);
  if (!binding) throw new Error(`project.manifest.json 未登记绑定 ${options.bindingName}`);
  const runnerPath = protocolRunnerForBinding(options.root, manifest, options.bindingName);
  (options.verifyFreshness ?? assertProtocolBundleFresh)(options.root, binding.protocol);

  const vite = await createViteServer({
    root: `${options.root}/packages/e2e/host/browser`,
    appType: 'spa',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const app = express();
  app.use('/__shadow', createSharedProxy({ target: options.shadowUrl, stripPrefix: '/__shadow' }));
  app.use(vite.middlewares);
  const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('protocol host did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    runnerUrl: viteFileUrl(runnerPath),
    async close() {
      await Promise.all([
        vite.close(),
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      ]);
    },
  };
}
