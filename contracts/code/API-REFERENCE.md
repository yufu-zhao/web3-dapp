# Contract API reference

Generated from the ABIs in this release package.

## ProjectToken

- `constructor(address usdt, address factory, address ecoWallet, address operator, address launch, address batchRegistrar, address pauser)`；`DEFAULT_ADMIN_ROLE` 由实际部署交易发送者自动获得
- `error AccessControlBadConfirmation()`
- `error AccessControlEnforcedDefaultAdminDelay(uint48 schedule)`
- `error AccessControlEnforcedDefaultAdminRules()`
- `error AccessControlInvalidDefaultAdmin(address defaultAdmin)`
- `error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)`
- `error AdminExitBeforeLaunch()`
- `error AlreadyConfigured()`
- `error ConfigurationLocked()`
- `error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)`
- `error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)`
- `error ERC20InvalidApprover(address approver)`
- `error ERC20InvalidReceiver(address receiver)`
- `error ERC20InvalidSender(address sender)`
- `error ERC20InvalidSpender(address spender)`
- `error InvalidConfiguration()`
- `error InvalidMultiplier()`
- `error LiquidityNotReady()`
- `error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value)`
- `error SaleNotComplete()`
- `error TradingClosed()`
- `error UnauthorizedOracle()`
- `event Approval(address indexed owner, address indexed spender, uint256 value)`
- `event BurnMultiplierChanged(uint256 previous, uint256 next)`
- `event DefaultAdminDelayChangeCanceled()`
- `event DefaultAdminDelayChangeScheduled(uint48 newDelay, uint48 effectSchedule)`
- `event DefaultAdminTransferCanceled()`
- `event DefaultAdminTransferScheduled(address indexed newAdmin, uint48 acceptSchedule)`
- `event DeflationBurned(uint256 newHighWater, uint256 burned, uint256 remaining)`
- `event EcosystemWalletChanged(address previous, address next)`
- `event EcosystemWalletProposed(address next)`
- `event LaunchScheduled(uint256 timestamp)`
- `event ModulesConfigured(address sale, address vault)`
- `event OracleConfigured(address oracle)`
- `event PairConfigured(address pair)`
- `event ProtectionTriggered(uint256 extraSellTaxBps, uint256 expires, uint256 cooldownUntil)`
- `event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)`
- `event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)`
- `event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)`
- `event TransactionTax(address indexed from, address indexed to, uint256 burned, uint256 ecosystemFee)`
- `event Transfer(address indexed from, address indexed to, uint256 value)`
- `function DEFAULT_ADMIN_ROLE() view returns (bytes32)`
- `function DEFLATION_ALLOCATION() view returns (uint256)`
- `function INITIAL_LIQUIDITY() view returns (uint256)`
- `function INITIAL_SUPPLY() view returns (uint256)`
- `function LAUNCH_ROLE() view returns (bytes32)`
- `function BATCH_REGISTRAR_ROLE() view returns (bytes32)`
- `function PAUSER_ROLE() view returns (bytes32)`
- `function MAX_BURN_MULTIPLIER() view returns (uint256)`
- `function MAX_SELL_TAX_BPS() view returns (uint256)`
- `function OPERATOR_ROLE() view returns (bytes32)`
- `function PRESALE_ALLOCATION() view returns (uint256)`
- `function STRATEGIC_RESERVE() view returns (uint256)`
- `function SUPPLY_FLOOR() view returns (uint256)`
- `function acceptDefaultAdminTransfer()`
- `function acceptEcosystemWallet()`
- `function activeExtraSellTaxBps() view returns (uint256)`
- `function allowance(address owner, address spender) view returns (uint256)`
- `function approve(address spender, uint256 value) returns (bool)`
- `function balanceOf(address account) view returns (uint256)`
- `function beginDefaultAdminTransfer(address newAdmin)`
- `function bootstrapMutable() view returns (bool)`
- `function burnMultiplier() view returns (uint256)`
- `function cancelDefaultAdminTransfer()`
- `function changeDefaultAdminDelay(uint48 newDelay)`
- `function configureModules(address sale_, address vault_)`
- `function configureOracle(address oracle)`
- `function configurePair(address pair_)`
- `function cooldownUntil() view returns (uint256)`
- `function cumulativeNetBuy() view returns (int256)`
- `function decimals() view returns (uint8)`
- `function defaultAdmin() view returns (address)`
- `function defaultAdminDelay() view returns (uint48)`
- `function defaultAdminDelayIncreaseWait() view returns (uint48)`
- `function deflationRemaining() view returns (uint256)`
- `function dexFactory() view returns (address)`
- `function ecosystemWallet() view returns (address)`
- `function effectiveSellTaxBps() view returns (uint256 burnBps, uint256 ecosystemBps)`
- `function extraSellTaxBps() view returns (uint256)`
- `function getRoleAdmin(bytes32 role) view returns (bytes32)`
- `function grantRole(bytes32 role, address account)`
- `function hasRole(bytes32 role, address account) view returns (bool)`
- `function initialFundingReady() view returns (bool)`
- `function launchTime() view returns (uint256)`
- `function liquidityVault() view returns (address)`
- `function name() view returns (string)`
- `function netBuyHighWater() view returns (int256)`
- `function observeDrop(uint256 dropBps)`
- `function owner() view returns (address)`
- `function paymentToken() view returns (address)`
- `function pendingDefaultAdmin() view returns (address newAdmin, uint48 schedule)`
- `function pendingDefaultAdminDelay() view returns (uint48 newDelay, uint48 schedule)`
- `function pendingEcosystemWallet() view returns (address)`
- `function priceOracle() view returns (address)`
- `function primaryPair() view returns (address)`
- `function proposeEcosystemWallet(address next)`
- `function protectionUntil() view returns (uint256)`
- `function renounceRole(bytes32 role, address account)`
- `function resetOracleProtection()`
- `function revokeRole(bytes32 role, address account)`
- `function rollbackDefaultAdminDelay()`
- `function sale() view returns (address)`
- `function scheduleLaunch(uint256 timestamp)`
- `function setBurnMultiplier(uint256 next)`
- `function supportsInterface(bytes4 interfaceId) view returns (bool)`
- `function symbol() view returns (string)`
- `function totalSupply() view returns (uint256)`
- `function tradingOpen() view returns (bool)`
- `function transfer(address to, uint256 value) returns (bool)`
- `function transferFrom(address from, address to, uint256 value) returns (bool)`

## FairSaleV2

- `constructor(address token_, address proceeds_)`
- `error AlreadyEntered()`
- `error InvalidConfiguration()`
- `error InvalidRound()`
- `error InvalidTime()`
- `error NotFinalized()`
- `error NothingToClaim()`
- `error PaymentMismatch()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error SaleNotComplete()`
- `error Unauthorized()`
- `event Claimed(address indexed buyer, uint256 amount)`
- `event Committed(address indexed buyer, uint8 indexed round, uint256 index, uint256 payment)`
- `event InitialLiquidityFunded(address vault, uint256 amount)`
- `event ProceedsWalletChanged(address previous, address next)`
- `event ProceedsWalletProposed(address next)`
- `event ProceedsWithdrawn(address wallet, uint256 amount)`
- `event RefundClaimed(address indexed buyer, uint256 amount)`
- `event RoundEndSet(uint8 indexed round, uint256 timestamp)`
- `event RoundFinalized(uint8 indexed round, uint256 allocated, uint256 accepted, uint256 carry)`
- `event RoundTimesSet(uint8 indexed round, uint256 startTime, uint256 endTime)`
- `event SaleTermsChanged(uint256[3] prices, uint256[3] roundAmounts, uint256 ticket)`
- `function ALLOCATION() view returns (uint256)`
- `function acceptProceedsWallet()`
- `function acceptedPayment() view returns (uint256)`
- `function activeModule() view returns (bool)`
- `function activeRound() view returns (uint8)`
- `function allRoundsFinalized() view returns (bool)`
- `function allocationOf(address buyer) view returns (uint256 amount, uint256 cost, uint256 refund)`
- `function claim()`
- `function claimRefund()`
- `function claimable(address buyer) view returns (uint256)`
- `function claimed(address) view returns (uint256)`
- `function commit(uint8 expectedRound)`
- `function commitWithTerms(uint8 expectedRound, bytes32 expectedTerms)`
- `function configureSaleTerms(uint256[3] nextPrices, uint256[3] amounts, uint256 nextTicket)`
- `function cursor() view returns (uint8)`
- `function entries(address) view returns (uint8 roundPlusOne, uint256 index, bool refundClaimed)`
- `function finalize(uint8 expectedRound)`
- `function fundInitialLiquidity()`
- `function initialLiquidityFunded() view returns (bool)`
- `function paymentToken() view returns (address)`
- `function paymentUnit() view returns (uint256)`
- `function pendingProceedsWallet() view returns (address)`
- `function price(uint8 round) view returns (uint256)`
- `function proceedsWallet() view returns (address)`
- `function proceedsWithdrawn() view returns (uint256)`
- `function proposeProceedsWallet(address next)`
- `function purchased(address buyer) view returns (uint256)`
- `function refundLiability() view returns (uint256)`
- `function roundBase(uint256) view returns (uint256)`
- `function roundStartTime(uint8 id) view returns (uint256)`
- `function roundStartTimes(uint256) view returns (uint256)`
- `function roundState() view returns (uint8)`
- `function rounds(uint256) view returns (uint256 endTime, uint256 offered, uint256 participants, uint256 allocated, uint256 share, uint256 extraWeiParticipants, uint256 acceptedPayment, bool finalized)`
- `function setRoundEnd(uint8 id, uint256 timestamp)`
- `function setRoundTimes(uint8 id, uint256 startTime, uint256 endTime)`
- `function sold() view returns (uint256)`
- `function termsHash(uint8 id) view returns (bytes32)`
- `function ticket() view returns (uint256)`
- `function token() view returns (address)`
- `function totalParticipants() view returns (uint256)`
- `function withdrawProceeds()`

## StrategicLiquidityVaultV2

- `constructor(address token_, address router_, address fundingWallet_)`
- `error AmountExceeded()`
- `error InvalidConfiguration()`
- `error InvalidSlippage()`
- `error NotReady()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error Unauthorized()`
- `event FundingWalletChanged(address previous, address next)`
- `event FundingWalletProposed(address next)`
- `event InitialLiquiditySeeded(address pair, uint256 tokenAmount, uint256 paymentAmount, uint256 lp)`
- `event StrategicLiquidityInjected(uint256 tokenAmount, uint256 paymentAmount, uint256 lp, uint256 injectedTotal)`
- `event StrategicReserveUnlocked(address indexed admin, uint256 amount, uint256 unlockedTotal, uint256 remaining)`
- `function INITIAL_TOKEN() view returns (uint256)`
- `function STRATEGIC_TOKEN() view returns (uint256)`
- `function acceptFundingWallet()`
- `function available() view returns (uint256)`
- `function fundingWallet() view returns (address)`
- `function initialSeeded() view returns (bool)`
- `function inject(uint256 amountToken, uint256 maximumUSDT, uint256 minimumToken, uint256 minimumUSDT, uint256 deadline) returns (uint256 usedToken, uint256 usedUSDT, uint256 lp)`
- `function injected() view returns (uint256)`
- `function liquidityInProgress() view returns (bool)`
- `function lpVault() view returns (address)`
- `function paymentToken() view returns (address)`
- `function paymentUnit() view returns (uint256)`
- `function pendingFundingWallet() view returns (address)`
- `function proposeFundingWallet(address next)`
- `function router() view returns (address)`
- `function seedInitialLiquidity(uint256 minimumLP)`
- `function token() view returns (address)`
- `function unlockStrategic(uint256 amount)`
- `function unlocked() view returns (uint256)`

## PermanentLPVaultV2

- No callable ABI methods (contract is an LP holder).

## TokenRewardVault

- `constructor(address token_)`
- `error InvalidConfiguration()`
- `error PaymentMismatch()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error Unauthorized()`
- `event Funded(address indexed sender, uint256 amount)`
- `event RewardPaid(address indexed account, uint256 requested, uint256 paid)`
- `event StakingBound(address indexed staking)`
- `function available() view returns (uint256)`
- `function bindStaking(address next)`
- `function deposited() view returns (uint256)`
- `function fund(uint256 amount)`
- `function paid() view returns (uint256)`
- `function pay(address account, uint256 requested) returns (uint256 amount)`
- `function staking() view returns (address)`
- `function token() view returns (address)`

## TokenStaking

- `constructor(address token_, address sale_, address vault_, address feeWallet_)`
- `error InsufficientCoverage()`
- `error InvalidAmount()`
- `error InvalidConfiguration()`
- `error NotReady()`
- `error NothingToClaim()`
- `error PaymentMismatch()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error Unauthorized()`
- `event ExitPaid(uint256 indexed id, address indexed account, uint256 principal, uint256 fee, uint256 rewardPaid, uint256 rewardRemaining)`
- `event ExitRequested(uint256 indexed id, address indexed account, uint256 principal, uint256 fee, uint256 unlockTime, uint256 reward)`
- `event FeeWalletChanged(address previous, address next)`
- `event FeeWalletProposed(address next)`
- `event RateChanged(uint256 previous, uint256 next, uint256 timestamp)`
- `event RewardsClaimed(address indexed account, uint256 paid, uint256 remaining)`
- `event Staked(address indexed account, uint256 amount)`
- `function ADMISSION_COVERAGE_DAYS() view returns (uint256)`
- `function MAX_DAILY_RATE_BPS() view returns (uint256)`
- `function MIN_DAILY_RATE_BPS() view returns (uint256)`
- `function acceptFeeWallet()`
- `function accounts(address) view returns (uint256 principal, uint256 credit, uint256 lastTime, uint256 remainder)`
- `function automaticPrincipal(address account) view returns (uint256)`
- `function claimExit(uint256 id)`
- `function claimRewards()`
- `function dailyRateBps() view returns (uint256)`
- `function exitCount() view returns (uint256)`
- `function exits(uint256) view returns (address owner, uint256 principal, uint256 fee, uint256 unlockTime, uint256 reward, bool principalPaid)`
- `function feeWallet() view returns (address)`
- `function pendingFeeWallet() view returns (address)`
- `function pendingRewards(address account) view returns (uint256)`
- `function proposeFeeWallet(address next)`
- `function ratePointCount() view returns (uint256)`
- `function ratePoints(uint256) view returns (uint256 time, uint256 integral, uint256 rate)`
- `function requestExit(uint256 amount) returns (uint256 id)`
- `function requiredCoverage(uint256 additionalPrincipal) view returns (uint256)`
- `function rewardLiability() view returns (uint256)`
- `function rewardVault() view returns (address)`
- `function sale() view returns (address)`
- `function setDailyRate(uint256 next)`
- `function stake(uint256 amount)`
- `function token() view returns (address)`
- `function totalExitPrincipal() view returns (uint256)`
- `function totalManualPrincipal() view returns (uint256)`
- `function totalRewardAccrued() view returns (uint256)`
- `function totalRewardPaid() view returns (uint256)`

## TokenTimeLock

- `constructor(address token_)`
- `error AlreadyClaimed()`
- `error InvalidAmount()`
- `error InvalidConfiguration()`
- `error InvalidDuration()`
- `error InvalidPosition()`
- `error NotMature()`
- `error PaymentMismatch()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error TradingClosed()`
- `error Unauthorized()`
- `event Claimed(uint256 indexed id, address indexed owner, uint256 amount)`
- `event Locked(uint256 indexed id, address indexed owner, uint256 amount, uint256 duration, uint256 createdAt, uint256 unlockTime)`
- `function claim(uint256 id)`
- `function claimable(uint256 id) view returns (uint256)`
- `function lock(uint256 amount, uint256 duration) returns (uint256 id)`
- `function ownerPositionCount(address owner) view returns (uint256)`
- `function ownerPositions(address, uint256) view returns (uint256)`
- `function positionCount() view returns (uint256)`
- `function positions(uint256) view returns (address owner, uint256 amount, uint64 createdAt, uint64 unlockTime, bool claimed)`
- `function token() view returns (address)`
- `function totalLocked() view returns (uint256)`

## PancakeV2Pair

- `function token0() view returns (address)`
- `function token1() view returns (address)`
- `function factory() view returns (address)`
- `function getReserves() view returns (uint112, uint112, uint32)`

## TokenPriceOracle

- `constructor(address token_, uint256 samplePeriod, uint256 minReserve)`
- `error InvalidConfiguration()`
- `error NotReady()`
- `error TooSoon()`
- `event HistoryReset(uint256 timestamp)`
- `event OracleStarted(uint256 timestamp)`
- `event ParametersChanged(uint256 samplePeriod, uint256 minReserve)`
- `event PriceObserved(uint256 timestamp, uint256 price, uint256 baseline, uint256 dropBps)`
- `function configureParameters(uint256 samplePeriod, uint256 minReserve)`
- `function count() view returns (uint256)`
- `function initialized() view returns (bool)`
- `function isFresh() view returns (bool)`
- `function lastCumulative() view returns (uint256)`
- `function lastSample() view returns (uint256)`
- `function latestPrice() view returns (uint256)`
- `function minimumPaymentReserve() view returns (uint256)`
- `function nextIndex() view returns (uint256)`
- `function pair() view returns (address)`
- `function period() view returns (uint256)`
- `function resetForActivation()`
- `function sample()`
- `function start()`
- `function token() view returns (address)`

## TokenLimitOrders

- `constructor(address token_, address router_)`
- `constant ORDER_DURATION = 1800`（签名下单固定有效 30 分钟）
- `constant MAX_BATCH = 20`（单笔撮合最多 20 个同方向订单）
- `Order = (address owner,bool buy,uint256 amountIn,uint256 minOut,uint64 issuedAt,uint64 expiry,uint256 salt)`
- 批次订单必须同方向；订单执行成功或失败均不会分拆单个订单，失败整笔回滚。
- `error EnforcedPause()`
- `error ExpectedPause()`
- `error InsufficientOutput()`
- `error InvalidConfiguration()`
- `error InvalidOrder()`
- `error InvalidSignature()`
- `error OrderUnavailable()`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error TradingNotReady()`
- `error Unauthorized()`
- `error UnsupportedTransfer()`
- `event OrderCancelled(bytes32 indexed orderHash, address indexed owner)`
- `event OrderExecuted(bytes32 indexed orderHash, address indexed owner, bool buy, uint256 amountIn, uint256 amountOut)`
- `event Paused(address account)`
- `event Unpaused(address account)`
- `function cancelOrder(Order order)`
- `function executeBatch(Order[] orders, bytes[] signatures)`
- `function factory() view returns (address)`
- `function orderHash(Order order) view returns (bytes32)`
- `function consumed(bytes32 orderHash) view returns (bool)`
- `function ORDER_DURATION() view returns (uint256)`
- `function MAX_BATCH() view returns (uint256)`
- `function pause()`
- `function paused() view returns (bool)`
- `function paymentToken() view returns (address)`
- `function refundExpired(uint256 id)`
- `function router() view returns (address)`
- `function token() view returns (address)`
- `function unpause()`

## PaymentToken

- `function name() view returns (string)`
- `function symbol() view returns (string)`
- `function decimals() view returns (uint8)`
- `function totalSupply() view returns (uint256)`
- `function balanceOf(address) view returns (uint256)`
- `function allowance(address, address) view returns (uint256)`
- `function approve(address, uint256) returns (bool)`
- `function transfer(address, uint256) returns (bool)`
- `function transferFrom(address, address, uint256) returns (bool)`

## PrizeClaimVault

- `constructor(address tokenAddress, address roleControllerAddress, address recoveryWalletAddress)`
- `error AlreadyClaimed()`
- `error BatchAlreadyExists()`
- `error BatchNotExpired()`
- `error BatchNotFound()`
- `error ClaimWindowClosed()`
- `error EmptyClaims()`
- `error EnforcedPause()`
- `error ExpectedPause()`
- `error InsufficientUnreservedFunds(uint256 available, uint256 required)`
- `error InvalidAmount()`
- `error InvalidBatch()`
- `error InvalidConfiguration()`
- `error InvalidMerkleProof()`
- `error NothingToRecover()`
- `error OutboundAmountMismatch(uint256 expected, uint256 received)`
- `error ReentrancyGuardReentrantCall()`
- `error SafeERC20FailedOperation(address token)`
- `error Unauthorized()`
- `error ZeroAddress()`
- `event BatchRegistered(bytes32 indexed batchId, bytes32 indexed root, address indexed token, uint256 totalAmount, uint32 itemCount, uint64 claimDeadline)`
- `event Claimed(bytes32 indexed batchId, address indexed wallet, uint256 amount, uint32 leafIndex, bytes32 leafId)`
- `event ExpiredBatchRecovered(bytes32 indexed batchId, address indexed recoveryWallet, uint256 amount)`
- `event Funded(address indexed funder, address indexed token, uint256 requestedAmount, uint256 receivedAmount)`
- `event Paused(address account)`
- `event RecoveryWalletChanged(address indexed previousWallet, address indexed newWallet)`
- `event RecoveryWalletProposed(address indexed currentWallet, address indexed pendingWallet)`
- `event Unpaused(address account)`
- `event UnreservedFundsRecovered(address indexed recoveryWallet, uint256 amount)`
- `function BATCH_REGISTRAR_ROLE() view returns (bytes32)`
- `function CLAIM_PERIOD() view returns (uint256)`
- `function MAX_BATCH_ITEMS() view returns (uint32)`
- `function PAUSER_ROLE() view returns (bytes32)`
- `function acceptRecoveryWallet()`
- `function batchInfo(bytes32 batchId) view returns ((bytes32 root, uint256 totalAmount, uint256 remainingAmount, uint32 itemCount, uint32 remainingCount, uint64 claimDeadline, bool exists))`
- `function claimMany((bytes32 batchId, address wallet, uint32 index, uint256 amount, bytes32[] siblingHashes, uint256[] siblingSums, uint32[] siblingCounts)[] claims)`
- `function fund(uint256 requestedAmount) returns (uint256 receivedAmount)`
- `function hasClaimed(bytes32 batchId, address wallet) view returns (bool)`
- `function hashLeaf(bytes32 batchId, address wallet, uint32 index, uint256 amount) view returns (bytes32)`
- `function hashNode(bytes32 leftHash, uint256 leftSum, uint32 leftCount, bytes32 rightHash, uint256 rightSum, uint32 rightCount) pure returns (bytes32)`
- `function pause()`
- `function paused() view returns (bool)`
- `function pendingRecoveryWallet() view returns (address)`
- `function proposeRecoveryWallet(address next)`
- `function recoverExpiredBatch(bytes32 batchId)`
- `function recoverUnreserved(uint256 amount)`
- `function recoveryWallet() view returns (address)`；超管可提议新地址，待接受钱包确认后更新
- `function registerBatch(bytes32 batchId, bytes32 root, uint256 totalAmount, uint32 itemCount, (bytes32 batchId, address wallet, uint32 index, uint256 amount, bytes32[] siblingHashes, uint256[] siblingSums, uint32[] siblingCounts) sampleClaim)`
- `function roleController() view returns (address)`
- `function token() view returns (address)`
- `function tokenDecimals() view returns (uint8)`
- `function totalReserved() view returns (uint256)`
- `function unpause()`
- `function unreservedBalance() view returns (uint256)`

## PancakeV2Factory

- `function getPair(address, address) view returns (address)`
- `function createPair(address, address) returns (address)`
- `event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength)`

## PancakeV2Router

- `function factory() view returns (address)`
- `function getAmountsOut(uint256, address[]) view returns (uint256[])`
- `function swapExactTokensForTokens(uint256, uint256, address[], address, uint256) returns (uint256[])`
- `function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256, uint256, address[], address, uint256)`
- `function addLiquidity(address, address, uint256, uint256, uint256, uint256, address, uint256) returns (uint256, uint256, uint256)`

## PancakeV2Pair

- `function token0() view returns (address)`
- `function token1() view returns (address)`
- `function factory() view returns (address)`
- `function getReserves() view returns (uint112, uint112, uint32)`
- `function totalSupply() view returns (uint256)`
- `function balanceOf(address) view returns (uint256)`
