<script setup lang="ts">
import { computed } from 'vue';
import { useApplicationStore } from '../../store';
// web-example:begin
import type { ClockPort, VisibilityPort } from '../../runtime/ports';
import TradeCreate from '../../trade-create/ui/TradeCreate/TradeCreate.vue';
import type { CreateTradePort } from '../../trade-create/ports';
import TradeList from '../../trade-list/ui/TradeList/TradeList.vue';
import type { TradeListPort } from '../../trade-list/ports';
import TradeStatus from '../../trade-status/ui/TradeStatus/TradeStatus.vue';
import type { TradeStatusPort } from '../../trade-status/ports';
import type { ApplicationContext } from '../platform';
// web-example:end

// web-example:begin
let ready = false;

/** 应用装配点注入的浏览器运行时端口。 */
interface AppRuntime {
  readonly clock: ClockPort;
  readonly visibility: VisibilityPort;
  readonly createCancellation: () => Readonly<{
    port: import('../../runtime/ports').CancellationPort;
    cancel: () => void;
  }>;
}

const props = defineProps<
  Readonly<{
    context?: ApplicationContext;
    createTrade?: CreateTradePort;
    getTrade?: TradeStatusPort;
    listTrades?: TradeListPort;
    runtime?: AppRuntime;
  }>
>();
ready = Boolean(
  props.context && props.createTrade && props.getTrade && props.listTrades && props.runtime,
);
// web-example:end

const applicationStore = useApplicationStore();
const configured = computed(() => applicationStore.configured);
</script>

<template>
  <main data-testid="app-root">
    <h1>模板 Web 应用</h1>
    <p>
      {{ configured ? '应用已配置' : '应用未配置' }}
    </p>
    <!-- web-example:begin -->
    <template v-if="ready">
      <p data-testid="context-token">{{ context?.token }}</p>
      <TradeCreate
        :merchant-id="context!.merchantId"
        :create-trade="createTrade!"
        @created="applicationStore.setCurrentTrade"
      />
      <TradeStatus :get-trade="getTrade!" :runtime="runtime!" />
      <TradeList :merchant-id="context!.merchantId" :list-trades="listTrades!" />
      <p data-testid="current-trade">
        {{ applicationStore.currentTrade?.trade_no ?? '无当前交易' }}
      </p>
    </template>
    <!-- web-example:end -->
  </main>
</template>

<style scoped src="./AppRoot.css"></style>
