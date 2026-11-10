<template>
  <img
    class="brand-logo"
    :src="src"
    alt="ChainForge"
    :style="{ height: logoHeight }"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
interface Props {
  height?: number | string;
  src?: string;
}
const props = withDefaults(defineProps<Props>(), {
  src: "/brand/chainforge-logo-horizontal.svg",
  height: 40,
});

// 数字高度按像素处理，字符串高度允许调用方传入 CSS 单位。
const logoHeight = computed(() =>
  typeof props.height === "number" ? `${props.height}px` : props.height,
);
</script>

<style scoped>
.brand-logo {
  display: block;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
</style>
