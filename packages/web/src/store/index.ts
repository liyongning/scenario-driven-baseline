import { defineStore, type Pinia } from 'pinia';
import { computed, readonly, ref } from 'vue';
// web-example:begin
import type { Trade } from '../runtime/domain';
// web-example:end

/** 全局 store 对外暴露的只读状态与动作。 */
export interface ApplicationStore {
  /** 是否已完成部署配置。 */
  readonly configured: boolean;
  // web-example:begin
  /** 当前部署环境解析出的网关基地址。 */
  readonly apiBaseUrl: string;
  /** 跨交易状态与列表模块共享的当前交易。 */
  readonly currentTrade: Trade | null;
  /** 当前异步请求代际；旧代际结果不得提交。 */
  readonly generation: number;
  /** 主动取消请求的累计次数，供导航语义审计。 */
  readonly abortCount: number;
  // web-example:end
  /** 写入部署配置；状态只能通过该动作修改。 */
  configure(apiBaseUrl: string): void;
  // web-example:begin
  /** 直接设置当前交易，主要用于创建响应。 */
  setCurrentTrade(trade: Trade): void;
  /** 开启新代际，并在开始时取消上一代际仍绑定的请求。 */
  beginAttempt(cancelPending?: () => void): number;
  /** 仅当代际仍有效时提交轮询结果。 */
  commitAttempt(generation: number, trade: Trade): boolean;
  /** 取消当前请求代际，供导航和组件卸载使用。 */
  cancelPending(): void;
  /** 清空当前交易。 */
  clearCurrentTrade(): void;
  // web-example:end
}

/** 应用唯一的全局 setup store。 */
export const useApplicationStore: (pinia?: Pinia) => ApplicationStore = defineStore(
  'application',
  () => {
    const apiBaseUrl = ref('');
    // web-example:begin
    const currentTrade = ref<Trade | null>(null);
    const generation = ref(0);
    const abortCount = ref(0);
    let activeCancel: (() => void) | undefined;
    // web-example:end
    const configured = readonly(computed(() => apiBaseUrl.value !== ''));

    function configure(value: string): void {
      apiBaseUrl.value = value;
    }

    // web-example:begin
    function setCurrentTrade(trade: Trade): void {
      currentTrade.value = trade;
    }

    function beginAttempt(cancelPending: () => void = () => {}): number {
      activeCancel?.();
      generation.value += 1;
      activeCancel = cancelPending;
      return generation.value;
    }

    function commitAttempt(attempt: number, trade: Trade): boolean {
      if (attempt !== generation.value) return false;
      currentTrade.value = trade;
      return true;
    }

    function cancelPending(): void {
      activeCancel?.();
      activeCancel = undefined;
      generation.value += 1;
      abortCount.value += 1;
    }

    function clearCurrentTrade(): void {
      currentTrade.value = null;
    }
    // web-example:end

    return {
      configured,
      // web-example:begin
      apiBaseUrl: readonly(apiBaseUrl),
      currentTrade: readonly(currentTrade),
      generation: readonly(generation),
      abortCount: readonly(abortCount),
      // web-example:end
      configure,
      // web-example:begin
      setCurrentTrade,
      beginAttempt,
      commitAttempt,
      cancelPending,
      clearCurrentTrade,
      // web-example:end
    };
  },
);
