<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="page-shell flex flex-center">
        <main class="starter-card">
          <div class="brand-mark" aria-hidden="true">FR</div>
          <p class="eyebrow">FileReset</p>
          <h1>用户端</h1>
          <p class="description">应用骨架已启动，可以开始后续需求拆解。</p>
          <q-badge color="positive" text-color="dark" class="status-badge">
            <q-icon name="check_circle" size="16px" class="q-mr-xs" />
            运行就绪
          </q-badge>
        </main>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

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

.status-badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
</style>
