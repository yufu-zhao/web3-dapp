<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="page-shell flex flex-center">
        <main class="starter-card">
          <div class="brand-mark" aria-hidden="true">{{ brandMark }}</div>
          <p class="eyebrow">{{ systemName }}</p>
          <h1>用户端</h1>
          <p class="description">
            {{ systemName }} · {{ tokenName }}（{{ tokenSymbol }}） ·
            {{ chainLabel }}
          </p>
          <p v-if="configError" class="config-error">{{ configError }}</p>
          <q-badge color="positive" text-color="dark" class="status-badge">
            <q-icon name="check_circle" size="16px" class="q-mr-xs" />
            运行就绪
          </q-badge>
        </main>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  loadPublicInstallationConfig,
  type PublicInstallationConfig,
} from "@filereset/shared-types";

const identity = ref<PublicInstallationConfig | null>(null);
const configError = ref("");
const systemName = computed(() => identity.value?.systemName || "FileReset");
const tokenName = computed(() => identity.value?.tokenName || "FileReset");
const tokenSymbol = computed(() => identity.value?.tokenSymbol || "FRC");
const brandMark = computed(
  () => Array.from(systemName.value.trim()).slice(0, 2).join("") || "FR",
);
const chainLabel = computed(() =>
  identity.value?.chainId
    ? `ChainId ${identity.value.chainId}`
    : "目标链在首次完整部署成功后锁定",
);

watch(
  systemName,
  (value) => {
    document.title = `${value} 用户端`;
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    identity.value = await loadPublicInstallationConfig();
  } catch (error) {
    configError.value =
      error instanceof Error ? error.message : "无法读取安装身份配置。";
  }
});
</script>

<style lang="scss" scoped>
.page-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(
      circle at 18% 15%,
      rgba(255, 200, 50, 0.12),
      transparent 32%
    ),
    radial-gradient(
      circle at 84% 86%,
      rgba(52, 211, 153, 0.08),
      transparent 30%
    ),
    #111827;
}

.starter-card {
  width: min(100%, 560px);
  padding: clamp(28px, 7vw, 56px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: rgba(17, 24, 39, 0.86);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
  text-align: center;
}

.brand-mark {
  display: grid;
  width: 56px;
  height: 56px;
  margin: 0 auto 24px;
  border-radius: 18px;
  background: #ffc832;
  color: #111827;
  font-size: 18px;
  font-weight: 800;
  place-items: center;
}

.eyebrow {
  margin: 0 0 8px;
  color: #ffc832;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(28px, 6vw, 40px);
  font-weight: 700;
}

.description {
  margin: 14px 0 24px;
  color: #cbd5e1;
  line-height: 1.7;
}

.config-error {
  margin: 0;
  color: #ffc832;
  font-size: 12px;
}

.status-badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
</style>
