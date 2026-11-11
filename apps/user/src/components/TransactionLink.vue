<template>
  <a v-if="url" :href="url" target="_blank" rel="noopener noreferrer" :title="hash" class="transaction-link">
    {{ shortHash }}
    <q-icon name="open_in_new" size="14px" />
  </a>
  <span v-else :title="hash" class="transaction-link">{{ shortHash }}</span>
</template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ hash: string; chainId: number }>();
const shortHash = computed(() => `${props.hash.slice(0, 10)}…${props.hash.slice(-8)}`);
// 仅对明确支持的链生成浏览器链接，避免将交易发送到错误网络。
const url = computed(() => {
  if (!/^0x[\da-f]{64}$/i.test(props.hash)) return null;
  const base: Record<number, string> = {
    56: "https://bscscan.com",
    97: "https://testnet.bscscan.com",
  };
  return base[props.chainId] ? `${base[props.chainId]}/tx/${props.hash}` : null;
});
</script>
<style scoped lang="scss">
.transaction-link {
  color: var(--user-accent);
  font-size: 12px;
  white-space: nowrap;
}
</style>
