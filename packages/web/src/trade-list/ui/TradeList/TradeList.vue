<script setup lang="ts">
import { ref, watch } from 'vue';
import LoadingFailure from '../../../shared/components/LoadingFailure/LoadingFailure.vue';
import LoadingIndicator from '../../../shared/components/LoadingIndicator/LoadingIndicator.vue';
import { isTerminalTrade, type Trade } from '../../../runtime/domain';
import { useApplicationStore } from '../../../store';
import type { TradeListPort } from '../../ports';
import TradeTable from './components/TradeTable/TradeTable.vue';

const props = defineProps<Readonly<{ merchantId: number; listTrades: TradeListPort }>>();
const applicationStore = useApplicationStore();
const items = ref<ReadonlyArray<Trade>>([]);
const loading = ref(false);
const failed = ref(false);

watch(
  () => applicationStore.currentTrade,
  async (trade) => {
    if (!trade || !isTerminalTrade(trade)) return;
    loading.value = true;
    failed.value = false;
    const result = await props.listTrades.list(props.merchantId);
    loading.value = false;
    if (result.kind === 'success') items.value = result.items;
    else failed.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <section class="trade-list" data-testid="trade-list">
    <h2>交易列表</h2>
    <LoadingIndicator v-if="loading" />
    <LoadingFailure v-else-if="failed" />
    <TradeTable v-else :items="items" />
  </section>
</template>

<style scoped src="./TradeList.css"></style>
