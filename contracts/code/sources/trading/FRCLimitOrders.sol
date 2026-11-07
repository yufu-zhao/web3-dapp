// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface ILimitFRC is IERC20 {
    function paymentToken() external view returns(address);
    function dexFactory() external view returns(address);
    function primaryPair() external view returns(address);
    function tradingOpen() external view returns(bool);
    function hasRole(bytes32 role,address account) external view returns(bool);
}
interface ILimitFactory {function getPair(address,address) external view returns(address);}
interface ILimitRouter {
    function factory() external view returns(address);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[] calldata,address,uint256) external;
}

/// @notice Fixed-input, all-or-nothing limit orders for one FRC/USDT V2 pool.
/// @dev Output is measured at the owner wallet AFTER token taxes. No keeper fee,
/// arbitrary call, admin withdrawal, mutable router or principal rescue is exposed.
contract FRCLimitOrders is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    bytes32 private constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 private constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    enum Status { Open, Executed, Cancelled }
    struct Order {address owner;bool buy;Status status;uint64 expiry;uint256 amountIn;uint256 minOut;}
    ILimitFRC public immutable token;
    IERC20 public immutable paymentToken;
    ILimitRouter public immutable router;
    address public immutable factory;
    uint256 public nextOrderId;
    mapping(uint256=>Order) public orders;
    mapping(address=>uint256[]) private ownerOrders;
    mapping(address=>uint256) public escrowed;

    error InvalidConfiguration();error InvalidOrder();error NotOrderOwner();
    error Unauthorized();
    error OrderNotOpen();error OrderExpired();error NotExpired();error TradingNotReady();
    error UnsupportedTransfer();error InsufficientOutput();
    event OrderCreated(uint256 indexed id,address indexed owner,bool buy,uint256 amountIn,uint256 minOut,uint64 expiry);
    event OrderExecuted(uint256 indexed id,address indexed owner,address indexed executor,uint256 amountOut);
    event OrderCancelled(uint256 indexed id,address indexed owner,address indexed caller,uint256 refunded);

    constructor(address token_,address router_) {
        if(token_.code.length==0||router_.code.length==0)revert InvalidConfiguration();
        token=ILimitFRC(token_);router=ILimitRouter(router_);
        address pay=token.paymentToken();address f=token.dexFactory();
        if(pay==token_||pay.code.length==0||f.code.length==0||router.factory()!=f)revert InvalidConfiguration();
        paymentToken=IERC20(pay);factory=f;
    }
    function pause()external { _checkPauser(); _pause(); }
    function unpause()external { _checkPauser(); _unpause(); }
    /// @dev 暂停权限由主合约角色统一管理，超管始终可以执行紧急操作。
    function _checkPauser() internal view {
        if (!token.hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !token.hasRole(PAUSER_ROLE, msg.sender)) revert Unauthorized();
    }
    function orderCount(address account)external view returns(uint256){return ownerOrders[account].length;}
    function orderIdAt(address account,uint256 index)external view returns(uint256){return ownerOrders[account][index];}
    function _ready()internal view {
        address pair=token.primaryPair();
        if(!token.tradingOpen()||pair==address(0)||pair!=ILimitFactory(factory).getPair(address(token),address(paymentToken)))revert TradingNotReady();
    }
    function createOrder(bool buy,uint256 amountIn,uint256 minOut,uint64 expiry)
        external nonReentrant whenNotPaused returns(uint256 id){
        if(amountIn==0||minOut==0||expiry<=block.timestamp||msg.sender==address(this))revert InvalidOrder();
        _ready();IERC20 input=buy?paymentToken:IERC20(address(token));
        uint256 beforeBalance=input.balanceOf(address(this));
        input.safeTransferFrom(msg.sender,address(this),amountIn);
        if(input.balanceOf(address(this))-beforeBalance!=amountIn)revert UnsupportedTransfer();
        id=nextOrderId++;orders[id]=Order(msg.sender,buy,Status.Open,expiry,amountIn,minOut);
        ownerOrders[msg.sender].push(id);escrowed[address(input)]+=amountIn;
        emit OrderCreated(id,msg.sender,buy,amountIn,minOut,expiry);
    }
    function executeOrder(uint256 id)external nonReentrant whenNotPaused returns(uint256 amountOut){
        Order storage o=orders[id];_open(o);
        if(block.timestamp>=o.expiry)revert OrderExpired();_ready();
        IERC20 input=o.buy?paymentToken:IERC20(address(token));
        IERC20 output=o.buy?IERC20(address(token)):paymentToken;
        // Effects precede external calls; every state change rolls back on failure.
        o.status=Status.Executed;escrowed[address(input)]-=o.amountIn;
        uint256 inputBefore=input.balanceOf(address(this));uint256 outputBefore=output.balanceOf(o.owner);
        input.forceApprove(address(router),o.amountIn);
        address[] memory path=new address[](2);path[0]=address(input);path[1]=address(output);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(o.amountIn,o.minOut,path,o.owner,o.expiry);
        input.forceApprove(address(router),0);
        if(input.balanceOf(address(this))!=inputBefore-o.amountIn)revert UnsupportedTransfer();
        amountOut=output.balanceOf(o.owner)-outputBefore;
        if(amountOut<o.minOut)revert InsufficientOutput();
        emit OrderExecuted(id,o.owner,msg.sender,amountOut);
    }
    function cancelOrder(uint256 id)external nonReentrant {
        Order storage o=orders[id];_open(o);if(msg.sender!=o.owner)revert NotOrderOwner();_refund(id,o);
    }
    /// @notice Anyone can refund expired orders, ONLY to their recorded owner.
    function refundExpired(uint256 id)external nonReentrant {
        Order storage o=orders[id];_open(o);if(block.timestamp<o.expiry)revert NotExpired();_refund(id,o);
    }
    function _open(Order storage o)internal view {
        if(o.owner==address(0))revert InvalidOrder();if(o.status!=Status.Open)revert OrderNotOpen();
    }
    function _refund(uint256 id,Order storage o)internal {
        o.status=Status.Cancelled;IERC20 input=o.buy?paymentToken:IERC20(address(token));
        escrowed[address(input)]-=o.amountIn;input.safeTransfer(o.owner,o.amountIn);
        emit OrderCancelled(id,o.owner,msg.sender,o.amountIn);
    }
}
