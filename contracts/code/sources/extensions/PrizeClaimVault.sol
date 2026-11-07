// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IClaimRoleController {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function paymentToken() external view returns (address);
}

/// @title PrizeClaimVault
/// @notice 为积分抽奖预存固定代币奖励，并让获奖钱包自行领取。
/// @dev 批次采用 Merkle-sum tree；管理员只能在领取期结束后回收未领取余额。
contract PrizeClaimVault is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant BATCH_REGISTRAR_ROLE = keccak256("BATCH_REGISTRAR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 private constant DEFAULT_ADMIN_ROLE = bytes32(0);
    uint256 public constant CLAIM_PERIOD = 365 days;
    uint32 public constant MAX_BATCH_ITEMS = 100_000;

    IERC20 public immutable token;
    IClaimRoleController public immutable roleController;
    address public recoveryWallet;
    address public pendingRecoveryWallet;
    uint8 public immutable tokenDecimals;
    uint256 public totalReserved;

    struct Batch {
        bytes32 root;
        uint256 totalAmount;
        uint256 remainingAmount;
        uint32 itemCount;
        uint32 remainingCount;
        uint64 claimDeadline;
        bool exists;
    }

    struct MerkleSum {
        bytes32 hash;
        uint256 sum;
        uint32 count;
    }

    struct Claim {
        bytes32 batchId;
        address wallet;
        uint32 index;
        uint256 amount;
        bytes32[] siblingHashes;
        uint256[] siblingSums;
        uint32[] siblingCounts;
    }

    mapping(bytes32 batchId => Batch batch) private batches;
    mapping(bytes32 batchId => mapping(address wallet => bool claimed)) private claimed;

    error ZeroAddress();
    error InvalidAmount();
    error InvalidBatch();
    error InvalidConfiguration();
    error BatchAlreadyExists();
    error BatchNotFound();
    error InsufficientUnreservedFunds(uint256 available, uint256 required);
    error InvalidMerkleProof();
    error AlreadyClaimed();
    error EmptyClaims();
    error OutboundAmountMismatch(uint256 expected, uint256 received);
    error Unauthorized();
    error BatchNotExpired();
    error ClaimWindowClosed();
    error NothingToRecover();

    event Funded(address indexed funder, address indexed token, uint256 requestedAmount, uint256 receivedAmount);
    event BatchRegistered(
        bytes32 indexed batchId,
        bytes32 indexed root,
        address indexed token,
        uint256 totalAmount,
        uint32 itemCount,
        uint64 claimDeadline
    );
    event ExpiredBatchRecovered(bytes32 indexed batchId, address indexed recoveryWallet, uint256 amount);
    event UnreservedFundsRecovered(address indexed recoveryWallet, uint256 amount);
    event RecoveryWalletProposed(address indexed currentWallet, address indexed pendingWallet);
    event RecoveryWalletChanged(address indexed previousWallet, address indexed newWallet);
    event Claimed(
        bytes32 indexed batchId,
        address indexed wallet,
        uint256 amount,
        uint32 leafIndex,
        bytes32 leafId
    );

    constructor(address tokenAddress, address roleControllerAddress, address recoveryWalletAddress) {
        if (tokenAddress == address(0) || roleControllerAddress == address(0) || recoveryWalletAddress == address(0)) revert ZeroAddress();
        if (tokenAddress.code.length == 0 || roleControllerAddress.code.length == 0) revert InvalidBatch();
        if (IClaimRoleController(roleControllerAddress).paymentToken() != tokenAddress) revert InvalidConfiguration();

        token = IERC20(tokenAddress);
        roleController = IClaimRoleController(roleControllerAddress);
        recoveryWallet = recoveryWalletAddress;
        tokenDecimals = IERC20Metadata(tokenAddress).decimals();
    }

    /// @notice 超管提议新的资产回收钱包；新钱包必须自行接受后才会生效。
    function proposeRecoveryWallet(address next) external onlyAdminOrRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        if (next == address(this) || next == address(token) || next == address(roleController)) {
            revert InvalidConfiguration();
        }
        pendingRecoveryWallet = next;
        emit RecoveryWalletProposed(recoveryWallet, next);
    }

    /// @notice 仅待接受的新钱包本人可以确认回收地址变更。
    function acceptRecoveryWallet() external {
        if (msg.sender != pendingRecoveryWallet) revert Unauthorized();
        address previous = recoveryWallet;
        recoveryWallet = msg.sender;
        pendingRecoveryWallet = address(0);
        emit RecoveryWalletChanged(previous, msg.sender);
    }

    /// @dev 超管拥有全部受限操作；其它地址按主合约角色获得最小必要权限。
    modifier onlyAdminOrRole(bytes32 role) {
        if (!roleController.hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !roleController.hasRole(role, msg.sender)) {
            revert Unauthorized();
        }
        _;
    }

    /// @notice 管理员先对本合约 approve，再调用此函数注资；按实际到账数记录，兼容有转账税的代币。
    function fund(uint256 requestedAmount) external nonReentrant returns (uint256 receivedAmount) {
        if (requestedAmount == 0) revert InvalidAmount();
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), requestedAmount);
        receivedAmount = token.balanceOf(address(this)) - balanceBefore;
        if (receivedAmount == 0) revert InvalidAmount();
        emit Funded(msg.sender, address(token), requestedAmount, receivedAmount);
    }

    /// @notice 登记不可覆盖的批次，登记时立即为该批次锁定足额资金。
    function registerBatch(
        bytes32 batchId,
        bytes32 root,
        uint256 totalAmount,
        uint32 itemCount,
        Claim calldata sampleClaim
    )
        external
        onlyAdminOrRole(BATCH_REGISTRAR_ROLE)
        whenNotPaused
    {
        if (batchId == bytes32(0) || root == bytes32(0) || totalAmount == 0 || itemCount == 0 || itemCount > MAX_BATCH_ITEMS) {
            revert InvalidBatch();
        }
        if (batches[batchId].exists) revert BatchAlreadyExists();
        if (sampleClaim.batchId != batchId || sampleClaim.wallet == address(0)) revert InvalidMerkleProof();
        if (!_verifyClaim(sampleClaim, MerkleSum(root, totalAmount, itemCount), sampleClaim.wallet)) {
            revert InvalidMerkleProof();
        }

        uint256 balance = token.balanceOf(address(this));
        uint256 available = balance > totalReserved ? balance - totalReserved : 0;
        if (available < totalAmount) revert InsufficientUnreservedFunds(available, totalAmount);

        uint64 claimDeadline = uint64(block.timestamp + CLAIM_PERIOD);
        batches[batchId] = Batch({
            root: root,
            totalAmount: totalAmount,
            remainingAmount: totalAmount,
            itemCount: itemCount,
            remainingCount: itemCount,
            claimDeadline: claimDeadline,
            exists: true
        });
        totalReserved += totalAmount;
        emit BatchRegistered(batchId, root, address(token), totalAmount, itemCount, claimDeadline);
    }

    /// @notice 用户从自己的钱包一次领取一个或多个批次；所有收款地址固定为 msg.sender。
    function claimMany(Claim[] calldata claims) external whenNotPaused nonReentrant {
        if (claims.length == 0) revert EmptyClaims();
        uint256 totalPayout;

        for (uint256 i; i < claims.length; ++i) {
            Claim calldata claim = claims[i];
            Batch storage batch = batches[claim.batchId];
            if (!batch.exists) revert BatchNotFound();
            if (block.timestamp > batch.claimDeadline) revert ClaimWindowClosed();
            if (claimed[claim.batchId][msg.sender]) revert AlreadyClaimed();
            if (!_verifyClaim(claim, MerkleSum(batch.root, batch.totalAmount, batch.itemCount), msg.sender)) {
                revert InvalidMerkleProof();
            }

            // 先更新领取状态和预留额，再调用代币合约，避免重入和重复支付。
            claimed[claim.batchId][msg.sender] = true;
            batch.remainingAmount -= claim.amount;
            batch.remainingCount -= 1;
            totalReserved -= claim.amount;
            totalPayout += claim.amount;
            emit Claimed(claim.batchId, msg.sender, claim.amount, claim.index, _hashLeaf(claim.batchId, msg.sender, claim.index, claim.amount));
        }

        uint256 recipientBalanceBefore = token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender, totalPayout);
        uint256 recipientBalanceAfter = token.balanceOf(msg.sender);
        uint256 receivedAmount = recipientBalanceAfter - recipientBalanceBefore;
        if (receivedAmount != totalPayout) revert OutboundAmountMismatch(totalPayout, receivedAmount);
    }

    /// @notice 紧急暂停仅冻结新批次和领取；不会转移或取消已预留资产。
    function pause() external onlyAdminOrRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyAdminOrRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice 批次领取期届满后，将其剩余预留款回收到部署时固定的钱包。
    function recoverExpiredBatch(bytes32 batchId) external onlyAdminOrRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Batch storage batch = batches[batchId];
        if (!batch.exists) revert BatchNotFound();
        if (block.timestamp <= batch.claimDeadline) revert BatchNotExpired();
        uint256 amount = batch.remainingAmount;
        if (amount == 0) revert NothingToRecover();
        batch.remainingAmount = 0;
        batch.remainingCount = 0;
        totalReserved -= amount;
        _recover(amount);
        emit ExpiredBatchRecovered(batchId, recoveryWallet, amount);
    }

    /// @notice 仅回收未被任何批次预留的余额，不会影响有效领取承诺。
    function recoverUnreserved(uint256 amount) external onlyAdminOrRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        uint256 balance = token.balanceOf(address(this));
        uint256 available = balance > totalReserved ? balance - totalReserved : 0;
        if (amount == 0) revert NothingToRecover();
        if (amount > available) revert InsufficientUnreservedFunds(available, amount);
        _recover(amount);
        emit UnreservedFundsRecovered(recoveryWallet, amount);
    }

    function _recover(uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(recoveryWallet);
        token.safeTransfer(recoveryWallet, amount);
        uint256 received = token.balanceOf(recoveryWallet) - beforeBalance;
        if (received != amount) revert OutboundAmountMismatch(amount, received);
    }

    function batchInfo(bytes32 batchId) external view returns (Batch memory) {
        return batches[batchId];
    }

    function hasClaimed(bytes32 batchId, address wallet) external view returns (bool) {
        return claimed[batchId][wallet];
    }

    function unreservedBalance() external view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        return balance > totalReserved ? balance - totalReserved : 0;
    }

    /// @notice 对外公开同一叶子编码，供后台构造批次证明并在链上复核。
    function hashLeaf(bytes32 batchId, address wallet, uint32 index, uint256 amount) external view returns (bytes32) {
        return _hashLeaf(batchId, wallet, index, amount);
    }

    /// @notice 对外公开同一节点编码，避免前后端和链上 Merkle-sum 计算规则不一致。
    function hashNode(
        bytes32 leftHash,
        uint256 leftSum,
        uint32 leftCount,
        bytes32 rightHash,
        uint256 rightSum,
        uint32 rightCount
    ) external pure returns (bytes32) {
        return _hashNode(leftHash, leftSum, leftCount, rightHash, rightSum, rightCount);
    }

    function _verifyClaim(Claim calldata claim, MerkleSum memory expected, address wallet) private view returns (bool) {
        if (claim.wallet != wallet || claim.amount == 0 || claim.index >= expected.count) return false;
        uint256 depth = _treeDepth(expected.count);
        if (
            claim.siblingHashes.length != depth || claim.siblingSums.length != depth
                || claim.siblingCounts.length != depth
        ) return false;

        MerkleSum memory node = MerkleSum(_hashLeaf(claim.batchId, wallet, claim.index, claim.amount), claim.amount, 1);
        uint256 position = claim.index;

        for (uint256 i; i < depth; ++i) {
            MerkleSum memory sibling = MerkleSum(
                claim.siblingHashes[i], claim.siblingSums[i], claim.siblingCounts[i]
            );
            if ((position & 1) == 0) {
                node = _combine(node, sibling);
            } else {
                node = _combine(sibling, node);
            }
            position >>= 1;
        }

        return node.hash == expected.hash && node.sum == expected.sum && node.count == expected.count;
    }

    function _combine(MerkleSum memory left, MerkleSum memory right) private pure returns (MerkleSum memory) {
        return MerkleSum(
            _hashNode(left.hash, left.sum, left.count, right.hash, right.sum, right.count),
            left.sum + right.sum,
            left.count + right.count
        );
    }

    function _hashLeaf(bytes32 batchId, address wallet, uint32 index, uint256 amount) private view returns (bytes32) {
        return keccak256(abi.encode(bytes1(0x00), block.chainid, address(this), batchId, address(token), wallet, index, amount));
    }

    function _hashNode(
        bytes32 leftHash,
        uint256 leftSum,
        uint32 leftCount,
        bytes32 rightHash,
        uint256 rightSum,
        uint32 rightCount
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(bytes1(0x01), leftHash, leftSum, leftCount, rightHash, rightSum, rightCount));
    }

    function _treeDepth(uint32 itemCount) private pure returns (uint256 depth) {
        uint256 width = 1;
        while (width < itemCount) {
            width <<= 1;
            ++depth;
        }
    }
}
