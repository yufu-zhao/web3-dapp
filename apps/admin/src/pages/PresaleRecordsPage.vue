<template>
  <section class="workspace-section records-page">
    <AdminDataTable
      title="全体私募认购记录"
      description="展示经 API 核验入库的全体钱包认购记录；既有历史记录不会自动回填。"
      :rows="state.rows"
      :columns="columns"
      :loading="state.loading"
      :error="state.error"
      :total-rows="state.total"
      :page="state.page"
      :page-size="state.pageSize"
      :search="state.search"
      search-placeholder="搜索钱包地址或交易哈希"
      :empty-label="
        state.search ? '没有匹配的认购记录' : '暂无已核验的认购记录'
      "
      @refresh="load"
      @search-change="setSearch"
      @page-change="setPage"
      @page-size-change="setPageSize"
    >
      <template #filters>
        <div class="filter-row">
          <q-select
            v-model="roundFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            label="认购期数"
            :options="roundOptions"
          />
          <q-btn
            color="primary"
            unelevated
            label="应用筛选"
            @click="applyFilters"
          />
          <q-btn flat label="清除" @click="clearFilters" />
        </div>
      </template>
      <template #cell-buyerAddress="{ value }">
        <q-td class="address-cell">{{ value }}</q-td>
      </template>
      <template #cell-transactionHash="{ value }">
        <q-td class="hash-cell"
          ><code>{{ value }}</code></q-td
        >
      </template>
      <template #cell-roundId="{ value }">
        <q-td>第 {{ Number(value) + 1 }} 期</q-td>
      </template>
      <template #cell-paymentAmount="{ row }">
        <q-td class="amount-cell">
          {{
            formatPayment(
              row.paymentAmount as string,
              Number(row.paymentDecimals),
            )
          }}
          USDT
        </q-td>
      </template>
      <template #cell-createdAt="{ value }">
        <q-td>{{ formatDate(value as string) }}</q-td>
      </template>
    </AdminDataTable>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { formatUnits } from "ethers";
import AdminDataTable, {
  type AdminTableColumn,
} from "../components/AdminDataTable.vue";
import { adminRequest, type PageResult } from "../services/admin-api";

interface PresaleRecord extends Record<string, unknown> {
  id: string;
  chainId: string;
  transactionHash: string;
  blockNumber: string;
  buyerAddress: string;
  roundId: number;
  participantIndex: string;
  paymentAmount: string;
  paymentDecimals: number;
  createdAt: string;
}

const columns: AdminTableColumn[] = [
  { name: "buyerAddress", label: "认购钱包", field: "buyerAddress" },
  { name: "roundId", label: "期数", field: "roundId", align: "center" },
  {
    name: "participantIndex",
    label: "期内序号",
    field: "participantIndex",
    align: "right",
  },
  {
    name: "paymentAmount",
    label: "认购金额",
    field: "paymentAmount",
    align: "right",
  },
  { name: "blockNumber", label: "区块", field: "blockNumber", align: "right" },
  { name: "transactionHash", label: "交易哈希", field: "transactionHash" },
  { name: "createdAt", label: "入库时间", field: "createdAt" },
];
const state = reactive({
  rows: [] as PresaleRecord[],
  total: 0,
  page: 1,
  pageSize: 10,
  search: "",
  loading: false,
  error: "",
});
const roundFilter = ref<number | null>(null);
const activeRound = ref<number | null>(null);
const roundOptions = [
  { label: "第一期", value: 0 },
  { label: "第二期", value: 1 },
  { label: "第三期", value: 2 },
];

async function load() {
  state.loading = true;
  state.error = "";
  const query = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    search: state.search,
  });
  if (activeRound.value !== null) query.set("round", String(activeRound.value));
  try {
    const result = await adminRequest<PageResult<PresaleRecord>>(
      `/presale-records?${query.toString()}`,
    );
    state.rows = result.items;
    state.total = result.total;
  } catch (error) {
    state.rows = [];
    state.total = 0;
    state.error = error instanceof Error ? error.message : "读取私募记录失败。";
  } finally {
    state.loading = false;
  }
}

function setSearch(value: string) {
  state.search = value;
  state.page = 1;
  void load();
}
function setPage(value: number) {
  state.page = value;
  void load();
}
function setPageSize(value: number) {
  state.pageSize = value;
  state.page = 1;
  void load();
}
function applyFilters() {
  activeRound.value = roundFilter.value;
  state.page = 1;
  void load();
}
function clearFilters() {
  roundFilter.value = null;
  activeRound.value = null;
  state.page = 1;
  void load();
}
function formatPayment(amount: string, decimals: number) {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    return "--";
  }
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "--" : date.toLocaleString("zh-CN");
}

onMounted(load);
</script>

<style lang="scss" scoped>
.records-page {
  min-width: 0;
}

.address-cell,
.hash-cell,
.amount-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hash-cell code {
  color: var(--admin-muted-text);
  font-size: 11px;
}
</style>
