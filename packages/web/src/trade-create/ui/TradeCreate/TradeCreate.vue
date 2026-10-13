<script setup lang="ts">
import { computed, ref } from 'vue';
import LoadingFailure from '../../../shared/components/LoadingFailure/LoadingFailure.vue';
import LoadingIndicator from '../../../shared/components/LoadingIndicator/LoadingIndicator.vue';
import { createDisplayState, type CreateDisplayState } from '../../core/display';
import type { CreateTradePort } from '../../ports';
import AmountField from './components/AmountField/AmountField.vue';

const props = defineProps<
  Readonly<{
    merchantId: number;
    createTrade: CreateTradePort;
  }>
>();
const emit = defineEmits<Readonly<{ created: [trade: import('../../../runtime/domain').Trade] }>>();

const amount = ref('');
const state = ref<CreateDisplayState>({ kind: 'idle' });
const submitting = ref(false);
const displayText = computed(() => createDisplayState(state.value));

async function submit(): Promise<void> {
  if (submitting.value || !/^\d+$/.test(amount.value)) {
    if (!/^\d+$/.test(amount.value)) state.value = { kind: 'failure', outcome: 'invalid-request' };
    return;
  }
  submitting.value = true;
  const result = await props.createTrade.submit({
    merchantId: props.merchantId,
    amount: Number(amount.value),
    channel: 'WEB',
  });
  if (result.kind === 'success') {
    state.value = { kind: 'success', trade: result.trade };
    emit('created', result.trade);
  } else if (result.kind === 'business-failure') {
    state.value = { kind: 'failure', outcome: result.outcome };
  } else {
    state.value = { kind: 'transport-failure' };
  }
  submitting.value = false;
}
</script>

<template>
  <section class="trade-create" aria-labelledby="create-title">
    <h2 id="create-title">创建交易</h2>
    <form @submit.prevent="submit">
      <AmountField v-model="amount" />
      <button data-testid="create-submit" type="submit" :disabled="submitting">创建</button>
    </form>
    <LoadingIndicator v-if="submitting" />
    <LoadingFailure v-else-if="state.kind === 'transport-failure'" />
    <p v-show="state.kind !== 'transport-failure'" data-testid="create-result">{{ displayText }}</p>
  </section>
</template>

<style scoped src="./TradeCreate.css"></style>
