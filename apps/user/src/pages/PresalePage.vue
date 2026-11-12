<template>
  <PanelHeading
    :title="t('text_9a8798488169', { token: tokenSymbol })"
    :sub-title="t('text_d33dafb53452')"
    entitle="PRIVATE SALE"
  >
    <template #side>
      <span class="presale-heading-note">
        <q-icon name="verified_user" />
        {{ t("text_70808b3d695f") }}
      </span>
    </template>
  </PanelHeading>
  <div v-if="presaleLoading" class="panel empty presale-state">
    <q-spinner color="primary" size="32px" />
    <h3>{{ t("text_dcd7952315f4") }}</h3>
    <p>{{ t("text_c6bf9ae19b59") }}</p>
  </div>
  <div v-else-if="presaleError" class="panel empty presale-state">
    <span class="empty-icon"><q-icon name="cloud_off" /></span>
    <h3>{{ t("text_b3fbe6f192ec") }}</h3>
    <p>{{ presaleError }}</p>
    <button class="button secondary presale-retry" @click="loadPresale()">
      {{ t("text_7bdd5ce1e298") }}
    </button>
  </div>
  <div v-else-if="openPresale" class="panel presale-card">
    <div class="presale-card-top">
      <div>
        <div class="presale-tags">
          <span
            class="sale-live"
            :class="{ 'sale-not-open': openPresale.state !== 'open' }"
          >
            <span></span>
            {{
              openPresale.state === "open"
                ? t("text_70269cd2c470")
                : openPresale.state === "scheduled"
                  ? t("presale_scheduled")
                  : t("presale_awaiting_finalization")
            }}
          </span>
          <span class="sale-round">{{
            t("text_60b8db6ee8cd", { round: openPresale.round })
          }}</span>
        </div>
        <!-- <h2>{{ tokenSymbol }} 私募认购</h2> -->
        <p>{{ t("text_35a03c4289d4") }}</p>
      </div>
      <div class="sale-mark"><q-icon name="diamond" /></div>
    </div>
    <div class="sale-metrics">
      <div>
        <span>{{ t("text_b13fb9ff5d8c") }}</span>
        <strong>{{ openPresale.price }}</strong>
        <small>{{ t("text_ed1b2beb057c", { token: tokenSymbol }) }}</small>
      </div>
      <div>
        <span>{{ t("text_0c150fed7278") }}</span>
        <strong>{{ parseInt(openPresale.ticket) }}</strong>
        <small>{{ t("text_1c871c22a867") }}</small>
      </div>
      <div>
        <span>{{ t("text_7bc80bf154e7") }}</span>
        <strong>{{ parseInt(openPresale.offered) }}</strong>
        <small>{{ tokenSymbol }}</small>
      </div>
      <div>
        <span>{{ t("text_a3be500185e6") }}</span>
        <strong>{{ openPresale.participants }}</strong>
        <small>{{ t("text_50f5d65d5729") }}</small>
      </div>
    </div>
    <div class="sale-progress">
      <div class="progress-heading">
        <div>
          <h3>{{ t("text_207c88639b92") }}</h3>
          <p>{{ t("text_cdb244ddeb95") }}</p>
        </div>
        <strong>{{ progressText }}</strong>
      </div>
      <div
        class="progress-track"
        role="img"
        :aria-label="t('text_5a382066a61e', { progress: progressText })"
      >
        <div class="progress-fill" :style="{ width: progressWidth }"></div>
      </div>
      <div class="progress-foot">
        <!-- <span>
                {{
                  t("text_03831f44f5de", {
                    amount: openPresale.requested ?? "--",
                    token: tokenSymbol,
                  })
                }}
              </span> -->
        <span>
          {{
            t("text_03831f44f5de", {
              amount: formatNumber(openPresale.requested),
              token: tokenSymbol
            })
          }}
        </span>
        <span>
          {{
            t("text_19003bc43c59", {
              amount: formatNumber(openPresale.offered),
              token: tokenSymbol
            })
          }}
        </span>
      </div>
      <p v-if="isOversubscribed" class="oversubscribed">
        <q-icon name="info_outline" />
        {{ t("text_638115ee8c03") }}
      </p>
    </div>
    <div class="sale-time">
      <q-icon name="schedule" />
      <div>
        <span>{{
          openPresale.state === "scheduled"
            ? t("presale_starts_at")
            : t("text_8bf6994b5b44")
        }}</span>
        <strong>
          {{
            new Date(
              (openPresale.state === "scheduled"
                ? openPresale.start
                : openPresale.end) * 1000
            ).toLocaleString(locale)
          }}
        </strong>
        <small v-if="openPresale.state !== 'ended'" class="sale-countdown">
          {{
            openPresale.state === "scheduled"
              ? t("presale_starts_in")
              : t("presale_ends_in")
          }}
          <b>{{ countdownText }}</b>
        </small>
        <small v-else class="sale-countdown">{{
          t("presale_finalization_notice")
        }}</small>
      </div>
      <span class="sale-time-note">{{ t("text_52fa6050f77d") }}</span>
    </div>
  </div>
  <div v-else class="panel empty presale-state">
    <span class="empty-icon"><q-icon name="hourglass_empty" /></span>
    <h3>{{ t("text_5b73b7ffa69e") }}</h3>
    <p>{{ t("text_e41101a14626") }}</p>
  </div>
  <PresaleAccount
    ref="presaleAccount"
    v-if="walletKitReady"
    :token-symbol="tokenSymbol"
    @updated="loadPresale()"
  />
  <div v-else class="panel empty">
    {{ t("text_73eefa939f84") }}
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { userPageStateKey } from "../composables/user-page-state";
import PresaleAccount from "../components/PresaleAccount.vue";
import PanelHeading from "../components/PanelHeading.vue";
const {
  t,
  locale,
  tokenSymbol,
  walletKitReady,
  presaleLoading,
  presaleError,
  openPresale,
  progressText,
  progressWidth,
  isOversubscribed,
  formatNumber,
  countdownText,
  presaleAccount,
  loadPresale
} = inject(userPageStateKey)!;
</script>
