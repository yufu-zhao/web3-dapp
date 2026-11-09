<template>
  <nav class="admin-tabbar" aria-label="已打开的页面">
    <button
      v-if="hasTabOverflow"
      type="button"
      aria-label="向左滚动页面标签"
      :disabled="!canScrollTabsLeft"
      class="tab-scroll-button"
      @click="scrollTabs(-1)"
    >
      <q-icon name="chevron_left" />
    </button>
    <div
      ref="tabsViewport"
      class="tabs-viewport"
      @scroll="updateTabsScrollState"
    >
      <div class="tabs-list">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.path"
          class="admin-tab"
          :class="{ 'admin-tab--active': tab.active }"
        >
          <button
            type="button"
            :aria-current="tab.active ? 'page' : undefined"
            class="admin-tab-page"
            @click="emit('open', tab.path)"
          >
            <q-icon :name="tab.icon" size="16px" />
            <span>{{ tab.title }}</span>
          </button>
          <button
            type="button"
            :aria-label="`关闭${tab.title}标签`"
            class="admin-tab-close"
            @click="emit('close', index)"
          >
            <q-icon name="close" size="14px" />
          </button>
          <q-tooltip>{{ tab.title }}</q-tooltip>
        </div>
      </div>
    </div>
    <button
      v-if="hasTabOverflow"
      type="button"
      aria-label="向右滚动页面标签"
      :disabled="!canScrollTabsRight"
      class="tab-scroll-button"
      @click="scrollTabs(1)"
    >
      <q-icon name="chevron_right" />
    </button>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

interface TabItem {
  path: string;
  title: string;
  icon: string;
  active: boolean;
}
const props = defineProps<{ tabs: TabItem[] }>();
const emit = defineEmits<{ open: [path: string]; close: [index: number] }>();
const tabsViewport = ref<HTMLElement | null>(null);
const hasTabOverflow = ref(false);
const canScrollTabsLeft = ref(false);
const canScrollTabsRight = ref(false);
let tabsResizeObserver: ResizeObserver | undefined;
function updateTabsScrollState() {
  const viewport = tabsViewport.value;
  if (!viewport) return;

  hasTabOverflow.value = viewport.scrollWidth > viewport.clientWidth + 1;
  canScrollTabsLeft.value = viewport.scrollLeft > 1;
  canScrollTabsRight.value =
    viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
}

function scrollTabs(direction: -1 | 1) {
  const viewport = tabsViewport.value;
  if (!viewport) return;
  viewport.scrollBy({
    left: direction * Math.max(180, viewport.clientWidth * 0.7),
    behavior: "smooth",
  });
}

function ensureActiveTabVisible() {
  const viewport = tabsViewport.value;
  const activeTab = viewport?.querySelector<HTMLElement>(".admin-tab--active");
  if (!viewport || !activeTab) return;

  const viewportRect = viewport.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  if (tabRect.left < viewportRect.left) {
    viewport.scrollBy({
      left: tabRect.left - viewportRect.left,
      behavior: "smooth",
    });
  } else if (tabRect.right > viewportRect.right) {
    viewport.scrollBy({
      left: tabRect.right - viewportRect.right,
      behavior: "smooth",
    });
  }
}

// 标签增删、切换后重新计算溢出，并确保活动标签可见。
watch(
  () => props.tabs,
  () => {
    void nextTick(() => {
      updateTabsScrollState();
      ensureActiveTabVisible();
    });
  },
  { deep: true },
);
onMounted(() => {
  window.addEventListener("resize", updateTabsScrollState);
  if (tabsViewport.value && typeof ResizeObserver !== "undefined") {
    tabsResizeObserver = new ResizeObserver(updateTabsScrollState);
    tabsResizeObserver.observe(tabsViewport.value);
  }
  void nextTick(updateTabsScrollState);
});
onUnmounted(() => {
  window.removeEventListener("resize", updateTabsScrollState);
  tabsResizeObserver?.disconnect();
});
</script>

<style lang="scss" scoped>
// 标签导航颜色集中配置，后续调整样式时可在此统一修改。
$tabbar-bg: var(--admin-surface, #fff);
$tab-text: var(--admin-text, #26364d);
$tab-separator: var(--admin-border, #aebbd0);
$tab-hover-bg: color-mix(
  in srgb,
  var(--admin-primary, #ffc832) 16%,
  var(--admin-surface, #fff)
);
$tab-hover-text: $tab-text;
$tab-hover-icon: $tab-text;
$tab-active-bg: color-mix(
  in srgb,
  var(--admin-background, #f3f6fa) 100%,
  var(--admin-surface, #fff)
);
$tab-active-text: var(--admin-text, #17243b);
$tab-icon: var(--admin-muted-text, #6f7b8e);
$tab-active-icon: var(--admin-muted-text, #6a778b);
$tab-close-icon: var(--admin-muted-text, #667388);
$tab-close-hover-bg: color-mix(
  in srgb,
  var(--admin-border, #d5dbe4) 70%,
  transparent
);
$tab-close-hover-text: var(--admin-text, #24334a);
$tab-scroll-icon: var(--admin-muted-text, #738096);
$tab-scroll-hover-bg: color-mix(
  in srgb,
  var(--admin-border, #d2d9e3) 70%,
  transparent
);
$tab-scroll-hover-text: var(--admin-text, #31415a);
$tab-focus-outline: var(--admin-primary, #7d9ac4);
$tab-transparent: transparent;

.admin-tabbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 44px;
  padding: 0 18px;
  background: $tabbar-bg;
}

.tabs-viewport {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  scroll-behavior: smooth;
}

.tabs-viewport::-webkit-scrollbar {
  display: none;
}

.tabs-list {
  display: flex;
  align-items: flex-end;
  gap: 0;
  width: max-content;
  min-width: 100%;
  height: 100%;
  padding: 5px 2px 0;
}

/* 分隔线只出现在两个普通标签之间，悬停及活动状态平滑隐藏。 */
.admin-tab {
  position: relative;
  isolation: isolate;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  min-width: 120px;
  max-width: 220px;
  height: 38px;
  padding: 0 6px 0 9px;
  border-radius: 9px 9px 0 0;
  color: $tab-text;
  background: $tab-transparent;
  transition:
    background-color 180ms ease,
    color 180ms ease;

  &::before {
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 0;
    width: 1px;
    background: $tab-separator;
    content: "";
    transition: opacity 180ms ease;
  }
  &:first-child::before,
  &:hover::before,
  &:hover + .admin-tab::before,
  &--active::before,
  &--active + .admin-tab::before {
    opacity: 0;
  }
  // 悬停背景缩进，避免贴住相邻标签的分隔线。
  &:not(&--active)::after {
    position: absolute;
    inset: 4px;
    z-index: -1;
    border-radius: 9px;
    background: $tab-hover-bg;
    content: "";
    opacity: 0;
    transition: opacity 180ms ease;
    pointer-events: none;
  }
  &:hover:not(&--active) {
    color: $tab-hover-text;
    &::after {
      opacity: 1;
    }
    :deep(.q-icon) {
      color: $tab-hover-icon;
    }
  }
}
.admin-tab--active {
  z-index: 1;
  background: $tab-active-bg;
  color: $tab-active-text;
  /* 内凹圆角让活动标签底部自然连接页面。 */
  &::after {
    position: absolute;
    right: -8px;
    bottom: 0;
    left: -8px;
    z-index: -1;
    height: 8px;
    background:
      radial-gradient(circle at 0 0, $tab-transparent 8px, $tab-active-bg 8.5px)
        left bottom / 8px 8px no-repeat,
      radial-gradient(
          circle at 100% 0,
          $tab-transparent 8px,
          $tab-active-bg 8.5px
        )
        right bottom / 8px 8px no-repeat;
    content: "";
    pointer-events: none;
  }
}
.admin-tab-page {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  padding: 0 6px 0 3px;
  border: 0;
  border-radius: 5px;
  background: $tab-transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;

  &:hover,
  &:active {
    background: $tab-transparent;
    color: inherit;
  }
}

.admin-tab-page :deep(.q-icon) {
  flex: 0 0 auto;
  color: $tab-icon;
}

.admin-tab--active .admin-tab-page :deep(.q-icon) {
  color: $tab-active-icon;
}

.admin-tab-page span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-tab-close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: $tab-transparent;
  color: $tab-close-icon;
  cursor: pointer;
  opacity: 0.9;

  &:hover {
    background: $tab-close-hover-bg;
    color: $tab-close-hover-text;
    opacity: 1;
  }
}

.tab-scroll-button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: $tab-transparent;
  color: $tab-scroll-icon;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $tab-scroll-hover-bg;
    color: $tab-scroll-hover-text;
  }

  &:disabled {
    cursor: default;
    opacity: 0.38;
  }
}

.admin-tab-page:focus-visible,
.admin-tab-close:focus-visible,
.tab-scroll-button:focus-visible {
  outline: 2px solid $tab-focus-outline;
  outline-offset: -2px;
}

@media (max-width: 820px) {
  .admin-tabbar {
    height: 42px;
    padding: 0 10px;
    gap: 2px;
  }
  .admin-tab {
    max-width: 180px;
    min-width: 108px;
    height: 36px;
    padding-right: 3px;
  }
}
</style>
