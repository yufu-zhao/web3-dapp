// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFRCV2} from "./V2Interfaces.sol";

interface IRewardConsumer {
    function token() external view returns(address);
    function rewardVault() external view returns(address);
}

/// @notice Pre-funded rewards only. No administrator withdrawal or arbitrary payout path.
contract FRCRewardVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable token;
    address public staking;
    uint256 public deposited;
    uint256 public paid;
    error Unauthorized();error InvalidConfiguration();error PaymentMismatch();
    event StakingBound(address indexed staking);
    event Funded(address indexed sender,uint256 amount);
    event RewardPaid(address indexed account,uint256 requested,uint256 paid);
    constructor(address token_){
        if(token_.code.length==0)revert InvalidConfiguration();
        token=token_;
    }
    // One-time binding eliminates an administrator's ability to redirect an existing funded pool.
    function bindStaking(address next) external {
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
        if(staking!=address(0)||next.code.length==0||IRewardConsumer(next).token()!=token
            ||IRewardConsumer(next).rewardVault()!=address(this))revert InvalidConfiguration();
        staking=next;emit StakingBound(next);
    }
    function available() public view returns(uint256){return IERC20(token).balanceOf(address(this));}
    function fund(uint256 amount) external nonReentrant {
        if(amount==0)revert InvalidConfiguration();
        uint256 beforeBalance=available();
        IERC20(token).safeTransferFrom(msg.sender,address(this),amount);
        if(available()-beforeBalance!=amount)revert PaymentMismatch();
        deposited+=amount;emit Funded(msg.sender,amount);
    }
    // Only the immutable consumer's accrued-credit paths may request payment.
    function pay(address account,uint256 requested) external nonReentrant returns(uint256 amount){
        if(msg.sender!=staking)revert Unauthorized();
        if(account==address(0)||account==address(this))revert InvalidConfiguration();
        uint256 balance=available();amount=requested<balance?requested:balance;
        if(amount!=0){paid+=amount;IERC20(token).safeTransfer(account,amount);}
        emit RewardPaid(account,requested,amount);
    }
}
