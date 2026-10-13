<script setup lang="ts">
import AmountInput from './components/AmountInput/AmountInput.vue';

defineProps<Readonly<{ modelValue: string }>>();
const emit = defineEmits<Readonly<{ 'update:modelValue': [value: string] }>>();
</script>

<template>
  <label class="amount-field">
    <span>交易金额（分）</span>
    <AmountInput
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </label>
</template>

<style scoped src="./AmountField.css"></style>
