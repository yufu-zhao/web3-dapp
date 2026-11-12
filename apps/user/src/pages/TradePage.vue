<template>
  <TradePanel :token-symbol="tokenSymbol" />
</template>

<script setup lang="ts">
import { inject } from "vue";
import { userPageStateKey } from "../composables/user-page-state";
import TradePanel from "../components/TradePanel.vue";
const { tokenSymbol } = inject(userPageStateKey)!;
</script>
