<template>
  <div class="panel-heading">
    <div>
      <span class="eyebrow">{{ entitle }} </span>
      <h1>{{ title }}</h1>
      <p class="q-mt-md">{{ subTitle }}</p>
    </div>
    <slot name="side" />
  </div>
</template>

<script lang="ts" setup>
interface PanelHeadingProps {
  title: string;
  subTitle?: string;
  entitle?: string;
}
defineProps<PanelHeadingProps>();
</script>

<style lang="scss" scoped>
.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  margin: 8px 0 26px;
  gap: 20px;
}
.panel-heading h1 {
  margin: 8px 0 0;
  font-size: 32px;
  font-weight: 750;
}
.panel-heading p,
.panel-card-top p {
  margin-top: 8px;
  font-size: 14px;
  color: var(--user-muted-text);
}
.panel-heading-note {
  color: var(--user-muted-text);
  font-size: 12px;
  display: flex;
  gap: 7px;
  align-items: center;
  white-space: nowrap;
}
.panel-heading-note .q-icon {
  color: var(--user-accent);
  font-size: 17px;
}
</style>
