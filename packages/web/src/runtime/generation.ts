/** 可失效的代际计数器，用于丢弃旧异步结果。 */
export interface Generation {
  /** 读取当前代际号。 */
  current(): number;
  /** 开始新代际并返回其代际号。 */
  next(): number;
  /** 判断某个代际号是否仍然是当前代际。 */
  isCurrent(value: number): boolean;
  /** 使当前代际失效，后续提交会被拒绝。 */
  invalidate(): void;
}

/** 创建从 0 开始、只向前的代际计数器。 */
export function createGeneration(): Generation {
  let value = 0;
  return {
    current: () => value,
    next: () => ++value,
    isCurrent: (candidate) => candidate === value,
    invalidate: () => {
      value += 1;
    },
  };
}
