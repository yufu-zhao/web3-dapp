<template>
  <q-input
    :model-value="modelValue"
    outlined
    dense
    label="图标名称"
    maxlength="96"
    placeholder="输入图标名称或从图库选择"
    @update:model-value="$emit('update:modelValue', String($event ?? ''))"
  >
    <template #prepend><q-icon :name="modelValue || 'image'" /></template>
    <template #append>
      <q-btn
        flat
        dense
        icon="apps"
        aria-label="选择图标"
        @click="open = true"
      />
    </template>
  </q-input>
  <q-dialog v-model="open">
    <q-card class="icon-picker">
      <q-card-section class="picker-heading">
        <div>
          <strong>选择图标</strong>
          <div class="picker-caption">Font Awesome 免费图标</div>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          aria-label="关闭"
          @click="open = false"
        />
      </q-card-section>
      <q-card-section>
        <q-input
          v-model.trim="search"
          outlined
          dense
          clearable
          debounce="150"
          label="搜索图标（英文）"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <p class="picker-caption">
          共 {{ filtered.length }} 个结果，显示前 120 个；可输入更具体的关键词。
        </p>
        <div v-if="filtered.length" class="icon-grid">
          <button
            v-for="icon in filtered.slice(0, 120)"
            :key="icon"
            type="button"
            class="icon-option"
            :title="icon"
            :aria-label="icon"
            @click="choose(icon)"
          >
            <q-icon :name="icon" size="22px" />
            <span>{{ icon.replace(/^(fas|far|fab) fa-/, "") }}</span>
          </button>
        </div>
        <div v-else class="picker-empty">
          没有匹配的图标，请尝试其他关键词。
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import icons from "./fontawesome-icons.json";

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const open = ref(false);
const search = ref("");
// 图库检索使用字体类名，搜索结果限制渲染数量以保持弹窗流畅。
const filtered = computed(() => {
  const query = (search.value ?? "").toLowerCase();
  return icons.filter((icon) => icon.toLowerCase().includes(query));
});
function choose(icon: string) {
  emit("update:modelValue", icon);
  open.value = false;
}
</script>

<style lang="scss" scoped>
.icon-picker {
  width: min(760px, 95vw);
  max-width: 760px;
  border-radius: 16px;
}
.picker-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.picker-caption {
  color: #758198;
  font-size: 12px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}
.icon-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 74px;
  padding: 8px;
  border: 1px solid #e7ecf3;
  border-radius: 8px;
  background: #fff;
  color: #34435a;
  cursor: pointer;
}
.icon-option:hover,
.icon-option:focus-visible {
  border-color: var(--admin-primary, #ffc832);
  background: #fff9e8;
}
.icon-option span {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-empty {
  padding: 30px;
  text-align: center;
  color: #758198;
}
</style>
