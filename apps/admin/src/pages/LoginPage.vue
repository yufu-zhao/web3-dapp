<template>
  <!-- 登录页单独定义公开布局，避免依赖登录后的管理主布局。 -->
  <q-layout view="lHh Lpr lFf" class="login-layout">
    <q-page-container>
      <q-page class="login-page flex flex-center">
        <main class="login-shell">
          <section class="login-brand-panel">
            <div>
              <BrandLogo :height="48" />
            </div>
            <div class="brand-copy">
              <p class="login-kicker">CHAINFORGE CONTROL</p>
              <h1>让系统管理更清晰。</h1>
              <p>在一个工作区中管理账号、角色、菜单和系统配置。</p>
            </div>
            <div class="brand-note">安全登录 · 权限控制 · 清晰管理</div>
          </section>

          <section class="login-form-panel">
            <div class="form-heading">
              <span class="form-icon"><q-icon name="lock_open" /></span>
              <div>
                <p class="login-kicker">欢迎回来</p>
                <h2>登录管理后台</h2>
              </div>
            </div>
            <p class="form-description">使用安装时创建的管理员账号登录。</p>

            <q-banner v-if="errorMessage" rounded class="login-error">
              <template #avatar><q-icon name="error_outline" /></template>
              {{ errorMessage }}
            </q-banner>

            <q-form class="login-form" @submit.prevent="submitLogin">
              <q-input
                v-model.trim="username"
                outlined
                autocomplete="username"
                label="管理员账号"
                placeholder="请输入管理员账号"
                :rules="[(value) => Boolean(value) || '请输入管理员账号']"
              >
                <template #prepend><q-icon name="person_outline" /></template>
              </q-input>
              <q-input
                v-model="password"
                outlined
                autocomplete="current-password"
                :type="showPassword ? 'text' : 'password'"
                label="登录密码"
                placeholder="请输入登录密码"
                :rules="[(value) => Boolean(value) || '请输入登录密码']"
                @keyup.enter="submitLogin"
              >
                <template #prepend><q-icon name="key" /></template>
                <template #append>
                  <q-btn
                    flat
                    round
                    dense
                    :icon="showPassword ? 'visibility_off' : 'visibility'"
                    :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
              <q-btn
                type="submit"
                color="primary"
                text-color="dark"
                class="login-submit"
                label="登录"
                icon-right="arrow_forward"
                unelevated
                :loading="submitting"
                :disable="!username || !password"
              />
            </q-form>
            <p class="login-footnote">
              若尚未创建管理员，请先完成安装器的数据库初始化。
            </p>
          </section>
        </main>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loadAdminInitializationStatus } from "@chainforge/shared-types";
import { BrandLogo } from "@chainforge/brand-ui";
import { adminRequest, type AdminSessionPayload } from "../services/admin-api";
import { firstMenuPath, saveAdminSession } from "../services/admin-session";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const systemName = ref("链构");

watch(
  [() => route.fullPath, systemName],
  () => {
    document.title = `登录 · ${systemName.value}管理后台`;
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    const status = await loadAdminInitializationStatus();
    if (status.state === "ready")
      systemName.value = status.installation.systemName;
  } catch {
    // 路由门禁会显示初始化状态错误，登录页保留默认品牌。
  }
});

async function submitLogin() {
  if (!username.value || !password.value || submitting.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    const session = await adminRequest<AdminSessionPayload>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: username.value,
        password: password.value,
      }),
    });
    saveAdminSession(session);
    const requestedPath = route.query.redirect;
    const safeRedirect =
      typeof requestedPath === "string" &&
      requestedPath.startsWith("/") &&
      !requestedPath.startsWith("//")
        ? requestedPath
        : (firstMenuPath() ?? "/administrators");
    await router.replace(safeRedirect);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "登录失败，请检查账号和密码。";
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.login-layout {
  min-height: 100vh;
}

.login-page {
  min-height: 100vh;
  padding: 28px;
  background: var(--admin-background);
}

.login-shell {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(360px, 1.05fr);
  width: min(100%, 960px);
  min-height: 580px;
  overflow: hidden;
  border: 1px solid var(--admin-border);
  border-radius: 26px;
  background: var(--admin-surface);
  box-shadow: 0 30px 80px rgba(24, 39, 63, 0.14);
}

.login-brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 38px 40px;
  background:
    radial-gradient(
      circle at 70% 25%,
      rgba(255, 200, 50, 0.18),
      transparent 36%
    ),
    #17243b;
  color: #fff;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 700;
}

.brand-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--admin-primary);
  color: var(--admin-on-primary);
  font-weight: 800;
  place-items: center;
}

.brand-copy {
  max-width: 360px;
  margin: 0 auto;
}

.login-kicker {
  margin: 0 0 12px;
  color: #b2bfd2;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.brand-copy h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.25;
}

.brand-copy > p:last-child {
  margin: 16px 0 0;
  color: #bbc6d6;
  line-height: 1.8;
}

.brand-note {
  color: #8997ad;
  font-size: 11px;
}

.login-form-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(32px, 6vw, 64px);
}

.form-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.form-icon {
  display: grid;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: color-mix(
    in srgb,
    var(--admin-primary) 24%,
    var(--admin-surface)
  );
  color: var(--admin-primary);
  font-size: 23px;
  place-items: center;
}

.form-heading .login-kicker {
  margin-bottom: 5px;
  color: #919db0;
}

.form-heading h2 {
  margin: 0;
  color: var(--admin-text);
  font-size: 24px;
}

.form-description {
  margin: 22px 0 28px;
  color: var(--admin-muted-text);
  font-size: 13px;
}

.login-error {
  margin-bottom: 18px;
  background: #fff0f1;
  color: #a92a3c;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-submit {
  height: 48px;
  margin-top: 8px;
  border-radius: 10px;
  font-weight: 700;
}

.login-footnote {
  margin: 28px 0 0;
  color: #9aa5b5;
  font-size: 11px;
  line-height: 1.7;
}

@media (max-width: 700px) {
  .login-page {
    padding: 14px;
  }

  .login-shell {
    grid-template-columns: 1fr;
    min-height: auto;
    border-radius: 20px;
  }

  .login-brand-panel {
    min-height: 190px;
    padding: 24px;
  }

  .brand-copy {
    margin: 28px 0 0;
  }

  .brand-copy h1 {
    font-size: 26px;
  }

  .brand-copy > p:last-child,
  .brand-note {
    display: none;
  }

  .login-form-panel {
    padding: 28px 24px 32px;
  }
}
</style>
