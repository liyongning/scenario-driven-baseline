import { defineStore, type Pinia } from 'pinia';
import { computed, readonly, ref } from 'vue';

/** 全局 store 对外暴露的只读状态与动作。 */
export interface ApplicationStore {
  /** 是否已完成部署配置。 */
  readonly configured: boolean;
  /** 写入部署配置；状态只能通过该动作修改。 */
  configure(apiBaseUrl: string): void;
}

/** 应用唯一的全局 setup store。 */
export const useApplicationStore: (pinia?: Pinia) => ApplicationStore = defineStore(
  'application',
  () => {
    const apiBaseUrl = ref('');
    const configured = readonly(computed(() => apiBaseUrl.value !== ''));

    function configure(value: string): void {
      apiBaseUrl.value = value;
    }

    return { configured, configure };
  },
);
