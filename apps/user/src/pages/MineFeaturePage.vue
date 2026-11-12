<template>
  <template v-if="currentFeature">
    <router-link class="back-link" to="/mine">
      <q-icon name="arrow_back" />
      {{ t("text_b668ee457f4d") }}
    </router-link>
    <div class="mine-layout">
      <DesktopServiceMenu
        :features="serviceFeatures"
        :active-key="currentFeature.key"
      />
      <div class="mine-detail">
        <h1 class="mine-title">{{ currentFeature.title }}</h1>
        <template v-if="currentFeature.key === 'announcements'">
          <div v-if="announcementLoading" class="panel empty compact-empty">
            <span class="empty-icon"><q-icon name="hourglass_empty" /></span>
            <h3>{{ t("text_56a7410e3ab2") }}</h3>
          </div>
          <div v-else-if="announcementError" class="panel empty compact-empty">
            <span class="empty-icon"><q-icon name="cloud_off" /></span>
            <h3>{{ t("text_1452f8ba28fa") }}</h3>
            <p>{{ announcementError }}</p>
            <button class="button secondary" @click="loadContent">
              {{ t("text_b8784c8dd563") }}
            </button>
          </div>
          <div v-else-if="announcementItems.length" class="announcement-list">
            <article
              v-for="announcement in announcementItems"
              :key="announcement.id"
              class="panel announcement-card"
            >
              <h2>{{ announcement.title }}</h2>
              <p v-if="announcement.summary" class="announcement-summary">
                {{ announcement.summary }}
              </p>
              <img
                v-if="
                  announcement.contentType === 'article' &&
                  announcement.mediaUrl
                "
                :src="announcement.mediaUrl"
                :alt="announcement.title"
                loading="lazy"
              />
              <video
                v-if="
                  announcement.contentType === 'video' && announcement.mediaUrl
                "
                :src="announcement.mediaUrl"
                controls
                preload="metadata"
              />
              <p v-if="announcement.body" class="announcement-body">
                {{ announcement.body }}
              </p>
            </article>
          </div>
          <div v-else class="panel empty compact-empty">
            <span class="empty-icon"><q-icon name="campaign" /></span>
            <h3>{{ t("text_6d9a7758610a") }}</h3>
            <p>{{ t("text_41db199ee511") }}</p>
          </div>
        </template>
        <template v-else-if="currentFeature.key === 'trades'">
          <div class="panel empty compact-empty">
            <span class="empty-icon"><q-icon name="receipt_long" /></span>
            <h3>{{ t("text_5bddc23f5fa4") }}</h3>
            <p>{{ t("text_e3619cb000d3") }}</p>
          </div>
        </template>
        <ReferralDashboard v-else-if="currentFeature.key === 'referral'" />
        <template v-else>
          <section class="panel detail-summary">
            <div>
              <span class="label">{{ currentFeature.metric }}</span>
              <div class="detail-value">--</div>
              <p>{{ currentFeature.hint }}</p>
            </div>
            <button class="button secondary" @click="detailNotice = true">
              {{ currentFeature.action }}
            </button>
          </section>
          <p v-if="detailNotice" class="notice" role="status">
            {{ t("text_4af4222eb987", { feature: currentFeature.title }) }}
          </p>
          <div class="section-title">
            <h2>{{ currentFeature.list }}</h2>
            <span class="pill">{{ t("text_e912fe6ce99c") }}</span>
          </div>
          <div class="panel empty">
            <span class="empty-icon"
              ><q-icon :name="currentFeature.icon"
            /></span>
            <h3>
              {{ t("text_7204737076bc", { list: currentFeature.list }) }}
            </h3>
            <p>{{ t("text_19af25f736ba") }}</p>
          </div>
        </template>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { userPageStateKey } from "../composables/user-page-state";
import DesktopServiceMenu from "../components/DesktopServiceMenu.vue";
import ReferralDashboard from "../components/ReferralDashboard.vue";
const {
  t,
  serviceFeatures,
  currentFeature,
  announcementLoading,
  announcementError,
  announcementItems,
  loadContent,
  detailNotice
} = inject(userPageStateKey)!;
</script>
