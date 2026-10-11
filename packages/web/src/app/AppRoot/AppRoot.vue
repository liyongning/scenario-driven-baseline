<script setup lang="ts">
import { computed } from 'vue';
import { useApplicationStore } from '../../store';

const applicationStore = useApplicationStore();
const configured = computed(() => applicationStore.configured);
</script>

<template>
  <main data-testid="app-root">
    <h1>模板 Web 应用</h1>
    <p>{{ configured ? '应用已配置' : '应用未配置' }}</p>
  </main>
</template>

<style scoped src="./AppRoot.css"></style>
