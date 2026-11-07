<template>
  <q-page class="forbidden-page flex flex-center">
    <main class="forbidden-card">
      <q-icon name="lock" color="warning" size="42px" />
      <p class="kicker">ACCESS CONTROL</p>
      <h1>当前账号没有访问权限</h1>
      <p>如需使用此功能，请联系具有管理员权限的账号调整角色。</p>
      <q-btn
        color="primary"
        text-color="dark"
        unelevated
        label="返回管理台"
        to="/"
      />
    </main>
  </q-page>
</template>

<style lang="scss" scoped>
.forbidden-page {
  min-height: 100vh;
  padding: 24px;
  background: #f2f5f9;
}

.forbidden-card {
  width: min(100%, 500px);
  padding: 42px 36px;
  border: 1px solid #e5eaf1;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(23, 43, 77, 0.08);
  text-align: center;
}

.kicker {
  margin: 14px 0 8px;
  color: #8a96a8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

h1 {
  margin: 0;
  color: #17243b;
  font-size: 23px;
}

p:not(.kicker) {
  margin: 12px 0 24px;
  color: #77849a;
  line-height: 1.7;
}
</style>
