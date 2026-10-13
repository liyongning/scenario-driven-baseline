<script setup lang="ts">
import type { Trade } from '../../../../../runtime/domain';

defineProps<Readonly<{ items: ReadonlyArray<Trade> }>>();

function statusLabel(status: Trade['status']): string {
  if (status === 'SUCCEEDED') return '已完成';
  if (status === 'FAILED') return '失败';
  if (status === 'CANCELLED') return '已取消';
  return '进行中';
}
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>交易号</th>
        <th>状态</th>
        <th>金额</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in items" :key="item.trade_no">
        <td>{{ item.trade_no }}</td>
        <td>{{ statusLabel(item.status) }}</td>
        <td>{{ item.amount }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped src="./TradeTable.css"></style>
