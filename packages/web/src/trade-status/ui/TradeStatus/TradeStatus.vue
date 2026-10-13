<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import LoadingFailure from '../../../shared/components/LoadingFailure/LoadingFailure.vue';
import LoadingIndicator from '../../../shared/components/LoadingIndicator/LoadingIndicator.vue';
import { createPoller } from '../../../runtime/poller';
import type { ClockPort, VisibilityPort } from '../../../runtime/ports';
import { isTerminalTrade } from '../../../runtime/domain';
import { useApplicationStore } from '../../../store';
import type { TradeStatusPort } from '../../ports';

/** 交易状态组件由应用装配点注入的运行时端口。 */
interface StatusRuntime {
  readonly clock: ClockPort;
  readonly visibility: VisibilityPort;
  readonly createCancellation: () => Readonly<{
    port: import('../../../runtime/ports').CancellationPort;
    cancel: () => void;
  }>;
}

const props = defineProps<Readonly<{ getTrade: TradeStatusPort; runtime: StatusRuntime }>>();
const applicationStore = useApplicationStore();
const loading = ref(false);
const failed = ref(false);
const label = computed(() => {
  const status = applicationStore.currentTrade?.status;
  if (status === 'SUCCEEDED') return '已完成';
  if (status === 'FAILED') return '失败';
  if (status === 'CANCELLED') return '已取消';
  if (status === 'CREATED' || status === 'PROCESSING') return '进行中';
  return '暂无交易';
});

let poller: ReturnType<typeof createPoller> | undefined;
let cancellation: ReturnType<StatusRuntime['createCancellation']> | undefined;

watch(
  () => applicationStore.currentTrade?.trade_no,
  () => {
    poller?.stop();
    cancellation?.cancel();
    poller = undefined;
    cancellation = undefined;
    const trade = applicationStore.currentTrade;
    if (!trade || isTerminalTrade(trade)) {
      loading.value = false;
      failed.value = false;
      return;
    }
    const attempt = applicationStore.beginAttempt();
    cancellation = props.runtime.createCancellation();
    loading.value = true;
    failed.value = false;
    poller = createPoller({
      clock: props.runtime.clock,
      visibility: props.runtime.visibility,
      cancellation: cancellation.port,
      intervalMs: 100,
      query: () => props.getTrade.get(trade.trade_no),
      isTerminal: (result) => result.kind === 'success' && isTerminalTrade(result.trade),
      onValue: (result) => {
        if (result.kind === 'success') {
          applicationStore.commitAttempt(attempt, result.trade);
          loading.value = !isTerminalTrade(result.trade);
        } else {
          loading.value = false;
          failed.value = true;
        }
      },
    });
    poller.start();
  },
  { immediate: true },
);

onUnmounted(() => {
  poller?.stop();
  cancellation?.cancel();
});
</script>

<template>
  <section class="trade-status" aria-live="polite">
    <h2>交易状态</h2>
    <p data-testid="trade-status">{{ label }}</p>
    <LoadingIndicator v-if="loading" />
    <LoadingFailure v-else-if="failed" />
  </section>
</template>

<style scoped src="./TradeStatus.css"></style>
