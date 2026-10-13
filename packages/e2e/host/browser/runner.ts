export {};

type BrowserPlanStep = Readonly<{
  method: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  cancel?: 'before-send' | 'in-flight';
}>;

type BrowserRunner = Readonly<{
  run(
    plan: ReadonlyArray<BrowserPlanStep>,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>>;
}>;

type BrowserHost = Readonly<{
  run(
    plan: ReadonlyArray<BrowserPlanStep>,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>>;
  renderImage(source: string): Promise<number>;
}>;

declare global {
  interface Window {
    __browserHost: BrowserHost;
  }
}

const runnerUrl = new URLSearchParams(globalThis.location.search).get('runner');
if (!runnerUrl) throw new Error('协议宿主缺少 testing/browser-runner.ts 地址');
const runnerPromise = import(/* @vite-ignore */ runnerUrl) as Promise<BrowserRunner>;

globalThis.window.__browserHost = {
  async run(plan, options = {}) {
    const runner = await runnerPromise;
    return runner.run(plan, options);
  },
  async renderImage(source) {
    const image = globalThis.document.querySelector<HTMLImageElement>('#fixture-image');
    if (!image) throw new Error('浏览器宿主缺少 #fixture-image');
    image.src = source;
    await image.decode();
    return image.naturalWidth;
  },
};
