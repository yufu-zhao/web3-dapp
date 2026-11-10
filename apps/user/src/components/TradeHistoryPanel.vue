<template>
  <section class="panel trade-history">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">RECENT ACTIVITY</span>
        <h2>{{ t("text_c2233955c3a8") }}</h2>
      </div>
      <RouterLink to="/mine/trades" class="history-link">{{
        t("text_e42579208480")
      }}</RouterLink>
    </div>
    <p v-if="!items.length" class="history-empty">
      {{ t("text_5bddc23f5fa4") }}
    </p>
    <ul v-else class="history-list">
      <li v-for="item in items" :key="item.id">
        <span>{{ item.side }}</span>
        <span>{{ item.amount }}</span>
        <time>{{ item.createdAt }}</time>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
export interface TradeHistoryItem {
  id: string;
  side: string;
  amount: string;
  createdAt: string;
}

withDefaults(defineProps<{ items?: TradeHistoryItem[] }>(), {
  items: () => [],
});
</script>

<style lang="scss" scoped>
.trade-history {
  margin-top: 18px;
  padding: 22px;
}

.history-link {
  color: var(--user-accent);
  font-size: 12px;
}

.history-empty {
  padding: 28px 0;
  color: var(--user-muted-text);
  text-align: center;
  font-size: 13px;
}

.history-list {
  display: grid;
  gap: 12px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.history-list li {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.history-list time {
  color: var(--user-muted-text);
  text-align: right;
}
</style>
