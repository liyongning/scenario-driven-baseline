<script setup lang="ts">
import { ref } from 'vue';

defineProps<Readonly<{ modelValue: string }>>();
const emit = defineEmits<Readonly<{ 'update:modelValue': [value: string] }>>();

const focused = ref(false);

function update(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    class="amount-input"
    data-testid="amount-input"
    inputmode="numeric"
    :value="modelValue"
    @focus="focused = true"
    @blur="focused = false"
    @input="update"
  />
</template>

<style scoped src="./AmountInput.css"></style>
