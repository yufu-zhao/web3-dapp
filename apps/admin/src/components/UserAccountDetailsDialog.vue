<template>
  <q-dialog
    :model-value="modelValue"
    position="right"
    aria-labelledby="user-account-details-title"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card class="user-details-card">
      <q-card-section class="details-heading">
        <div>
          <div class="eyebrow">用户账户</div>
          <h2 id="user-account-details-title">账户详情</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          aria-label="关闭详情"
          v-close-popup
        />
      </q-card-section>

      <q-separator />

      <q-card-section v-if="account" class="details-scroll">
        <div class="identity-card">
          <q-avatar size="72px" class="identity-avatar">
            <img
              v-if="account.avatarUrl"
              :src="account.avatarUrl"
              alt="用户头像"
            />
            <q-icon v-else name="person" size="38px" />
          </q-avatar>
          <div class="identity-copy">
            <strong>{{ account.name || "未设置名称" }}</strong>
            <span>{{ account.walletAddress }}</span>
            <q-badge
              :color="account.isActive !== false ? 'positive' : 'negative'"
              :label="account.isActive !== false ? '正常' : '已禁用'"
            />
          </div>
        </div>

        <dl class="details-list">
          <div><dt>邀请码</dt><dd>{{ account.invitationCode || "—" }}</dd></div>
          <div
            ><dt>邀请人钱包</dt
            ><dd>{{ account.inviterWalletAddress || "直接注册" }}</dd></div
          >
          <div><dt>邀请人数</dt><dd>{{ account.invitedCount }}</dd></div>
          <div
            ><dt>注册时间</dt><dd>{{ formatDate(account.createdAt) }}</dd></div
          >
          <div
            ><dt>注册 IP</dt><dd>{{ account.registrationIp || "—" }}</dd></div
          >
          <div
            ><dt>最近登录 IP</dt><dd>{{ account.lastLoginIp || "—" }}</dd></div
          >
          <div class="remark-row"
            ><dt>备注</dt><dd>{{ account.remark || "暂无备注" }}</dd></div
          >
        </dl>
      </q-card-section>

      <q-card-section class="details-footer">
        <q-btn flat color="primary" label="关闭" v-close-popup />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import type { UserAccountRecord } from "../services/admin-api";

// 管理端页面统一传入用户记录，复用右侧账户详情面板。
defineProps<{
  modelValue: boolean;
  account: UserAccountRecord | null;
}>();
defineEmits<{ "update:modelValue": [value: boolean] }>();

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}
</script>

<style lang="scss" scoped>
.user-details-card {
  display: flex;
  width: min(520px, 100vw);
  height: 100vh;
  max-height: 100vh;
  flex-direction: column;
  border-radius: 18px 0 0 18px;
  background: var(--admin-surface);
  color: var(--admin-text);
}

.details-heading,
.details-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
}

.details-heading h2 {
  margin: 3px 0 0;
  font-size: 20px;
}

.eyebrow {
  color: var(--admin-muted-text);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.details-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.identity-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 22px;
}

.identity-avatar {
  flex: 0 0 auto;
  background: var(--admin-background);
  color: var(--admin-muted-text);
}

.identity-copy {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.identity-copy strong {
  font-size: 18px;
}

.identity-copy span,
.details-list dd {
  overflow-wrap: anywhere;
  color: var(--admin-muted-text);
  font-size: 12px;
}

.details-list {
  display: grid;
  gap: 0;
  margin: 0;
}

.details-list > div {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--admin-border);
}

.details-list dt {
  color: var(--admin-muted-text);
  font-size: 12px;
}

.details-list dd {
  margin: 0;
  color: var(--admin-text);
  text-align: right;
}

.details-list .remark-row dd {
  text-align: left;
  white-space: pre-wrap;
}

.details-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--admin-border);
}

@media (max-width: 520px) {
  .user-details-card {
    width: 100vw;
    border-radius: 0;
  }
}
</style>
