<template>
  <div class="flex items-center">
    <q-avatar rounded :color="iconObj.color" :text-color="iconObj.textColor">
      <q-icon :name="iconObj.icon" size="25px" />
    </q-avatar>
    <div class="q-ml-md">
      <p class="content-kicker">{{ kicker }}</p>
      <h2>{{ title }}</h2>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed } from "vue";
interface IconObjProps {
  icon: string;
  color: string;
  textColor: string;
}
interface Props {
  title: string;
  kicker: string;
  icon: string | IconObjProps;
}
const props = defineProps<Props>();

const iconObj = computed(() => {
  if (typeof props.icon === "string") {
    return {
      icon: props.icon,
      color: "primary",
      textColor: "white",
    };
  } else {
    return props.icon;
  }
});
</script>

<style scoped lang="scss">
.content-kicker {
  color: #9aa3b1;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
h2 {
  margin: 0;
  color: #172033;
  font-size: 28px;
  line-height: 1.2;
}
p {
  margin: 0;
}
</style>
