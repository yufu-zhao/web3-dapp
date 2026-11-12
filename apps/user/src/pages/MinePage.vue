<template>
  <section class="account-banner panel">
    <div>
      <span class="icon-box"><q-icon name="account_balance_wallet" /></span>
      <div>
        <h2>{{ t("text_6c2eb6ceec1d") }}</h2>
        <p>{{ t("text_bc9757b1b80e") }}</p>
      </div>
    </div>
    <span class="pill">{{ t("text_6dd4fc575bcc") }}</span>
  </section>
  <div class="mine-layout">
    <DesktopServiceMenu :features="serviceFeatures" active-key="overview" />
    <MobileServiceGrid :features="serviceFeatures" />
    <section class="panel mine-overview">
      <h2>{{ t("text_eefb2470b9a8") }}</h2>
      <p>{{ t("text_3b0fa708d39e") }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { userPageStateKey } from "../composables/user-page-state";
import DesktopServiceMenu from "../components/DesktopServiceMenu.vue";
import MobileServiceGrid from "../components/MobileServiceGrid.vue";
const { t, serviceFeatures } = inject(userPageStateKey)!;
</script>
