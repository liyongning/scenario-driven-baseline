import { createGeneration, type Generation } from './generation';
import type { CancellationPort, ClockPort, VisibilityPort } from './ports';

/** 轮询器依赖的运行时端口与查询函数；实现不得直接读取浏览器全局。 */
export type PollerOptions<Value> = Readonly<{
  /** 延迟调度使用的时钟。 */
  clock: ClockPort;
  /** 页面可见性端口；隐藏时暂停，恢复后立即查询。 */
  visibility: VisibilityPort;
  /** 当前作用域的取消端口。 */
  cancellation: CancellationPort;
  /** 每次查询前用于判断结果是否仍属于当前请求的代际。 */
  generation?: Generation;
  /** 两次查询之间的延迟，单位毫秒。 */
  intervalMs: number;
  /** 执行一次有界查询。 */
  query: () => Promise<Value>;
  /** 判断查询结果是否已经到达终态。 */
  isTerminal: (value: Value) => boolean;
  /** 向业务层交付仍有效的查询结果。 */
  onValue: (value: Value) => void;
  /** 查询失败时向业务层报告；未提供时由调用方自行处理。 */
  onError?: (error: unknown) => void;
}>;

/** 一次轮询会话的控制接口。 */
export interface Poller {
  /** 启动查询；重复调用不创建第二个调度循环。 */
  start(): void;
  /** 停止查询并清空当前定时器与订阅。 */
  stop(): void;
  /** 会话是否仍处于活动状态；隐藏暂停期间仍为 true。 */
  isRunning(): boolean;
}

/** 使用注入时钟、可见性与取消端口执行有界轮询，不依赖真实时间或浏览器全局。 */
export function createPoller<Value>(options: PollerOptions<Value>): Poller {
  const generation = options.generation ?? createGeneration();
  let timer: number | undefined;
  let stopped = false;
  let started = false;
  let unsubscribeCancellation: (() => void) | undefined;
  let unsubscribeVisibility: (() => void) | undefined;

  function clearTimer() {
    if (timer === undefined) return;
    options.clock.clearTimeout(timer);
    timer = undefined;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimer();
    unsubscribeCancellation?.();
    unsubscribeVisibility?.();
  }

  function schedule() {
    if (stopped || options.cancellation.isCancelled() || !options.visibility.isVisible()) return;
    clearTimer();
    timer = options.clock.setTimeout(() => {
      timer = undefined;
      void run();
    }, options.intervalMs);
  }

  async function run(): Promise<void> {
    if (stopped || options.cancellation.isCancelled()) {
      stop();
      return;
    }
    if (!options.visibility.isVisible()) return;
    const sequence = generation.current();
    try {
      const value = await options.query();
      if (stopped || options.cancellation.isCancelled() || !generation.isCurrent(sequence)) {
        stop();
        return;
      }
      options.onValue(value);
      if (options.isTerminal(value)) {
        stop();
        return;
      }
      schedule();
    } catch (error) {
      if (stopped || options.cancellation.isCancelled() || !generation.isCurrent(sequence)) {
        stop();
        return;
      }
      options.onError?.(error);
      schedule();
    }
  }

  return {
    start() {
      if (started || stopped || options.cancellation.isCancelled()) return;
      started = true;
      unsubscribeCancellation = options.cancellation.subscribe(stop);
      unsubscribeVisibility = options.visibility.subscribe((visible) => {
        if (visible) void run();
        else clearTimer();
      });
      if (options.visibility.isVisible()) void run();
    },
    stop,
    isRunning: () => !stopped,
  };
}
