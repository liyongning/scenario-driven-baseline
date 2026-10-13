/** 运行时辅助读取单调时钟与调度延迟任务；实现由应用装配层注入。 */
export interface ClockPort {
  /** 返回当前单调时间，单位毫秒。 */
  now(): number;
  /** 注册一个延迟回调，并返回可传给 `clearTimeout` 的句柄。 */
  setTimeout(callback: () => void, delayMs: number): number;
  /** 取消尚未触发的延迟回调。 */
  clearTimeout(handle: number): void;
}

/** 运行时辅助读取页面可见性；不可见期间暂停后台查询。 */
export interface VisibilityPort {
  /** 当前页面是否可见。 */
  isVisible(): boolean;
  /** 订阅可见性变化，并返回取消订阅函数。 */
  subscribe(listener: (visible: boolean) => void): () => void;
}

/** 运行时辅助读取取消状态；取消后不得再交付异步结果。 */
export interface CancellationPort {
  /** 当前作用域是否已经取消。 */
  isCancelled(): boolean;
  /** 订阅一次或多次取消通知，并返回取消订阅函数。 */
  subscribe(listener: () => void): () => void;
}
