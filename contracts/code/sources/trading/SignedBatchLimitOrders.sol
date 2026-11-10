// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IBatchToken is IERC20 {
    function paymentToken() external view returns (address);
    function dexFactory() external view returns (address);
    function primaryPair() external view returns (address);
    function tradingOpen() external view returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
}
interface IBatchFactory { function getPair(address, address) external view returns (address); }
interface IBatchRouter {
    function factory() external view returns (address);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256, uint256, address[] calldata, address, uint256) external;
}

/// @notice 固定输入、全部成交的 EIP-712 限价单；同方向订单可批量结算。
/// @dev 开发草稿：未经完整测试及审计，不得部署用于真实资产。
contract SignedBatchLimitOrders is EIP712, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    uint256 public constant ORDER_DURATION = 30 minutes;
    uint256 public constant MAX_BATCH = 20;
    bytes32 public constant ORDER_TYPEHASH = keccak256("Order(address owner,bool buy,uint256 amountIn,uint256 minOut,uint64 issuedAt,uint64 expiry,uint256 salt)");
    bytes32 private constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    struct Order { address owner; bool buy; uint256 amountIn; uint256 minOut; uint64 issuedAt; uint64 expiry; uint256 salt; }
    IBatchToken public immutable token;
    IERC20 public immutable paymentToken;
    IBatchRouter public immutable router;
    address public immutable factory;
    mapping(bytes32 => bool) public consumed;
    event OrderCancelled(bytes32 indexed orderHash, address indexed owner);
    event OrderExecuted(bytes32 indexed orderHash, address indexed owner, bool buy, uint256 amountIn, uint256 amountOut);
    error InvalidConfiguration(); error InvalidOrder(); error InvalidSignature(); error OrderUnavailable();
    error TradingNotReady(); error UnsupportedTransfer(); error InsufficientOutput(); error Unauthorized();

    constructor(address token_, address router_) EIP712("ChainForge Signed Limit Orders", "1") {
        if (token_.code.length == 0 || router_.code.length == 0) revert InvalidConfiguration();
        token = IBatchToken(token_); router = IBatchRouter(router_);
        address payment = IBatchToken(token_).paymentToken();
        address dexFactory = IBatchToken(token_).dexFactory();
        if (payment == token_ || payment.code.length == 0 || dexFactory.code.length == 0 || IBatchRouter(router_).factory() != dexFactory) revert InvalidConfiguration();
        paymentToken = IERC20(payment); factory = dexFactory;
    }
    function orderHash(Order calldata order) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, order.owner, order.buy, order.amountIn, order.minOut, order.issuedAt, order.expiry, order.salt)));
    }
    /// @notice 任何时候允许所有者取消订单，包括暂停期间。
    function cancelOrder(Order calldata order) external {
        if (msg.sender != order.owner) revert Unauthorized();
        bytes32 hash = orderHash(order);
        if (consumed[hash]) revert OrderUnavailable();
        consumed[hash] = true; emit OrderCancelled(hash, order.owner);
    }
    function pause() external { _checkPauser(); _pause(); }
    function unpause() external { _checkPauser(); _unpause(); }
    function _checkPauser() private view {
        if (!token.hasRole(bytes32(0), msg.sender) && !token.hasRole(PAUSER_ROLE, msg.sender)) revert Unauthorized();
    }
    // 支持普通钱包及 ERC-1271 合约钱包；合约签名每次执行均重新核验。
    function _validSignature(address owner, bytes32 hash, bytes calldata signature) private view returns (bool) {
        if (owner.code.length == 0) {
            (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature);
            return error == ECDSA.RecoverError.NoError && recovered == owner;
        }
        (bool success, bytes memory result) = owner.staticcall(abi.encodeCall(IERC1271.isValidSignature, (hash, signature)));
        return success && result.length >= 32 && abi.decode(result, (bytes4)) == IERC1271.isValidSignature.selector;
    }
    /// @notice 所有订单在一笔 AMM 兑换中共同结算，失败时整批回滚。
    function executeBatch(Order[] calldata orders, bytes[] calldata signatures) external nonReentrant whenNotPaused {
        uint256 count = orders.length;
        if (count == 0 || count > MAX_BATCH || count != signatures.length) revert InvalidOrder();
        address pair = token.primaryPair();
        if (!token.tradingOpen() || pair == address(0) || pair != IBatchFactory(factory).getPair(address(token), address(paymentToken))) revert TradingNotReady();
        bool buy = orders[0].buy;
        IERC20 input = buy ? paymentToken : IERC20(address(token));
        IERC20 output = buy ? IERC20(address(token)) : paymentToken;
        (uint256 totalInput, uint256 minimumOutput) = _collect(orders, signatures, input, buy);
        uint256 received = _swap(input, output, totalInput, minimumOutput);
        _distribute(orders, output, totalInput, received - minimumOutput, buy);
    }
    function _collect(Order[] calldata orders, bytes[] calldata signatures, IERC20 input, bool buy) private returns (uint256 totalInput, uint256 minimumOutput) {
        for (uint256 i; i < orders.length; ++i) {
            Order calldata order = orders[i];
            if (order.owner == address(0) || order.owner == address(this) || order.buy != buy || order.amountIn == 0 || order.minOut == 0 || order.issuedAt > block.timestamp || order.expiry <= block.timestamp || uint256(order.expiry) != uint256(order.issuedAt) + ORDER_DURATION) revert InvalidOrder();
            bytes32 hash = orderHash(order);
            if (consumed[hash]) revert OrderUnavailable();
            if (!_validSignature(order.owner, hash, signatures[i])) revert InvalidSignature();
            consumed[hash] = true;
            uint256 beforeInput = input.balanceOf(address(this));
            input.safeTransferFrom(order.owner, address(this), order.amountIn);
            if (input.balanceOf(address(this)) - beforeInput != order.amountIn) revert UnsupportedTransfer();
            totalInput += order.amountIn; minimumOutput += order.minOut;
        }
    }
    function _swap(IERC20 input, IERC20 output, uint256 totalInput, uint256 minimumOutput) private returns (uint256 received) {
        uint256 beforeOutput = output.balanceOf(address(this));
        uint256 beforeInput = input.balanceOf(address(this));
        input.forceApprove(address(router), totalInput);
        address[] memory path = new address[](2); path[0] = address(input); path[1] = address(output);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(totalInput, minimumOutput, path, address(this), block.timestamp);
        input.forceApprove(address(router), 0);
        if (beforeInput < totalInput || input.balanceOf(address(this)) != beforeInput - totalInput) revert UnsupportedTransfer();
        received = output.balanceOf(address(this)) - beforeOutput;
        if (received < minimumOutput) revert InsufficientOutput();
    }
    function _distribute(Order[] calldata orders, IERC20 output, uint256 totalInput, uint256 surplus, bool buy) private {
        uint256 distributed;
        for (uint256 i; i < orders.length; ++i) {
            Order calldata order = orders[i];
            // 按输入量分配超出最低到账额的部分，最后一笔获得除法余数。
            uint256 extra = i + 1 == orders.length ? surplus - distributed : Math.mulDiv(surplus, order.amountIn, totalInput);
            distributed += extra;
            uint256 beforeRecipient = output.balanceOf(order.owner);
            output.safeTransfer(order.owner, order.minOut + extra);
            uint256 actual = output.balanceOf(order.owner) - beforeRecipient;
            if (actual < order.minOut) revert InsufficientOutput();
            emit OrderExecuted(orderHash(order), order.owner, buy, order.amountIn, actual);
        }
    }
}
