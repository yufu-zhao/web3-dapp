<template>
  <section class="deployment-panel">
    <div class="deployment-heading">
      <ContentHeading
        title="部署合约"
        kicker="步骤 03 · CHAIN DEPLOYMENT"
        :icon="{ icon: 'gavel', color: 'teal-1', textColor: 'teal-9' }"
      />
      <WalletConnect
        :project-id="props.projectId"
        :system-name="props.installation.systemName"
        :chain-id="props.installation.chainId"
        confirm-changes
        :deployment-busy="runningSequence || deployingMock"
        @connected="onWalletConnected"
        @changed="onWalletChanged"
        @change-pending="onWalletChangePending"
        @disconnected="onWalletDisconnected"
      />
    </div>
    <p class="section-copy">
      直接读取 contracts/code
      的部署计划和编译产物。每笔链上写入都按计划顺序等待钱包确认与成功回执。
    </p>
    <InstallerCard class="installation-identity-card q-px-md q-py-xs">
      <strong>已锁定的安装身份</strong>
      <span
        >目标 ChainId
        {{ props.installation.chainId ?? "全部部署成功后锁定" }}</span
      >
      <span>系统名称：{{ props.installation.systemName }}</span>
      <span
        >链上代币：{{ props.installation.tokenName }}（{{
          props.installation.tokenSymbol
        }}）</span
      >
    </InstallerCard>

    <q-banner v-if="packageError" class="notice-banner error-banner">
      <template #avatar><q-icon name="error_outline" /></template
      >{{ packageError }}
    </q-banner>
    <q-banner
      v-if="packageInfo && !packageInfo.exists"
      class="notice-banner error-banner"
    >
      <template #avatar><q-icon name="folder_off" /></template
      >合约不存在：未找到 contracts/code/config/deployment-plan.json。
    </q-banner>
    <q-banner
      v-if="packageInfo?.exists && !packageInfo.artifactsReady"
      class="notice-banner warning-banner"
    >
      <template #avatar><q-icon name="build" /></template>已找到合约包
      {{ packageInfo.releaseVersion }}，但编译产物缺失。点击编译会在
      contracts/code 目录运行 npm run build。<q-btn
        class="banner-action"
        flat
        label="编译合约包"
        icon="construction"
        :loading="compiling"
        @click="compilePackage"
      />
    </q-banner>
    <q-banner
      v-if="packageInfo?.exists && packageInfo.artifactsReady"
      class="notice-banner success-banner"
    >
      <template #avatar><q-icon name="inventory_2" /></template>已加载
      contracts/code · 版本 {{ packageInfo.releaseVersion }} ·
      {{ transactionNodeCount }} 个链上部署节点 ·
      {{ actionCount }} 个部署后配置步骤。
    </q-banner>
    <q-banner
      v-if="wallet && wallet.chainId === 56"
      class="notice-banner warning-banner"
    >
      <template #avatar><q-icon name="warning_amber" /></template>当前为 BNB
      Smart Chain 主网。MockUSDT 是公开 mint 的测试币，主网禁止部署；请核对支付
      Token、Router 与 Factory 地址。
    </q-banner>

    <div v-if="wallet && packageInfo?.exists" class="chain-summary">
      <span
        ><small>连接钱包</small
        ><strong>{{ shortAddress(wallet.address) }}</strong></span
      >
      <span
        ><small>当前 ChainId</small
        ><strong>{{ wallet.chainId }} · {{ chainName }}</strong></span
      >
      <span
        ><small>部署资料目录</small
        ><strong>{{ packageInfo.outputRoot }}</strong></span
      >
      <q-btn
        outline
        dense
        color="dark"
        icon="refresh"
        label="重新读取合约包"
        :loading="loadingPackage"
        @click="loadChainData(true)"
      />
    </div>

    <div v-if="wallet && packageInfo?.exists" class="deployment-columns">
      <div class="configuration-column">
        <div class="config-grid">
          <InstallerCard class="config-card wide-card">
            <div class="subsection-heading">
              <h3>DEX 地址</h3>
              <q-btn flat dense icon="download" @click="applyNetworkDefaults">
                <q-tooltip> 按 ChainId 获取默认地址 </q-tooltip>
              </q-btn>
            </div>

            <q-input
              v-model="externalAddresses.router"
              outlined
              dense
              label="PancakeSwap V2 风格 Router"
              placeholder="0x…"
            />
            <q-input
              v-model="externalAddresses.factory"
              outlined
              dense
              label="Factory"
              placeholder="0x…"
            />
            <q-btn
              outline
              dense
              class="verify-button"
              color="primary"
              icon="verified_user"
              label="核验 Router / Factory"
              :loading="verifyingDex"
              @click="verifyDex"
            />
            <q-banner
              v-if="dexStatus"
              dense
              :class="[
                'inline-banner',
                dexVerified ? 'success-banner' : 'warning-banner',
              ]"
            >
              {{ dexStatus }}
            </q-banner>
          </InstallerCard>

          <InstallerCard class="config-card wide-card">
            <div class="subsection-heading">
              <h3>支付 Token</h3>
              <q-btn
                v-if="wallet.chainId !== 56"
                flat
                dense
                icon="add_circle"
                :disable="!canDeployMock"
                @click="mockConfirmOpen = true"
              >
                <q-tooltip> 一键部署 MockUSDT </q-tooltip>
              </q-btn>
            </div>
            <q-select
              v-model="externalAddresses.paymentToken"
              outlined
              dense
              use-input
              fill-input
              hide-selected
              new-value-mode="add-unique"
              :options="tokenOptions"
              label="支付 Token 地址（同链历史 + 手动输入）"
              input-debounce="0"
            />
            <div class="verify-line">
              <q-btn
                outline
                dense
                color="primary"
                icon="verified_user"
                label="核验支付 Token"
                :loading="verifyingToken"
                @click="verifyToken"
              /><span v-if="tokenInfo"
                >{{ tokenInfo.symbol }} · {{ tokenInfo.decimals }} 位小数</span
              >
            </div>
            <q-banner
              v-if="tokenStatus"
              dense
              :class="[
                'inline-banner',
                tokenVerified ? 'success-banner' : 'warning-banner',
              ]"
            >
              {{ tokenStatus }}
            </q-banner>
            <q-banner v-if="mockStatus" dense class="inline-banner info-banner">
              {{ mockStatus }}
            </q-banner>
            <q-banner
              v-if="mockError"
              dense
              class="inline-banner error-banner contextual-error"
            >
              {{ mockError }}
            </q-banner>
            <q-banner
              v-if="wallet.chainId !== 56"
              dense
              class="inline-banner warning-banner"
            >
              MockUSDT 为公开 mint
              的测试币，只应在测试或自建链使用；部署者自行确认目标链。
            </q-banner>
          </InstallerCard>

          <InstallerCard class="config-card wide-card">
            <div class="subsection-heading">
              <h3>角色钱包</h3>
              <span>DEFAULT_ADMIN_ROLE 只授予当前连接钱包</span>
            </div>

            <q-input
              :model-value="wallet.address"
              outlined
              dense
              readonly
              label="DEFAULT_ADMIN_ROLE · 部署钱包"
            />
            <q-input
              v-for="item in roleFields"
              :key="item.key"
              v-model="roleWallets[item.key]"
              outlined
              dense
              :label="item.label"
              placeholder="0x…"
            />
          </InstallerCard>

          <InstallerCard class="config-card wide-card">
            <div class="subsection-heading">
              <h3>资产钱包</h3>
              <span>分别填写合约包使用的钱包地址</span>
            </div>
            <q-input
              v-for="item in assetFields"
              :key="item.key"
              v-model="assetWallets[item.key]"
              outlined
              dense
              :label="item.label"
              placeholder="0x…"
            />
          </InstallerCard>

          <InstallerCard class="config-card wide-card">
            <div class="subsection-heading">
              <h3>Oracle 参数</h3>
              <span>按 Token 单位输入，避免手动填写长整数</span>
            </div>
            <div class="field-grid">
              <q-input
                v-model.number="oracle.samplePeriodSeconds"
                outlined
                dense
                type="number"
                label="采样周期（秒）"
                min="1"
              /><q-input
                v-model="oracle.minimumPaymentReserve"
                outlined
                dense
                type="number"
                min="0"
                step="any"
                label="最低支付 Token 储备量"
                :hint="
                  tokenInfo
                    ? `按 ${tokenInfo.symbol} 的 ${tokenInfo.decimals} 位精度换算`
                    : '核验 Token 后按其精度换算'
                "
              />
            </div>
            <div class="raw-value">
              链上整数：{{ minimumReserveRaw || "核验 Token 并填写金额后显示" }}
            </div>
          </InstallerCard>

          <InstallerCard
            v-if="savedDeployments.length"
            class="config-card prior-runs-card"
          >
            <div class="subsection-heading">
              <h3>同链已完成部署</h3>
              <span>只载入资料，不发起新交易</span>
            </div>
            <div class="prior-run-list">
              <button
                v-for="record in savedDeployments"
                :key="record.deploymentId"
                class="prior-run"
                type="button"
                @click="loadPrevious(record)"
              >
                <span
                  ><strong
                    >{{ formatDate(record.completedAt) }} · v{{
                      record.releaseVersion
                    }}</strong
                  ><small
                    >{{ shortAddress(record.deployer) }} ·
                    {{ Object.keys(record.contracts ?? {}).length }}
                    个地址</small
                  ></span
                ><q-icon name="open_in_new" />
              </button>
            </div>
          </InstallerCard>
        </div>

        <q-banner v-if="preflightError" class="notice-banner error-banner">
          <template #avatar><q-icon name="error_outline" /></template
          >{{ preflightError }}
        </q-banner>

        <div
          v-if="packageInfo?.exists && packageInfo.artifactsReady"
          class="deploy-actions"
        >
          <q-btn
            flat
            color="dark"
            icon="arrow_back"
            label="返回数据库配置"
            @click="router.push('/database')"
          />
          <q-btn
            color="primary"
            unelevated
            icon="rocket_launch"
            label="部署全部合约与链上配置"
            :disable="!canStart || runningSequence"
            :loading="runningSequence"
            @click="prepareDeployment"
          />
        </div>
      </div>

      <q-dialog v-model="confirmDeployOpen" persistent>
        <q-card class="confirm-card">
          <q-card-section>
            <div class="confirm-title">确认开始本次部署</div>
            <p>
              ChainId {{ wallet?.chainId }} · 部署钱包
              {{ wallet ? shortAddress(wallet.address) : "" }}
            </p>
            <p>
              计划包含 {{ transactionNodeCount }} 个合约部署、{{ actionCount }}
              个部署后写入步骤及最终核验。每笔成功回执后才会请求下一笔钱包确认。
            </p>
            <p>
              合约地址和交易哈希会写入 contracts/deploy/{{
                wallet?.chainId
              }}/，未完成进度只保留在该链的临时文件中。
            </p>
          </q-card-section>
          <q-card-section align="right">
            <q-btn
              v-close-popup
              outline
              color="grey"
              class="on-left"
              label="取消"
            />
            <q-btn
              color="primary"
              unelevated
              icon="rocket_launch"
              label="确认并开始"
              :loading="runningSequence"
              @click="startDeployment"
            />
          </q-card-section>
        </q-card>
      </q-dialog>
      <q-dialog v-model="mockConfirmOpen" persistent>
        <q-card class="confirm-card">
          <q-card-section>
            <div class="confirm-title">部署公开 mint 测试币</div>
            <p>
              MockUSDT 任何人都可以 mint，不具备真实 USDT 价值。将使用连接钱包在
              ChainId {{ wallet?.chainId }} 上部署，精度固定为 18 位。
            </p>
            <p v-if="wallet?.chainId === 56" class="critical-copy">
              主网 ChainId 56 禁止部署 MockUSDT。
            </p>
          </q-card-section>
          <q-card-section align="right">
            <q-btn
              v-close-popup
              outline
              label="取消"
              color="grey"
              class="on-left"
            />
            <q-btn
              color="primary"
              unelevated
              label="确认部署测试币"
              :disable="!canDeployMock"
              :loading="deployingMock"
              @click="deployMockToken"
            />
          </q-card-section>
        </q-card>
      </q-dialog>
      <q-dialog v-model="clearHashOpen" persistent>
        <q-card class="confirm-card">
          <q-card-section>
            <div class="confirm-title">确认清除无回执交易哈希？</div>
            <p>
              安装器在链上找不到该交易及回执。确认钱包活动记录中该交易已丢弃后，才可清除本次哈希并重新请求签名。
            </p>
            <code>{{ stepToClear?.transactionHash }}</code>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat label="返回检查" /><q-btn
              color="negative"
              text-color="white"
              label="确认哈希无效并重试"
              @click="confirmClearHash"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
      <q-dialog v-model="unknownTransactionOpen" persistent>
        <q-card class="confirm-card">
          <q-card-section>
            <div class="confirm-title">确认钱包中没有待处理交易</div>
            <p>
              上次处理
              {{ stepToRecover?.title }}
              时没有保存到交易哈希，无法判断钱包请求是否仍在等待。请先打开钱包检查：拒绝或关闭该请求，并确认钱包活动记录中没有这笔部署交易。
            </p>
            <p>
              如果旧请求仍在钱包中，稍后批准它可能与重试产生重复部署。确认无待处理请求后，安装器才会重新请求签名。
            </p>
            <p v-if="stepToRecover?.recoveryBlocked" class="critical-copy">
              钱包的待处理 Nonce
              已变化，可能已有交易提交。请先在钱包与区块浏览器查明相关
              Nonce；确认它与本部署无关后再继续。
            </p>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat label="继续检查" />
            <q-btn
              color="primary"
              unelevated
              :label="
                stepToRecover?.recoveryBlocked
                  ? '已查明该 Nonce 与部署无关，允许重试'
                  : '已确认无待处理交易，重试此步'
              "
              @click="confirmUnknownRetry"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <div v-if="stepItems.length" ref="stepperPanel" class="stepper-wrapper">
        <InstallerCard class="stepper-panel">
          <div class="subsection-heading">
            <h3>部署进度</h3>
            <span>
              {{ completedStepCount }} / {{ stepItems.length }} 步完成
              <template v-if="pendingLoaded"> · 已恢复</template>
            </span>
          </div>
          <div v-if="runningSequence" class="sequence-running" role="status">
            <q-spinner-dots color="primary" size="20px" />
            <span>{{ activeStepPhase }}</span>
          </div>
          <q-banner
            v-if="stepFor(activeStep)?.walletRequestSlow"
            dense
            class="inline-banner warning-banner"
          >
            钱包请求等待超过 90
            秒，安装器尚未收到交易哈希。请检查钱包弹窗并确认或拒绝；此请求未结束前不会自动重试，以免重复部署。
          </q-banner>
          <q-banner
            v-if="pendingChainMismatch !== null"
            dense
            class="inline-banner warning-banner"
          >
            <template #avatar><q-icon name="history" /></template>
            检测到 ChainId
            {{ pendingChainMismatch }}
            有未完成部署。请切换回该链并使用原部署钱包继续；完成前不能在其他链开始部署。
          </q-banner>
          <q-banner
            v-if="pendingMismatch"
            dense
            class="inline-banner warning-banner"
          >
            <template #avatar><q-icon name="account_balance_wallet" /></template
            >此链未完成部署属于钱包
            {{ shortAddress(pendingMismatch) }}；请连接该钱包后继续。
          </q-banner>
          <q-banner
            v-else-if="pendingStale"
            dense
            class="inline-banner warning-banner"
          >
            <template #avatar><q-icon name="history" /></template
            >当前链未完成部署使用了不同合约计划版本，已保留原记录并阻止覆盖。
          </q-banner>
          <q-banner
            v-if="progressNotice"
            dense
            class="inline-banner error-banner contextual-error"
          >
            <template #avatar><q-icon name="error_outline" /></template
            >{{ progressNotice }}
          </q-banner>
          <q-stepper
            v-model="activeStep"
            vertical
            animated
            color="positive"
            done-color="positive"
            class="deployment-stepper"
          >
            <q-step
              v-for="(item, index) in stepItems"
              :key="item.id"
              :name="item.id"
              :title="item.title"
              :caption="item.kindLabel"
              :done="stepFor(item.id)?.status === 'success'"
              :error="stepFor(item.id)?.status === 'failed'"
              :disable="
                stepFor(item.id)?.status === 'pending' &&
                index > firstIncompleteIndex
              "
            >
              <p class="step-description">{{ item.description }}</p>
              <div v-if="stepFor(item.id)?.transactionHash" class="step-tx">
                交易哈希：<code>{{ stepFor(item.id)?.transactionHash }}</code>
              </div>
              <div v-if="stepFor(item.id)?.address" class="step-tx">
                合约地址：<code>{{ stepFor(item.id)?.address }}</code>
              </div>
              <div v-if="stepFor(item.id)?.result" class="step-tx">
                结果：<code>{{ stepFor(item.id)?.result }}</code>
              </div>
              <q-banner
                v-if="stepFor(item.id)?.error"
                dense
                class="inline-banner error-banner"
              >
                {{ stepFor(item.id)?.error }}
              </q-banner>
              <div class="step-action-row">
                <q-btn
                  v-if="
                    stepFor(item.id)?.status === 'failed' &&
                    !stepFor(item.id)?.recoveryRequired &&
                    !stepFor(item.id)?.recoveryBlocked
                  "
                  outline
                  color="dark"
                  icon="replay"
                  label="核验当前交易后重试此步"
                  :loading="runningSequence"
                  @click="retryStep(item.id)"
                />
                <q-btn
                  v-else-if="
                    stepFor(item.id)?.status === 'failed' &&
                    stepFor(item.id)?.recoveryRequired &&
                    !stepFor(item.id)?.recoveryBlocked
                  "
                  outline
                  color="dark"
                  icon="fact_check"
                  label="检查钱包请求状态后重试"
                  :loading="runningSequence"
                  @click="prepareUnknownRetry(item.id)"
                />
                <q-btn
                  v-else-if="
                    stepFor(item.id)?.status === 'failed' &&
                    stepFor(item.id)?.recoveryBlocked
                  "
                  outline
                  color="negative"
                  icon="warning"
                  label="人工核实 Nonce 后继续"
                  :loading="runningSequence"
                  @click="prepareUnknownRetry(item.id)"
                />
                <q-btn
                  v-if="
                    stepFor(item.id)?.status === 'pending' &&
                    canStart &&
                    index === firstIncompleteIndex
                  "
                  outline
                  color="primary"
                  icon="play_arrow"
                  label="从此步继续"
                  :loading="runningSequence"
                  @click="retryStep(item.id)"
                />
              </div>
            </q-step>
          </q-stepper>
        </InstallerCard>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  BrowserProvider,
  Contract,
  ContractFactory,
  isAddress,
  parseUnits,
  getCreateAddress,
  type JsonFragment,
  type Signer,
  type TransactionRequest,
  type TransactionResponse,
} from "ethers";
import { WalletConnect } from "@filereset/wallet-connect";
import type { ConnectedWallet } from "@filereset/wallet-connect";
import ContentHeading from "./ContentHeading.vue";
import InstallerCard from "./InstallerCard.vue";
import {
  installerRequest,
  postJson,
  type DeploymentStepRecord,
  type InstallationIdentity,
  type PendingDeploymentSummary,
  type SavedDeployment,
  type SavedToken,
} from "../services/installer-api";
import {
  errorMessage as describeError,
  installerFlow,
} from "../services/installer-flow";

interface DeploymentNode {
  id: string;
  contractName: string;
  kind: string;
  title?: string;
  description?: string;
  dependsOn?: string[];
  parentNodeId?: string;
  addressResolver?: { function?: string };
  constructorArgs?: Array<{
    name?: string;
    source: string;
    key?: string;
    nodeId?: string;
  }>;
}
interface DeploymentAction {
  id: string;
  kind: string;
  title: string;
  description: string;
  targetNodeId?: string;
  functionName?: string;
  arguments?: Array<{ source: string; nodeId?: string; actionId?: string }>;
  factory?: { key?: string };
  tokenA?: { nodeId?: string };
  tokenB?: { key?: string };
}
interface ContractArtifact {
  contractName: string;
  abi: JsonFragment[];
  bytecode: string | { object: string };
}
interface VerificationRule {
  id: string;
  targetNodeId: string;
  getter: string;
  expected: { source: string; nodeId?: string };
}
interface DeploymentPlan {
  releaseVersion: string;
  nodes: DeploymentNode[];
  postDeploymentActions: DeploymentAction[];
  verificationRules: VerificationRule[];
}
interface ContractPackage {
  exists: boolean;
  chainId: number;
  releaseVersion: string;
  plan: DeploymentPlan;
  networkConfig?: {
    defaults?: {
      externalAddresses?: Record<string, string>;
      wallets?: Record<string, string>;
      oracle?: Record<string, number | string>;
    };
  };
  artifacts: Record<string, ContractArtifact>;
  artifactsReady: boolean;
  mockArtifact?: ContractArtifact;
  externalAbis: Record<string, string[]>;
  outputRoot: string;
}
interface LocalStep extends DeploymentStepRecord {
  attempts?: string[];
}
type DeploymentPhase = NonNullable<LocalStep["phase"]>;
interface DeploymentContract {
  contractName: string;
  nodeId: string;
  address: string;
  transactionHash?: string;
  chainId: number;
  deployer: string;
  createdAt: string;
  source?: string;
}
interface DeploymentConfiguration {
  installation: Omit<InstallationIdentity, "chainId"> & { chainId: number };
  externalAddresses: { router: string; factory: string; paymentToken: string };
  roleWallets: {
    operator: string;
    launch: string;
    batchRegistrar: string;
    pauser: string;
  };
  assetWallets: {
    ecosystemWallet: string;
    proceedsWallet: string;
    fundingWallet: string;
    feeWallet: string;
    recoveryWallet: string;
  };
  oracle: {
    samplePeriodSeconds: number;
    minimumPaymentReserve: string;
    minimumPaymentReserveRaw: string;
    tokenDecimals: number;
  };
  deployer: string;
}
interface PendingDeployment {
  releaseVersion?: string;
  deployer?: string;
  configuration?: DeploymentConfiguration;
  contracts?: Record<string, DeploymentContract>;
  pairAddress?: string;
  steps?: LocalStep[];
}
interface StepResult {
  address?: string;
  record?: DeploymentContract;
  result?: string;
  pairAddress?: string;
}

const props = defineProps<{
  projectId: string;
  installation: InstallationIdentity;
}>();
const emit = defineEmits<{ completed: [deployment: SavedDeployment] }>();
const router = useRouter();
const wallet = ref<ConnectedWallet | null>(null);
const packageInfo = ref<ContractPackage | null>(null);
const packageError = ref("");
const loadingPackage = ref(false);
const compiling = ref(false);
const externalAddresses = reactive({
  router: "",
  factory: "",
  paymentToken: "",
});
const roleWallets = reactive({
  operator: "",
  launch: "",
  batchRegistrar: "",
  pauser: "",
});
const assetWallets = reactive({
  ecosystemWallet: "",
  proceedsWallet: "",
  fundingWallet: "",
  feeWallet: "",
  recoveryWallet: "",
});
const oracle = reactive({
  samplePeriodSeconds: 300,
  minimumPaymentReserve: "1000",
});
const tokenOptions = ref<string[]>([]);
const tokenInfo = ref<{ symbol: string; decimals: number } | null>(null);
const tokenVerified = ref(false);
const verifiedTokenAddress = ref("");
const tokenStatus = ref("");
const mockStatus = ref("");
const mockError = ref("");
const dexVerified = ref(false);
const verifiedDexAddresses = ref("");
const dexStatus = ref("");
const verifyingToken = ref(false);
const verifyingDex = ref(false);
const mockConfirmOpen = ref(false);
const deployingMock = ref(false);
const savedDeployments = ref<SavedDeployment[]>([]);
const pendingMismatch = ref("");
const pendingChainMismatch = ref<number | null>(null);
const pendingStale = ref(false);
const pendingLoaded = ref(false);
const pendingDeployment = ref<PendingDeployment | null>(null);
const contracts = ref<Record<string, DeploymentContract>>({});
const localSteps = ref<LocalStep[]>([]);
const activeStep = ref("");
const stepperPanel = ref<HTMLElement | null>(null);
const pairAddress = ref("");
// 按消息来源展示：开始前校验靠近操作按钮，流程级异常放在进度卡片。
const preflightError = ref("");
const progressNotice = ref("");
const confirmDeployOpen = ref(false);
const clearHashOpen = ref(false);
const stepToClear = ref<LocalStep | null>(null);
const unknownTransactionOpen = ref(false);
const stepToRecover = ref<LocalStep | null>(null);
const runningSequence = ref(false);
const stopSequence = ref(false);
const lastLoadedChain = ref<number | null>(null);
const loadingChain = ref<number | null>(null);
const walletChangePending = ref(false);
let chainDataRequestId = 0;

const roleFields: Array<{ key: keyof typeof roleWallets; label: string }> = [
  { key: "operator", label: "OPERATOR_ROLE 钱包" },
  { key: "launch", label: "LAUNCH_ROLE 钱包" },
  { key: "batchRegistrar", label: "BATCH_REGISTRAR_ROLE 钱包" },
  { key: "pauser", label: "PAUSER_ROLE 钱包" },
];
const assetFields: Array<{ key: keyof typeof assetWallets; label: string }> = [
  { key: "ecosystemWallet", label: "生态钱包" },
  { key: "proceedsWallet", label: "预售回款钱包" },
  { key: "fundingWallet", label: "流动性资金钱包" },
  { key: "feeWallet", label: "手续费钱包" },
  { key: "recoveryWallet", label: "恢复/多签钱包" },
];
const chainNames: Record<number, string> = {
  56: "BNB Smart Chain 主网",
  97: "BNB Smart Chain 测试网",
};
const chainName = computed(
  () => chainNames[wallet.value?.chainId ?? 0] ?? "自定义网络",
);
const transactionNodeCount = computed(
  () =>
    packageInfo.value?.plan.nodes.filter((node) => node.kind === "transaction")
      .length ?? 0,
);
const actionCount = computed(
  () => packageInfo.value?.plan.postDeploymentActions.length ?? 0,
);
function replaceTokenSymbol(value: string) {
  // 计划文案中的默认简称使用本次安装确认的符号显示。
  return value.replaceAll("FRC", props.installation.tokenSymbol);
}
const minimumReserveRaw = computed(() => {
  const decimals = tokenInfo.value?.decimals ?? 18;
  if (
    !oracle.minimumPaymentReserve ||
    !/^\d+(\.\d+)?$/.test(oracle.minimumPaymentReserve)
  )
    return "";
  try {
    return parseUnits(oracle.minimumPaymentReserve, decimals).toString();
  } catch {
    return "";
  }
});
const stepItems = computed(() => {
  const plan = packageInfo.value?.plan;
  if (!plan) return [];
  return [
    ...plan.nodes.map((node) => ({
      id: node.id,
      title: node.contractName,
      description:
        node.kind === "nested"
          ? `部署 ${node.parentNodeId} 后自动读取 ${node.addressResolver?.function ?? "地址"}，此步骤不产生新交易。`
          : `${node.contractName} · 合约部署交易`,
      kindLabel: node.kind === "nested" ? "链上读取" : "部署交易",
      kind: node.kind,
    })),
    ...plan.postDeploymentActions.map((action) => ({
      id: action.id,
      title: replaceTokenSymbol(action.title),
      description: replaceTokenSymbol(action.description),
      kindLabel: action.kind === "getOrCreatePair" ? "核验或交易" : "配置交易",
      kind: action.kind,
    })),
    {
      id: "verify-deployment",
      title: "最终链上核验",
      description: "核验角色授权、模块绑定和交易对地址，并输出完整部署资料。",
      kindLabel: "只读核验",
      kind: "verify",
    },
  ];
});
const firstIncompleteIndex = computed(() => {
  const index = stepItems.value.findIndex(
    (item) => stepFor(item.id)?.status !== "success",
  );
  return index < 0 ? stepItems.value.length : index;
});
const completedStepCount = computed(
  () => localSteps.value.filter((step) => step.status === "success").length,
);
const activeStepTitle = computed(
  () =>
    stepItems.value.find((item) => item.id === activeStep.value)?.title ??
    "部署流程",
);
const activeStepPhase = computed(() => {
  const messages: Record<DeploymentPhase, string> = {
    preparing: `正在准备：${activeStepTitle.value}`,
    estimating: `正在估算链上 Gas：${activeStepTitle.value}`,
    awaiting_wallet: `请在钱包中确认：${activeStepTitle.value}`,
    waiting_receipt: `交易已提交，等待链上回执：${activeStepTitle.value}`,
    recovery_required: `需要先核对钱包交易状态：${activeStepTitle.value}`,
  };
  return messages[stepFor(activeStep.value)?.phase ?? "preparing"];
});
const canStart = computed(() =>
  Boolean(
    wallet.value &&
    !walletChangePending.value &&
    !loadingPackage.value &&
    !compiling.value &&
    (props.installation.chainId === null ||
      wallet.value.chainId === props.installation.chainId) &&
    packageInfo.value?.exists &&
    packageInfo.value.artifactsReady &&
    !pendingMismatch.value &&
    pendingChainMismatch.value === null &&
    !pendingStale.value,
  ),
);
const canDeployMock = computed(() =>
  Boolean(
    wallet.value &&
    wallet.value.chainId !== 56 &&
    packageInfo.value?.mockArtifact &&
    !walletChangePending.value &&
    !runningSequence.value &&
    !deployingMock.value &&
    pendingChainMismatch.value === null &&
    !pendingMismatch.value &&
    !pendingStale.value,
  ),
);

watch(
  () => externalAddresses.paymentToken.toLowerCase(),
  (address) => {
    if (address !== verifiedTokenAddress.value) {
      tokenVerified.value = false;
      tokenInfo.value = null;
      tokenStatus.value = "支付 Token 地址已变化，请重新核验。";
      mockStatus.value = "";
      mockError.value = "";
    }
  },
);
watch(
  () =>
    `${externalAddresses.router.toLowerCase()}:${externalAddresses.factory.toLowerCase()}`,
  (addresses) => {
    if (addresses !== verifiedDexAddresses.value) {
      dexVerified.value = false;
      dexStatus.value = "Router 或 Factory 地址已变化，请重新核验。";
    }
  },
);

function stepFor(id: string) {
  return localSteps.value.find((step) => step.id === id);
}
function currentStepPhase(step: LocalStep): DeploymentPhase | undefined {
  return step.phase;
}
function createSteps() {
  localSteps.value = stepItems.value.map((item) => ({
    id: item.id,
    title: item.title,
    status: "pending",
  }));
  activeStep.value = stepItems.value[0]?.id ?? "";
}
function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function onWalletConnected(value: ConnectedWallet) {
  wallet.value = value;
  void prepareWalletChain(value);
}
function onWalletChanged(value: ConnectedWallet) {
  wallet.value = value;
  if (runningSequence.value) {
    stopSequence.value = true;
    progressNotice.value =
      "钱包账户或网络已确认同步，本次部署将停止后续步骤；请先核对当前步骤的交易状态。";
  }
  const activeChain = loadingPackage.value
    ? loadingChain.value
    : lastLoadedChain.value;
  if (value.chainId !== activeChain) {
    void prepareWalletChain(value);
  } else {
    void refreshPendingForWallet();
  }
}

function onWalletChangePending(pending: boolean) {
  walletChangePending.value = pending;
  if (pending) {
    confirmDeployOpen.value = false;
    mockConfirmOpen.value = false;
  }
  if (pending && runningSequence.value) {
    progressNotice.value =
      "检测到钱包账户或网络切换。同步新状态会停止后续步骤；若这是临时切换，切回原账户和网络后会继续。";
  } else if (
    !pending &&
    runningSequence.value &&
    !stopSequence.value &&
    progressNotice.value.startsWith("检测到钱包账户或网络切换")
  ) {
    progressNotice.value = "";
  }
}

function onWalletDisconnected() {
  walletChangePending.value = false;
  wallet.value = null;
  if (runningSequence.value) {
    stopSequence.value = true;
    progressNotice.value = "钱包已断开，后续链上写入已停止。";
  }
}

async function prepareWalletChain(value: ConnectedWallet) {
  packageError.value = "";
  if (
    props.installation.chainId !== null &&
    value.chainId !== props.installation.chainId
  ) {
    packageInfo.value = null;
    lastLoadedChain.value = value.chainId;
    packageError.value = `当前钱包 ChainId ${value.chainId} 与安装时锁定的 ChainId ${props.installation.chainId} 不一致。请切换网络后重试。`;
    return;
  }
  if (value.chainId !== lastLoadedChain.value) packageInfo.value = null;
  await loadChainData(true);
}

async function loadChainData(resetDefaults: boolean) {
  if (!wallet.value) return;
  const requestId = ++chainDataRequestId;
  const chainId = wallet.value.chainId;
  if (
    props.installation.chainId !== null &&
    chainId !== props.installation.chainId
  ) {
    packageInfo.value = null;
    savedDeployments.value = [];
    lastLoadedChain.value = null;
    packageError.value = `当前钱包 ChainId ${chainId} 与安装时锁定的 ChainId ${props.installation.chainId} 不一致。请切换网络后重试。`;
    return;
  }
  loadingPackage.value = true;
  loadingChain.value = chainId;
  packageError.value = "";
  pendingChainMismatch.value = null;
  preflightError.value = "";
  progressNotice.value = "";
  pendingLoaded.value = false;
  try {
    const loaded = await installerRequest<ContractPackage>(
      `/contracts/package?chainId=${chainId}`,
    );
    if (requestId !== chainDataRequestId) return;
    packageInfo.value = loaded;
    if (!loaded.exists) {
      packageError.value = "合约不存在：安装器未找到 contracts/code 部署计划。";
      return;
    }
    if (resetDefaults || lastLoadedChain.value !== chainId)
      applyNetworkDefaults();
    const [tokens, runs, pending, pendingRuns] = await Promise.all([
      installerRequest<{ tokens: SavedToken[] }>(
        `/contracts/tokens/${chainId}`,
      ),
      installerRequest<{ deployments: SavedDeployment[] }>(
        `/contracts/deployments/${chainId}`,
      ),
      installerRequest<PendingDeployment | null>(
        `/contracts/pending/${chainId}`,
      ),
      installerRequest<{ pending: PendingDeploymentSummary[] }>(
        "/contracts/pending",
      ),
    ]);
    if (requestId !== chainDataRequestId) return;
    pendingChainMismatch.value =
      pendingRuns.pending.find((record) => record.chainId !== chainId)
        ?.chainId ?? null;
    tokenOptions.value = (tokens.tokens ?? []).map((token) => token.address);
    if (
      externalAddresses.paymentToken &&
      !tokenOptions.value.includes(externalAddresses.paymentToken)
    )
      tokenOptions.value.unshift(externalAddresses.paymentToken);
    savedDeployments.value = runs.deployments ?? [];
    pendingStale.value = Boolean(
      pending && pending.releaseVersion !== loaded.releaseVersion,
    );
    if (pending?.releaseVersion === loaded.releaseVersion) {
      pendingDeployment.value = pending;
      pendingLoaded.value = true;
      if (
        String(pending.deployer).toLowerCase() !==
        wallet.value.address.toLowerCase()
      ) {
        pendingMismatch.value = String(pending.deployer);
      } else {
        pendingMismatch.value = "";
        if (pending.configuration) applyConfiguration(pending.configuration);
        contracts.value = pending.contracts ?? {};
        pairAddress.value = String(pending.pairAddress ?? "");
        restorePendingSteps(pending.steps ?? []);
      }
    } else {
      pendingDeployment.value = null;
      pendingMismatch.value = "";
      pendingLoaded.value = false;
      contracts.value = {};
      pairAddress.value = "";
      createSteps();
    }
    lastLoadedChain.value = chainId;
  } catch (error) {
    if (requestId === chainDataRequestId)
      packageError.value = describeError(error);
  } finally {
    if (requestId === chainDataRequestId) {
      loadingPackage.value = false;
      loadingChain.value = null;
    }
  }
}

async function refreshPendingForWallet() {
  const currentWallet = wallet.value;
  if (!currentWallet || loadingPackage.value) return;
  const chainId = currentWallet.chainId;
  try {
    const [pending, pendingRuns] = await Promise.all([
      installerRequest<PendingDeployment | null>(
        `/contracts/pending/${chainId}`,
      ),
      installerRequest<{ pending: PendingDeploymentSummary[] }>(
        "/contracts/pending",
      ),
    ]);
    if (
      !wallet.value ||
      wallet.value.chainId !== chainId ||
      wallet.value.address.toLowerCase() !== currentWallet.address.toLowerCase()
    )
      return;
    pendingChainMismatch.value =
      pendingRuns.pending.find((record) => record.chainId !== chainId)
        ?.chainId ?? null;
    const currentPending =
      pending?.releaseVersion === packageInfo.value?.releaseVersion
        ? pending
        : null;
    pendingStale.value = Boolean(pending && !currentPending);
    pendingLoaded.value = Boolean(currentPending);
    pendingDeployment.value = currentPending;
    pendingMismatch.value =
      currentPending &&
      String(currentPending.deployer).toLowerCase() !==
        wallet.value.address.toLowerCase()
        ? String(currentPending.deployer)
        : "";
  } catch (error) {
    pendingStale.value = true;
    packageError.value = describeError(error);
  }
}

function applyNetworkDefaults() {
  const defaults = packageInfo.value?.networkConfig?.defaults;
  if (!defaults) return;
  const external = defaults.externalAddresses ?? {};
  externalAddresses.router = String(external.router ?? "");
  externalAddresses.factory = String(external.factory ?? "");
  externalAddresses.paymentToken = String(external.paymentToken ?? "");
  const wallets = defaults.wallets ?? {};
  for (const key of Object.keys(roleWallets) as Array<
    keyof typeof roleWallets
  >) {
    const value = String(wallets[key] ?? "");
    roleWallets[key] =
      value === "DEPLOYER"
        ? (wallet.value?.address ?? "")
        : value.startsWith("SET_")
          ? ""
          : value;
  }
  for (const key of Object.keys(assetWallets) as Array<
    keyof typeof assetWallets
  >) {
    const value = String(wallets[key] ?? "");
    assetWallets[key] =
      value === "DEPLOYER"
        ? (wallet.value?.address ?? "")
        : value.startsWith("SET_")
          ? ""
          : value;
  }
  const reserve = String(
    defaults.oracle?.minimumPaymentReserve ?? "1000000000000000000000",
  );
  try {
    oracle.minimumPaymentReserve = (BigInt(reserve) / 10n ** 18n).toString();
  } catch {
    oracle.minimumPaymentReserve = "1000";
  }
  oracle.samplePeriodSeconds = Number(
    defaults.oracle?.samplePeriodSeconds ?? 300,
  );
  tokenInfo.value = null;
  tokenVerified.value = false;
  verifiedTokenAddress.value = "";
  tokenStatus.value = "";
  dexVerified.value = false;
  verifiedDexAddresses.value = "";
  dexStatus.value = "";
}

function applyConfiguration(value: DeploymentConfiguration) {
  const external = value.externalAddresses ?? {};
  Object.assign(externalAddresses, {
    router: external.router ?? "",
    factory: external.factory ?? "",
    paymentToken: external.paymentToken ?? "",
  });
  Object.assign(roleWallets, value.roleWallets ?? {});
  Object.assign(assetWallets, value.assetWallets ?? {});
  Object.assign(oracle, value.oracle ?? {});
}

function restorePendingSteps(saved: LocalStep[]) {
  createSteps();
  for (const step of saved) {
    const current = stepFor(step.id);
    if (!current) continue;
    Object.assign(current, step);
    if (current.status === "running") {
      // 刷新后无法知道钱包是否仍持有未完成请求，必须先检查并确认才能重试。
      current.status = "failed";
      current.walletRequestSlow = false;
      current.recoveryRequired = !current.transactionHash;
      current.phase = current.transactionHash
        ? "waiting_receipt"
        : "recovery_required";
      current.error = current.transactionHash
        ? "已恢复未完成的链上交易，将先核验该哈希及回执。"
        : "上次请求未保存交易哈希；请先核对钱包活动记录和待处理请求，再确认是否重试。";
    }
  }
  activeStep.value =
    stepItems.value.find((item) => stepFor(item.id)?.status !== "success")
      ?.id ??
    stepItems.value.at(-1)?.id ??
    "";
}

async function compilePackage() {
  compiling.value = true;
  packageError.value = "";
  try {
    await postJson<{ compiled: boolean; output: string }>(
      "/contracts/compile",
      {},
    );
    await loadChainData(false);
  } catch (error) {
    packageError.value = describeError(error);
  } finally {
    compiling.value = false;
  }
}

function browserProvider() {
  if (!wallet.value) throw new Error("请先连接钱包。");
  return new BrowserProvider(wallet.value.provider as never);
}

async function verifyDex() {
  verifyingDex.value = true;
  dexStatus.value = "";
  dexVerified.value = false;
  try {
    if (
      !isAddress(externalAddresses.router) ||
      !isAddress(externalAddresses.factory)
    )
      throw new Error("Router 和 Factory 都必须是有效地址。");
    const provider = browserProvider();
    const [routerCode, factoryCode] = await Promise.all([
      provider.getCode(externalAddresses.router),
      provider.getCode(externalAddresses.factory),
    ]);
    if (routerCode === "0x" || factoryCode === "0x")
      throw new Error("Router 或 Factory 地址上没有合约代码。");
    const router = new Contract(
      externalAddresses.router,
      packageInfo.value?.externalAbis.PancakeV2Router ?? [
        "function factory() view returns(address)",
      ],
      provider,
    );
    const actualFactory = String(await router.getFunction("factory")());
    if (actualFactory.toLowerCase() !== externalAddresses.factory.toLowerCase())
      throw new Error(
        `Router.factory() 返回 ${actualFactory}，与输入 Factory 不一致。`,
      );
    dexVerified.value = true;
    verifiedDexAddresses.value = `${externalAddresses.router.toLowerCase()}:${externalAddresses.factory.toLowerCase()}`;
    dexStatus.value = `地址均有合约代码，且 Router.factory() = ${shortAddress(actualFactory)}。`;
  } catch (error) {
    verifiedDexAddresses.value = "";
    dexStatus.value = describeError(error);
  } finally {
    verifyingDex.value = false;
  }
}

async function verifyToken() {
  verifyingToken.value = true;
  tokenStatus.value = "";
  tokenVerified.value = false;
  try {
    if (!isAddress(externalAddresses.paymentToken))
      throw new Error("请输入有效的支付 Token 地址。");
    const provider = browserProvider();
    const code = await provider.getCode(externalAddresses.paymentToken);
    if (code === "0x") throw new Error("支付 Token 地址上没有合约代码。");
    const token = new Contract(
      externalAddresses.paymentToken,
      packageInfo.value?.externalAbis.PaymentToken ?? [
        "function decimals() view returns(uint8)",
        "function symbol() view returns(string)",
      ],
      provider,
    );
    const [decimals, symbol] = await Promise.all([
      token.getFunction("decimals")(),
      token.getFunction("symbol")(),
    ]);
    tokenInfo.value = { decimals: Number(decimals), symbol: String(symbol) };
    tokenVerified.value = Number(decimals) <= 36;
    if (!tokenVerified.value)
      throw new Error("Token 精度超过 36，无法安全换算 Oracle 参数。");
    tokenStatus.value = `核验通过：${String(symbol)} · ${Number(decimals)} 位精度。`;
    verifiedTokenAddress.value = externalAddresses.paymentToken.toLowerCase();
  } catch (error) {
    tokenVerified.value = false;
    tokenInfo.value = null;
    verifiedTokenAddress.value = "";
    tokenStatus.value = describeError(error);
  } finally {
    verifyingToken.value = false;
  }
}

async function deployMockToken() {
  mockConfirmOpen.value = false;
  if (
    !wallet.value ||
    !packageInfo.value?.mockArtifact ||
    wallet.value.chainId === 56 ||
    walletChangePending.value ||
    pendingChainMismatch.value !== null ||
    pendingMismatch.value ||
    pendingStale.value
  )
    return;
  const artifact = packageInfo.value.mockArtifact;
  deployingMock.value = true;
  mockError.value = "";
  mockStatus.value = "正在等待钱包确认 MockUSDT 部署交易…";
  const deployWallet = { ...wallet.value };
  let transactionHash = "";
  try {
    await assertWalletContext(deployWallet);
    const provider = browserProvider();
    const signer = await provider.getSigner();
    const bytecode =
      typeof artifact.bytecode === "string"
        ? artifact.bytecode
        : artifact.bytecode.object;
    const factory = new ContractFactory(artifact.abi, bytecode, signer);
    const contract = await factory.deploy(18);
    const transaction = contract.deploymentTransaction();
    if (!transaction) throw new Error("钱包未返回 MockUSDT 部署交易。");
    transactionHash = transaction.hash;
    mockStatus.value = `MockUSDT 交易已提交：${transactionHash}，等待链上回执…`;
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1)
      throw new Error(`MockUSDT 部署未成功：${transactionHash}`);
    const address = await contract.getAddress();
    const token: SavedToken = {
      chainId: deployWallet.chainId,
      address,
      symbol: "USDT",
      decimals: 18,
      transactionHash,
      deployer: deployWallet.address,
      createdAt: new Date().toISOString(),
    };
    const saved = await postJson<{ tokens: SavedToken[] }>(
      `/contracts/tokens/${deployWallet.chainId}`,
      token,
    );
    tokenOptions.value = saved.tokens.map((item) => item.address);
    externalAddresses.paymentToken = address;
    tokenInfo.value = { symbol: token.symbol, decimals: token.decimals };
    tokenVerified.value = true;
    verifiedTokenAddress.value = address.toLowerCase();
    tokenStatus.value = "MockUSDT 已部署并保存到当前 ChainId 的 tokens.json。";
    mockStatus.value = "";
  } catch (error) {
    mockError.value = transactionHash
      ? `${describeError(error)} 交易哈希：${transactionHash}`
      : describeError(error);
  } finally {
    deployingMock.value = false;
    mockStatus.value = "";
  }
}

async function prepareDeployment() {
  preflightError.value = "";
  try {
    await preflight();
    confirmDeployOpen.value = true;
  } catch (error) {
    preflightError.value = describeError(error);
  }
}

async function preflight() {
  if (walletChangePending.value)
    throw new Error("检测到钱包账户或网络切换，请先在弹窗中确认同步。");
  if (pendingChainMismatch.value !== null)
    throw new Error(
      `ChainId ${pendingChainMismatch.value} 有未完成部署，请切回该链和原部署钱包继续。`,
    );
  if (pendingMismatch.value || pendingStale.value)
    throw new Error("当前链存在不能安全续跑的未完成部署，请先检查进度提示。");
  if (loadingPackage.value || compiling.value)
    throw new Error("合约信息仍在加载或编译，请完成后再开始部署。");
  if (!wallet.value || !packageInfo.value?.artifactsReady)
    throw new Error("请连接钱包并确保合约已编译。");
  if (
    props.installation.chainId !== null &&
    wallet.value.chainId !== props.installation.chainId
  )
    throw new Error(
      `当前钱包 ChainId ${wallet.value.chainId} 与安装时锁定的 ChainId ${props.installation.chainId} 不一致。`,
    );
  if (wallet.value.chainId === 56 && !externalAddresses.paymentToken)
    throw new Error("请填写 BSC 主网支付 Token 地址。");
  const requiredAddresses = [
    externalAddresses.router,
    externalAddresses.factory,
    externalAddresses.paymentToken,
    ...Object.values(roleWallets),
    ...Object.values(assetWallets),
  ];
  if (requiredAddresses.some((address) => !isAddress(address)))
    throw new Error("请填写所有 Router、Factory、Token 与角色/资产钱包地址。");
  if (
    !tokenVerified.value ||
    verifiedTokenAddress.value !== externalAddresses.paymentToken.toLowerCase()
  )
    throw new Error("请先核验当前支付 Token 地址并确认其精度。");
  if (
    !dexVerified.value ||
    verifiedDexAddresses.value !==
      `${externalAddresses.router.toLowerCase()}:${externalAddresses.factory.toLowerCase()}`
  )
    throw new Error("请先核验当前 Router.factory() 与 Factory 地址。");
  if (!minimumReserveRaw.value)
    throw new Error("Oracle 最低储备量格式无效或超过 Token 精度。");
  if (
    !Number.isSafeInteger(oracle.samplePeriodSeconds) ||
    oracle.samplePeriodSeconds < 1
  )
    throw new Error("Oracle 采样周期必须是正整数秒。");
  const snapshot = { ...wallet.value };
  await assertWalletContext(snapshot);
  const provider = browserProvider();
  const balance = await provider.getBalance(snapshot.address);
  if (balance === 0n) throw new Error("部署钱包余额为零，无法支付链上手续费。");
}

async function startDeployment() {
  confirmDeployOpen.value = false;
  preflightError.value = "";
  progressNotice.value = "";
  try {
    await preflight();
    const currentWallet = { ...wallet.value! };
    await assertWalletContext(currentWallet);
  } catch (error) {
    preflightError.value = describeError(error);
    return;
  }
  runningSequence.value = true;
  stopSequence.value = false;
  await nextTick();
  stepperPanel.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  let failedInStep = false;
  try {
    const currentWallet = { ...wallet.value! };
    const configuration = snapshotConfiguration(currentWallet);
    if (!localSteps.value.length) createSteps();
    await persistPending(currentWallet, configuration);
    for (let index = 0; index < stepItems.value.length; index += 1) {
      const item = stepItems.value[index];
      if (!item) continue;
      if (stopSequence.value)
        throw new Error(
          "检测到账户或网络变化，后续写入已停止；已完成步骤和交易哈希已保存。",
        );
      const step = stepFor(item.id);
      if (!step || step.status === "success") continue;
      activeStep.value = item.id;
      step.status = "running";
      step.phase = "preparing";
      step.error = undefined;
      step.walletRequestSlow = false;
      step.recoveryRequired = false;
      step.recoveryBlocked = false;
      await persistPending(currentWallet, configuration);
      try {
        const result = await executeStep(
          item.id,
          currentWallet,
          configuration,
          step,
        );
        step.status = "success";
        step.completedAt = new Date().toISOString();
        if (result.address) step.address = result.address;
        if (result.result) step.result = result.result;
        if (result.record) contracts.value[item.id] = result.record;
        if (result.pairAddress) pairAddress.value = result.pairAddress;
        await persistPending(currentWallet, configuration);
      } catch (error) {
        failedInStep = true;
        const walletResultUnknown =
          currentStepPhase(step) === "awaiting_wallet" && !step.transactionHash;
        step.status = "failed";
        step.phase = walletResultUnknown ? "recovery_required" : undefined;
        step.walletRequestSlow = false;
        step.recoveryRequired = walletResultUnknown;
        step.error = walletResultUnknown
          ? `${describeError(error)} 钱包未返回交易哈希；请先核对钱包活动和待处理请求，再决定是否重试。`
          : describeError(error);
        await persistPending(currentWallet, configuration).catch(
          () => undefined,
        );
        throw error;
      }
      const walletChanged =
        !wallet.value ||
        wallet.value.chainId !== currentWallet.chainId ||
        wallet.value.address.toLowerCase() !==
          currentWallet.address.toLowerCase();
      if (walletChanged) stopSequence.value = true;
      activeStep.value = stepItems.value[index + 1]?.id ?? item.id;
    }
    if (stopSequence.value)
      throw new Error(
        "钱包状态已变化，部署资料尚未完成归档；请切回本次部署的钱包后继续。",
      );
    await assertWalletContext(currentWallet);
    await completeDeployment(currentWallet, configuration);
  } catch (error) {
    if (!failedInStep) progressNotice.value = describeError(error);
  } finally {
    runningSequence.value = false;
  }
}

async function retryStep(stepId: string) {
  if (!stepFor(stepId) || !wallet.value) return;
  await runFromStep(stepId);
}

async function prepareUnknownRetry(stepId: string) {
  const step = stepFor(stepId);
  if (!step || !wallet.value || runningSequence.value) return;
  const snapshot = { ...wallet.value };
  try {
    await assertWalletContext(snapshot);
    if (typeof step.startingNonce === "number") {
      const currentNonce = await withTimeout(
        browserProvider().getTransactionCount(snapshot.address, "pending"),
        15_000,
        "钱包 Nonce 查询超时，请检查 RPC 后重试。",
      );
      if (currentNonce > step.startingNonce) {
        step.recoveryBlocked = true;
        step.recoveryRequired = false;
        step.error = `钱包待处理 Nonce 已从 ${step.startingNonce} 增至 ${currentNonce}，可能已有未知交易提交。为避免重复部署，已锁定重试；请先在钱包和区块浏览器查明该 Nonce 对应的交易。`;
        await persistPending(snapshot, snapshotConfiguration(snapshot));
      }
    }
    stepToRecover.value = step;
    unknownTransactionOpen.value = true;
  } catch (error) {
    progressNotice.value = describeError(error);
  }
}

async function confirmUnknownRetry() {
  const step = stepToRecover.value;
  if (!step || !wallet.value || runningSequence.value) return;
  step.status = "pending";
  step.phase = undefined;
  step.error = undefined;
  step.startingNonce = undefined;
  step.recoveryRequired = false;
  step.recoveryBlocked = false;
  unknownTransactionOpen.value = false;
  stepToRecover.value = null;
  await runFromStep(step.id);
}

function confirmClearHash() {
  if (stepToClear.value) {
    stepToClear.value.attempts = [
      ...(stepToClear.value.attempts ?? []),
      stepToClear.value.transactionHash ?? "",
    ];
    stepToClear.value.transactionHash = undefined;
    stepToClear.value.status = "failed";
  }
  clearHashOpen.value = false;
  if (stepToClear.value) void runFromStep(stepToClear.value.id);
  stepToClear.value = null;
}

async function runFromStep(stepId: string) {
  if (!wallet.value) return;
  activeStep.value = stepId;
  await startDeployment();
}

async function assertWalletContext(snapshot: ConnectedWallet) {
  if (walletChangePending.value) {
    stopSequence.value = true;
    throw new Error("检测到钱包切换尚未同步，已停止后续写入。");
  }
  const provider = browserProvider();
  const network = await provider.getNetwork();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  if (
    Number(network.chainId) !== snapshot.chainId ||
    (props.installation.chainId !== null &&
      snapshot.chainId !== props.installation.chainId) ||
    address.toLowerCase() !== snapshot.address.toLowerCase()
  ) {
    stopSequence.value = true;
    throw new Error("当前钱包账户或网络与部署确认时不同，已停止后续写入。");
  }
}

function snapshotConfiguration(
  snapshot: ConnectedWallet,
): DeploymentConfiguration {
  return {
    installation: { ...props.installation, chainId: snapshot.chainId },
    externalAddresses: { ...externalAddresses },
    roleWallets: { ...roleWallets },
    assetWallets: { ...assetWallets },
    oracle: {
      samplePeriodSeconds: oracle.samplePeriodSeconds,
      minimumPaymentReserve: oracle.minimumPaymentReserve,
      minimumPaymentReserveRaw: minimumReserveRaw.value,
      tokenDecimals: tokenInfo.value?.decimals ?? 18,
    },
    deployer: wallet.value?.address ?? "",
  };
}

async function persistPending(
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
) {
  const pending = {
    status: "in_progress",
    releaseVersion: packageInfo.value?.releaseVersion,
    chainId: snapshot.chainId,
    deployer: snapshot.address,
    configuration,
    contracts: contracts.value,
    pairAddress: pairAddress.value,
    steps: localSteps.value,
  };
  pendingDeployment.value = pending;
  pendingLoaded.value = true;
  await postJson(`/contracts/pending/${snapshot.chainId}`, pending);
}

async function executeStep(
  id: string,
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
  step: LocalStep,
): Promise<StepResult> {
  await assertWalletContext(snapshot);
  const provider = browserProvider();
  const signer = await provider.getSigner();
  const plan = packageInfo.value!.plan;
  const node = plan.nodes.find((candidate) => candidate.id === id);
  const recovered = await resolveRecordedTransaction(
    id,
    snapshot,
    configuration,
    step,
    provider,
  );
  if (recovered) return recovered;
  if (node?.kind === "nested") {
    const parent = contracts.value[node.parentNodeId ?? ""];
    if (!parent?.address)
      throw new Error(`缺少父合约 ${node.parentNodeId} 的部署地址。`);
    const artifact =
      packageInfo.value!.artifacts[
        packageInfo.value!.plan.nodes.find(
          (candidate) => candidate.id === node.parentNodeId,
        )?.contractName ??
          node.parentNodeId ??
          ""
      ];
    if (!artifact) throw new Error(`缺少 ${node.parentNodeId} ABI。`);
    const contract = new Contract(parent.address, artifact.abi, provider);
    const getter = node.addressResolver?.function ?? "lpVault";
    const address = String(await contract.getFunction(getter)());
    if (!isAddress(address) || (await provider.getCode(address)) === "0x")
      throw new Error(`${getter} 未返回有效合约地址。`);
    return {
      address,
      record: {
        contractName: node.contractName,
        nodeId: node.id,
        address,
        chainId: snapshot.chainId,
        deployer: snapshot.address,
        createdAt: new Date().toISOString(),
        source: `${node.parentNodeId}.${getter}`,
      },
    };
  }
  if (node?.kind === "transaction") {
    const artifact = packageInfo.value!.artifacts[node.contractName];
    if (!artifact) throw new Error(`找不到 ${node.contractName} 编译产物。`);
    const args = (node.constructorArgs ?? []).map((argument) =>
      resolveConstructorArgument(argument, configuration, snapshot),
    );
    const bytecode =
      typeof artifact.bytecode === "string"
        ? artifact.bytecode
        : artifact.bytecode.object;
    const factory = new ContractFactory(artifact.abi, bytecode, signer);
    const deploymentRequest = await factory.getDeployTransaction(...args);
    const transaction = await estimateAndSend(
      deploymentRequest,
      signer,
      snapshot,
      configuration,
      step,
    );
    await captureAndWait(transaction, snapshot, configuration, step);
    const address = getCreateAddress({
      from: snapshot.address,
      nonce: transaction.nonce,
    });
    const record = {
      contractName: node.contractName,
      nodeId: node.id,
      address,
      transactionHash: transaction.hash,
      chainId: snapshot.chainId,
      deployer: snapshot.address,
      createdAt: new Date().toISOString(),
    };
    contracts.value[node.id] = record;
    return { address, record };
  }
  const action = plan.postDeploymentActions.find(
    (candidate) => candidate.id === id,
  );
  if (action)
    return executeAction(
      action,
      snapshot,
      configuration,
      step,
      provider,
      signer,
    );
  if (id === "verify-deployment") {
    await verifyDeployment(provider, configuration);
    return {
      result: `已核验 ${plan.verificationRules.length} 条部署计划规则与角色授权。`,
    };
  }
  throw new Error(`找不到部署步骤 ${id}。`);
}

async function resolveRecordedTransaction(
  id: string,
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
  step: LocalStep,
  provider: BrowserProvider,
): Promise<StepResult | null> {
  if (!step.transactionHash) return null;
  let receipt = await provider.getTransactionReceipt(step.transactionHash);
  if (!receipt) {
    const transaction = await provider.getTransaction(step.transactionHash);
    if (!transaction) {
      stepToClear.value = step;
      clearHashOpen.value = true;
      throw new Error(
        `链上暂时找不到交易 ${step.transactionHash}。请先核对钱包活动记录；确认交易已丢弃后，才能清除哈希并重新请求签名。`,
      );
    }
    receipt = await provider.waitForTransaction(step.transactionHash, 1);
  }
  if (!receipt) throw new Error(`交易 ${step.transactionHash} 尚无确认回执。`);
  if (receipt.status === 0) {
    step.attempts = [...(step.attempts ?? []), step.transactionHash];
    step.transactionHash = undefined;
    await persistPending(snapshot, configuration);
    return null;
  }
  const node = packageInfo.value!.plan.nodes.find(
    (candidate) => candidate.id === id,
  );
  if (node?.kind === "transaction") {
    const address = receipt.contractAddress;
    if (!address)
      throw new Error(
        `已确认交易 ${step.transactionHash} 没有部署地址，无法安全恢复。`,
      );
    const record = {
      contractName: node.contractName,
      nodeId: node.id,
      address,
      transactionHash: step.transactionHash,
      chainId: snapshot.chainId,
      deployer: snapshot.address,
      createdAt: new Date().toISOString(),
    };
    contracts.value[id] = record;
    return { address, record };
  }
  const action = packageInfo.value!.plan.postDeploymentActions.find(
    (candidate) => candidate.id === id,
  );
  if (action?.kind === "getOrCreatePair") {
    const factory = new Contract(
      String(configuration.externalAddresses.factory),
      packageInfo.value!.externalAbis.PancakeV2Factory ?? [
        "function getPair(address,address) view returns(address)",
      ],
      provider,
    );
    const tokenA = String(contracts.value.FileResetV2?.address ?? "");
    const tokenB = String(configuration.externalAddresses.paymentToken);
    pairAddress.value = String(
      await factory.getFunction("getPair")(tokenA, tokenB),
    );
    if (
      !isAddress(pairAddress.value) ||
      pairAddress.value === "0x0000000000000000000000000000000000000000"
    )
      throw new Error("已确认创建交易，但 Factory 尚未返回交易对地址。");
    await verifyPairAddress(pairAddress.value, tokenA, tokenB, provider);
    return { pairAddress: pairAddress.value, result: pairAddress.value };
  }
  return { result: `已从成功回执恢复：${step.transactionHash}` };
}

function resolveConstructorArgument(
  argument: NonNullable<DeploymentNode["constructorArgs"]>[number],
  configuration: DeploymentConfiguration,
  snapshot: ConnectedWallet,
): string | bigint {
  let value: string | undefined;
  if (argument.source === "deployedAddress")
    value = String(contracts.value[argument.nodeId ?? ""]?.address ?? "");
  else if (argument.source === "deployer") value = snapshot.address;
  else if (argument.key === "installation.tokenName")
    value = configuration.installation.tokenName;
  else if (argument.key === "installation.tokenSymbol")
    value = configuration.installation.tokenSymbol;
  else if (argument.key?.startsWith("externalAddresses.")) {
    const key = argument.key.split(".")[1];
    value =
      key === "router"
        ? configuration.externalAddresses.router
        : key === "factory"
          ? configuration.externalAddresses.factory
          : configuration.externalAddresses.paymentToken;
  } else if (argument.key?.startsWith("oracle.")) {
    const key = argument.key.split(".")[1] ?? "";
    value =
      key === "minimumPaymentReserve"
        ? String(configuration.oracle.minimumPaymentReserveRaw)
        : String(configuration.oracle.samplePeriodSeconds);
  } else if (argument.source === "adminInput" && argument.key) {
    const wallets: Record<string, string> = {
      ...configuration.roleWallets,
      ...configuration.assetWallets,
    };
    value = wallets[argument.key] ?? "";
  }
  if (!value) throw new Error(`无法解析构造参数 ${argument.name ?? ""}。`);
  if (
    argument.key === "oracle.samplePeriodSeconds" ||
    argument.key === "oracle.minimumPaymentReserve"
  )
    return BigInt(value);
  return value;
}

async function captureAndWait(
  transaction: TransactionResponse,
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
  step: LocalStep,
) {
  step.phase = "waiting_receipt";
  step.transactionHash = transaction.hash;
  if (step.attempts?.at(-1) !== transaction.hash)
    step.attempts = [...(step.attempts ?? []), transaction.hash];
  await persistPending(snapshot, configuration);
  const receipt = await transaction.wait(1);
  if (!receipt || receipt.status !== 1)
    throw new Error(`交易回滚或未确认：${transaction.hash}`);
  step.transactionHash = transaction.hash;
}

async function estimateAndSend(
  request: TransactionRequest,
  signer: Signer,
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
  step: LocalStep,
): Promise<TransactionResponse> {
  const provider = browserProvider();
  step.phase = "estimating";
  await persistPending(snapshot, configuration);

  // Gas 估算和 Nonce 查询都是只读请求；超时后可安全重试，不会产生链上交易。
  const estimatedGas = await withTimeout(
    provider.estimateGas({ ...request, from: snapshot.address }),
    45_000,
    "链上 Gas 估算超过 45 秒，尚未请求钱包签名。请检查 RPC 网络后重试。",
  );
  const startingNonce = await withTimeout(
    provider.getTransactionCount(snapshot.address, "pending"),
    15_000,
    "钱包 Nonce 查询超时，尚未请求钱包签名。请检查 RPC 网络后重试。",
  );
  await assertWalletContext(snapshot);
  step.startingNonce = startingNonce;
  step.phase = "awaiting_wallet";
  await persistPending(snapshot, configuration);
  try {
    await assertWalletContext(snapshot);
  } catch (error) {
    // 尚未把签名请求交给钱包，失败恢复状态不应误标为未知交易。
    step.phase = "preparing";
    throw error;
  }

  // 钱包请求无法由网页取消；超时只提示用户，不解锁重试或并发发出第二笔交易。
  const warningTimer = window.setTimeout(() => {
    if (step.status !== "running" || step.phase !== "awaiting_wallet") return;
    step.walletRequestSlow = true;
    step.error =
      "钱包尚未返回结果。请在钱包中确认或拒绝本请求；在它结束前不要再次发起。";
    void persistPending(snapshot, configuration).catch(() => undefined);
  }, 90_000);
  try {
    const transaction = await signer.sendTransaction({
      ...request,
      from: snapshot.address,
      gasLimit: (estimatedGas * 120n + 99n) / 100n,
    });
    step.phase = "waiting_receipt";
    step.transactionHash = transaction.hash;
    if (step.attempts?.at(-1) !== transaction.hash)
      step.attempts = [...(step.attempts ?? []), transaction.hash];
    step.walletRequestSlow = false;
    step.error = undefined;
    await persistPending(snapshot, configuration);
    return transaction;
  } finally {
    window.clearTimeout(warningTimer);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error(message)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function executeAction(
  action: DeploymentAction,
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
  step: LocalStep,
  provider: BrowserProvider,
  signer: Signer,
): Promise<StepResult> {
  if (action.kind === "getOrCreatePair") {
    const factoryAddress = String(configuration.externalAddresses.factory);
    const tokenA = String(
      contracts.value[action.tokenA?.nodeId ?? ""]?.address ?? "",
    );
    const tokenB = configuration.externalAddresses.paymentToken;
    const factory = new Contract(
      factoryAddress,
      packageInfo.value!.externalAbis.PancakeV2Factory ?? [
        "function getPair(address,address) view returns(address)",
        "function createPair(address,address) returns(address)",
      ],
      signer,
    );
    let pair = String(await factory.getFunction("getPair")(tokenA, tokenB));
    if (pair === "0x0000000000000000000000000000000000000000") {
      const request = await factory
        .getFunction("createPair")
        .populateTransaction(tokenA, tokenB);
      const transaction = await estimateAndSend(
        request,
        signer,
        snapshot,
        configuration,
        step,
      );
      await captureAndWait(transaction, snapshot, configuration, step);
      pair = String(await factory.getFunction("getPair")(tokenA, tokenB));
    } else {
      step.result = `复用已有交易对 ${pair}`;
    }
    if (!isAddress(pair) || (await provider.getCode(pair)) === "0x")
      throw new Error("Factory 未返回有效交易对合约地址。");
    await verifyPairAddress(pair, tokenA, tokenB, provider);
    pairAddress.value = pair;
    return { pairAddress: pair, result: pair };
  }

  const target = contracts.value[action.targetNodeId ?? ""];
  const node = packageInfo.value!.plan.nodes.find(
    (candidate) => candidate.id === action.targetNodeId,
  );
  const artifact = packageInfo.value!.artifacts[node?.contractName ?? ""];
  if (!target?.address || !artifact || !action.functionName)
    throw new Error(`${action.title} 缺少目标合约或 ABI。`);
  const args = (action.arguments ?? []).map((argument) => {
    if (argument.source === "deployedAddress")
      return contracts.value[argument.nodeId ?? ""]?.address;
    if (argument.source === "actionResult") return pairAddress.value;
    throw new Error(`${action.title} 存在不支持的参数来源。`);
  });
  if (args.some((argument) => !argument))
    throw new Error(`${action.title} 依赖的合约地址尚未生成。`);
  const contract = new Contract(target.address, artifact.abi, signer);
  const request = await contract
    .getFunction(action.functionName)
    .populateTransaction(...args.map((argument) => String(argument)));
  const transaction = await estimateAndSend(
    request,
    signer,
    snapshot,
    configuration,
    step,
  );
  await captureAndWait(transaction, snapshot, configuration, step);
  return { result: `交易已确认：${transaction.hash}` };
}

async function verifyPairAddress(
  pair: string,
  tokenA: string,
  tokenB: string,
  provider: BrowserProvider,
) {
  const pairContract = new Contract(
    pair,
    packageInfo.value!.externalAbis.PancakeV2Pair ?? [
      "function token0() view returns(address)",
      "function token1() view returns(address)",
      "function factory() view returns(address)",
    ],
    provider,
  );
  const [actualToken0, actualToken1, actualFactory] = await Promise.all([
    pairContract.getFunction("token0")(),
    pairContract.getFunction("token1")(),
    pairContract.getFunction("factory")(),
  ]);
  const [expectedToken0, expectedToken1] = [tokenA, tokenB].sort(
    (left, right) => left.toLowerCase().localeCompare(right.toLowerCase()),
  );
  if (
    String(actualFactory).toLowerCase() !==
      externalAddresses.factory.toLowerCase() ||
    String(actualToken0).toLowerCase() !== expectedToken0?.toLowerCase() ||
    String(actualToken1).toLowerCase() !== expectedToken1?.toLowerCase()
  ) {
    throw new Error(
      "Factory 返回的交易对 Token 顺序或 Factory 地址不匹配，已停止后续部署写入。",
    );
  }
}

async function verifyDeployment(
  provider: BrowserProvider,
  configuration: DeploymentConfiguration,
) {
  const rules = packageInfo.value!.plan.verificationRules;
  for (const rule of rules) {
    const target = contracts.value[String(rule.targetNodeId)];
    const node = packageInfo.value!.plan.nodes.find(
      (candidate) => candidate.id === rule.targetNodeId,
    );
    const artifact = packageInfo.value!.artifacts[node?.contractName ?? ""];
    if (!target?.address || !artifact)
      throw new Error(`核验 ${String(rule.id)} 时缺少目标合约。`);
    const contract = new Contract(target.address, artifact.abi, provider);
    const actual = String(await contract.getFunction(String(rule.getter))());
    // factoryPair 规则读取已核验的 ref.value，避免将 Vue Ref 转成 [object Object]。
    const expected =
      rule.expected?.source === "factoryPair"
        ? pairAddress.value
        : contracts.value[String(rule.expected?.nodeId)]?.address;
    if (!expected || actual.toLowerCase() !== String(expected).toLowerCase())
      throw new Error(
        `${String(rule.id)} 核验失败：实际 ${actual}，预期 ${String(expected)}。`,
      );
  }
  const main = contracts.value.FileResetV2;
  const mainNode = packageInfo.value!.plan.nodes.find(
    (candidate) => candidate.id === "FileResetV2",
  );
  const mainArtifact =
    packageInfo.value!.artifacts[mainNode?.contractName ?? ""];
  if (main?.address && mainArtifact) {
    const contract = new Contract(main.address, mainArtifact.abi, provider);
    const [tokenName, tokenSymbol] = await Promise.all([
      contract.getFunction("name")(),
      contract.getFunction("symbol")(),
    ]);
    if (
      String(tokenName) !== configuration.installation.tokenName ||
      String(tokenSymbol) !== configuration.installation.tokenSymbol
    ) {
      throw new Error(
        `代币名称核验失败：实际为 ${String(tokenName)}（${String(tokenSymbol)}），预期为 ${configuration.installation.tokenName}（${configuration.installation.tokenSymbol}）。`,
      );
    }
    for (const [roleGetter, walletKey] of [
      ["OPERATOR_ROLE", "operator"],
      ["LAUNCH_ROLE", "launch"],
      ["BATCH_REGISTRAR_ROLE", "batchRegistrar"],
      ["PAUSER_ROLE", "pauser"],
      ["DEFAULT_ADMIN_ROLE", "deployer"],
    ]) {
      const role = String(await contract.getFunction(roleGetter)());
      const configuredRoles: Record<string, string> = configuration.roleWallets;
      const address =
        walletKey === "deployer"
          ? String(configuration.deployer)
          : String(configuredRoles[walletKey] ?? "");
      const granted = Boolean(
        await contract.getFunction("hasRole")(role, address),
      );
      if (!granted)
        throw new Error(`${roleGetter} 未授予预期钱包 ${address}。`);
    }
  }
}

async function completeDeployment(
  snapshot: ConnectedWallet,
  configuration: DeploymentConfiguration,
) {
  const record = {
    status: "complete",
    chainId: snapshot.chainId,
    releaseVersion: packageInfo.value!.releaseVersion,
    deployer: snapshot.address,
    configuration,
    contracts: contracts.value,
    steps: localSteps.value,
    pairAddress: pairAddress.value,
  };
  const result = await postJson<{
    deployment: SavedDeployment;
    installation: InstallationIdentity;
  }>(`/contracts/deployments/${snapshot.chainId}`, record);
  installerFlow.summary.installation = { ...result.installation };
  installerFlow.selectedDeployment = result.deployment;
  pendingLoaded.value = false;
  pendingDeployment.value = null;
  emit("completed", result.deployment);
}

function loadPrevious(deployment: SavedDeployment) {
  installerFlow.selectedDeployment = deployment;
  void router.push({
    path: `/complete/${deployment.deploymentId}`,
    query: { chainId: String(deployment.chainId) },
  });
}
</script>

<style lang="scss" scoped>
.deployment-panel {
  display: grid;
  gap: 19px;
  min-width: 0;
}
.deployment-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.section-kicker {
  margin: 0 0 7px;
  color: #a16207;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
h2,
h3,
p {
  margin-top: 0;
}
h2 {
  margin-bottom: 7px;
  color: #172033;
  font-size: clamp(24px, 3vw, 31px);
}
.section-copy {
  max-width: 660px;
  margin-bottom: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.7;
}
.notice-banner,
.inline-banner {
  border-radius: 13px;
  line-height: 1.6;
}
.error-banner {
  min-width: 0;
  max-width: 100%;
  max-height: 160px;
  overflow: auto;
  overflow-wrap: anywhere;
  word-break: break-word;
  background: #fff0ed;
  color: #a33322;
}
.error-banner :deep(.q-banner__content) {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.warning-banner {
  background: #fff7df;
  color: #805800;
}
.success-banner {
  background: #eaf8f0;
  color: #176b42;
}
.info-banner {
  background: #eef6ff;
  color: #205e92;
}
.banner-action {
  margin-left: 10px;
}
.chain-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 15px;
  padding: 14px;
  border: 1px solid #e9edf1;
  border-radius: 14px;
  background: #fafbfc;
}
.chain-summary > span {
  display: grid;
  gap: 4px;
  min-width: 120px;
}
.chain-summary small {
  color: #8490a1;
  font-size: 10px;
}
.chain-summary strong {
  color: #354052;
  font-size: 12px;
}
.chain-summary .q-btn {
  margin-left: auto;
}
.loading-line {
  border-radius: 4px;
}
.deployment-columns {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
  align-items: start;
  gap: 16px;
}
.configuration-column {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 14px;
}
.config-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
}
.config-card {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 13px;
  padding: 16px;
}
.wide-card {
  grid-column: 1 / -1;
}
.subsection-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.subsection-heading h3 {
  margin: 0;
  color: #263247;
  font-size: 14px;
}
.subsection-heading > span {
  color: #8893a3;
  font-size: 10px;
  text-align: right;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}
.role-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.verify-button {
  justify-self: start;
}
.verify-line {
  display: flex;
  align-items: center;
  gap: 11px;
}
.verify-line span {
  color: #617084;
  font-size: 11px;
}
.inline-banner {
  font-size: 11px;
}
.contextual-error {
  max-height: 96px;
  font-size: 10px;
}
.sequence-running {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: #52627a;
  font-size: 11px;
}
.raw-value {
  overflow-wrap: anywhere;
  color: #748094;
  font-family: monospace;
  font-size: 10px;
}
.prior-runs-card {
  grid-column: 1 / -1;
}
.prior-run-list {
  display: grid;
  gap: 8px;
}
.prior-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid #e9edf1;
  border-radius: 11px;
  background: #fff;
  color: #354052;
  cursor: pointer;
  text-align: left;
}
.prior-run span {
  display: grid;
  gap: 5px;
}
.prior-run strong {
  font-size: 11px;
}
.prior-run small {
  color: #8a94a4;
  font-size: 10px;
}
.confirm-card {
  width: min(540px, calc(100vw - 28px));
  border-radius: 18px;
}
.confirm-title {
  color: #263247;
  font-size: 16px;
  font-weight: 800;
}
.confirm-card p {
  color: #667085;
  font-size: 12px;
  line-height: 1.65;
}
.critical-copy {
  color: #a33322 !important;
  font-weight: 800;
}
.confirm-card code {
  display: block;
  overflow-wrap: anywhere;
  color: #a33322;
  font-size: 11px;
}
.deploy-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.stepper-panel {
  min-width: 0;
  padding: 17px;
}
.stepper-wrapper {
  min-width: 0;
}
.deployment-stepper {
  box-shadow: none;
}
.step-description {
  color: #667085;
  font-size: 12px;
  line-height: 1.65;
}
.step-tx {
  margin: 8px 0;
  color: #738094;
  font-size: 10px;
}
.step-tx code {
  overflow-wrap: anywhere;
  color: #354052;
}
.step-action-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 960px) {
  .deployment-heading {
    flex-direction: column;
  }
  .deployment-columns {
    grid-template-columns: minmax(0, 1fr);
  }
  .config-grid {
    grid-template-columns: 1fr;
  }
  .wide-card,
  .prior-runs-card {
    grid-column: auto;
  }
  .role-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .field-grid,
  .role-grid {
    grid-template-columns: 1fr;
  }
  .chain-summary {
    align-items: stretch;
  }
  .chain-summary .q-btn {
    margin-left: 0;
  }
  .deploy-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .deploy-actions :deep(.q-btn) {
    width: 100%;
  }
  .subsection-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .subsection-heading > span {
    text-align: left;
  }
}
</style>
