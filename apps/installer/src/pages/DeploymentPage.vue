<template>
  <section class="step-content">
    <ContractDeploymentPanel
      v-if="flow.summary.installation"
      :project-id="flow.projectId"
      :installation="flow.summary.installation"
      @completed="onCompleted"
    />
    <q-banner v-else class="message-banner warning-message">
      请先在数据库配置页确认并保存系统名称和代币信息。
    </q-banner>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import ContractDeploymentPanel from "../components/ContractDeploymentPanel.vue";
import type { SavedDeployment } from "../services/installer-api";
import { installerFlow } from "../services/installer-flow";

const router = useRouter();
const flow = installerFlow;
async function onCompleted(deployment: SavedDeployment) {
  flow.selectedDeployment = deployment;
  await router.push({
    path: `/complete/${deployment.deploymentId}`,
    query: { chainId: String(deployment.chainId) },
  });
}
</script>

<style lang="scss" scoped>
.step-content {
  margin: 0 auto;
  padding: 34px 30px 40px;
}
</style>
