// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFRCV2} from "./V2Interfaces.sol";
import {FRCRewardVault} from "./FRCRewardVault.sol";

interface IStakingSale {
    function token() external view returns(address);
    function purchased(address account) external view returns(uint256);
    function sold() external view returns(uint256);
}

/// @notice Manual principal custody + virtual staking of locked sale entitlements.
/// No minting, rescue, early sale-principal release, or administrator principal withdrawal.
contract FRCStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant DENOM=10_000*1 days*100;
    bytes32 private constant OPERATOR_ROLE=keccak256("OPERATOR_ROLE");
    uint256 public constant MIN_DAILY_RATE_BPS=60;
    uint256 public constant MAX_DAILY_RATE_BPS=100;
    uint256 public constant ADMISSION_COVERAGE_DAYS=30;
    address public immutable token;
    address public immutable sale;
    address public immutable rewardVault;
    address public feeWallet;
    address public pendingFeeWallet;
    uint256 public dailyRateBps=60;
    struct RatePoint {uint256 time;uint256 integral;uint256 rate;}
    RatePoint[] public ratePoints;
    struct Account {uint256 principal;uint256 credit;uint256 lastTime;uint256 remainder;}
    mapping(address=>Account) public accounts;
    struct Exit {address owner;uint256 principal;uint256 fee;uint256 unlockTime;uint256 reward;bool principalPaid;}
    Exit[] public exits;
    uint256 public totalManualPrincipal;
    uint256 public totalExitPrincipal;
    uint256 public totalRewardAccrued;
    uint256 public totalRewardPaid;
    uint256 private globalLastTime;
    uint256 private globalRemainder;
    error Unauthorized();error InvalidConfiguration();error NotReady();error InsufficientCoverage();
    error InvalidAmount();error NothingToClaim();error PaymentMismatch();
    event RateChanged(uint256 previous,uint256 next,uint256 timestamp);
    event Staked(address indexed account,uint256 amount);
    event ExitRequested(uint256 indexed id,address indexed account,uint256 principal,uint256 fee,uint256 unlockTime,uint256 reward);
    event ExitPaid(uint256 indexed id,address indexed account,uint256 principal,uint256 fee,uint256 rewardPaid,uint256 rewardRemaining);
    event RewardsClaimed(address indexed account,uint256 paid,uint256 remaining);
    event FeeWalletProposed(address next);
    event FeeWalletChanged(address previous,address next);

    constructor(address token_,address sale_,address vault_,address feeWallet_){
        if(token_.code.length==0||sale_.code.length==0||vault_.code.length==0
            ||IFRCV2(token_).launchTime()!=0
            ||IStakingSale(sale_).token()!=token_||FRCRewardVault(vault_).token()!=token_
            ||feeWallet_==address(0)||feeWallet_==token_||feeWallet_==sale_||feeWallet_==vault_)
            revert InvalidConfiguration();
        token=token_;sale=sale_;rewardVault=vault_;feeWallet=feeWallet_;
        ratePoints.push(RatePoint(block.timestamp,0,60));
    }
    function _admin() internal view {
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
    }
    function _ready() internal view {
        if(!IFRCV2(token).tradingOpen()||IFRCV2(token).sale()!=sale
            ||FRCRewardVault(rewardVault).staking()!=address(this))revert NotReady();
    }
    function ratePointCount() external view returns(uint256){return ratePoints.length;}
    // Integral of basis-points * seconds. Binary search makes historical lookups bounded logarithmically.
    function _integral(uint256 time) internal view returns(uint256){
        if(time<=ratePoints[0].time)return 0;
        uint256 lo;uint256 hi=ratePoints.length;
        while(lo+1<hi){uint256 mid=(lo+hi)/2;if(ratePoints[mid].time<=time)lo=mid;else hi=mid;}
        RatePoint memory p=ratePoints[lo];return p.integral+(time-p.time)*p.rate;
    }
    function _diff(uint256 a,uint256 b) internal view returns(uint256){return b>a?_integral(b)-_integral(a):0;}
    function _min(uint256 a,uint256 b) internal pure returns(uint256){return a<b?a:b;}
    function _max(uint256 a,uint256 b) internal pure returns(uint256){return a>b?a:b;}
    // Weighted index: 80%, 50%, 20%, 0%. Each boundary is applied even without a keeper transaction.
    function _lockedIndex(uint256 a,uint256 b,uint256 start) internal view returns(uint256){
        if(start==0||b<=start||b<=a)return 0;
        uint256 t0=start+90 days;uint256 t1=start+180 days;uint256 t2=start+365 days;
        return 80*_diff(_max(a,start),_min(b,t0))
            +50*_diff(_max(a,t0),_min(b,t1))+20*_diff(_max(a,t1),_min(b,t2));
    }
    function _numerator(uint256 principal,uint256 allocation,uint256 a,uint256 b) internal view returns(uint256){
        uint256 start=IFRCV2(token).launchTime();
        if(start==0||b<=start)return 0;
        a=_max(a,start);
        return principal*100*_diff(a,b)+allocation*_lockedIndex(a,b,start);
    }
    function _checkpointGlobal() internal {
        uint256 n=_numerator(totalManualPrincipal,IStakingSale(sale).sold(),globalLastTime,block.timestamp)+globalRemainder;
        totalRewardAccrued+=n/DENOM;globalRemainder=n%DENOM;globalLastTime=block.timestamp;
    }
    function _checkpoint(address account) internal {
        _checkpointGlobal();
        Account storage u=accounts[account];
        uint256 n=_numerator(u.principal,IStakingSale(sale).purchased(account),u.lastTime,block.timestamp)+u.remainder;
        u.credit+=n/DENOM;u.remainder=n%DENOM;u.lastTime=block.timestamp;
    }
    function pendingRewards(address account) external view returns(uint256){
        Account memory u=accounts[account];
        return u.credit+(_numerator(u.principal,IStakingSale(sale).purchased(account),u.lastTime,block.timestamp)+u.remainder)/DENOM;
    }
    // Includes unpaid exit rewards. Does not include future unearned rewards.
    function rewardLiability() public view returns(uint256){
        uint256 n=_numerator(totalManualPrincipal,IStakingSale(sale).sold(),globalLastTime,block.timestamp)+globalRemainder;
        return totalRewardAccrued+n/DENOM-totalRewardPaid;
    }
    function automaticPrincipal(address account) public view returns(uint256){
        uint256 start=IFRCV2(token).launchTime();
        if(start==0||block.timestamp<start)return 0;
        uint256 elapsed=block.timestamp-start;
        uint256 weight=elapsed>=365 days?0:elapsed>=180 days?20:elapsed>=90 days?50:80;
        return Math.mulDiv(IStakingSale(sale).purchased(account),weight,100);
    }
    // Conservative 30-day maximum-rate coverage for current automatic + manual principal.
    // It is an admission buffer, not a guarantee that future rewards can always be funded.
    function requiredCoverage(uint256 additionalPrincipal) public view returns(uint256){
        uint256 start=IFRCV2(token).launchTime();uint256 weight;
        if(start!=0&&block.timestamp>=start){uint256 e=block.timestamp-start;weight=e>=365 days?0:e>=180 days?20:e>=90 days?50:80;}
        uint256 principal=totalManualPrincipal+additionalPrincipal+Math.mulDiv(IStakingSale(sale).sold(),weight,100);
        return rewardLiability()+1+Math.mulDiv(principal,MAX_DAILY_RATE_BPS*ADMISSION_COVERAGE_DAYS,10_000,Math.Rounding.Ceil);
    }
    function setDailyRate(uint256 next) external nonReentrant {
        // 超管可管理奖励率；日常运营钱包需单独持有运营角色。
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender)&&!IFRCV2(token).hasRole(OPERATOR_ROLE,msg.sender))revert Unauthorized();
        if(next<MIN_DAILY_RATE_BPS||next>MAX_DAILY_RATE_BPS)revert InvalidConfiguration();
        _checkpointGlobal();uint256 previous=dailyRateBps;
        uint256 cumulative=_integral(block.timestamp);
        dailyRateBps=next;
        RatePoint storage last=ratePoints[ratePoints.length-1];
        if(last.time==block.timestamp){last.rate=next;}else ratePoints.push(RatePoint(block.timestamp,cumulative,next));
        emit RateChanged(previous,next,block.timestamp);
    }
    function proposeFeeWallet(address next) external {
        _admin();if(next==address(0)||next==address(this)||next==token||next==sale||next==rewardVault)revert InvalidConfiguration();
        pendingFeeWallet=next;emit FeeWalletProposed(next);
    }
    function acceptFeeWallet() external {
        if(msg.sender!=pendingFeeWallet)revert Unauthorized();
        address previous=feeWallet;feeWallet=msg.sender;pendingFeeWallet=address(0);emit FeeWalletChanged(previous,msg.sender);
    }
    function stake(uint256 amount) external nonReentrant {
        _ready();if(amount==0)revert InvalidAmount();_checkpoint(msg.sender);
        if(FRCRewardVault(rewardVault).available()<requiredCoverage(amount))revert InsufficientCoverage();
        uint256 beforeBalance=IERC20(token).balanceOf(address(this));
        accounts[msg.sender].principal+=amount;totalManualPrincipal+=amount;
        IERC20(token).safeTransferFrom(msg.sender,address(this),amount);
        if(IERC20(token).balanceOf(address(this))-beforeBalance!=amount)revert PaymentMismatch();
        emit Staked(msg.sender,amount);
    }
    function claimRewards() external nonReentrant {
        _ready();_checkpoint(msg.sender);Account storage u=accounts[msg.sender];
        if(u.credit==0)revert NothingToClaim();uint256 requested=u.credit;
        u.credit=0;uint256 paid=FRCRewardVault(rewardVault).pay(msg.sender,requested);
        u.credit=requested-paid;totalRewardPaid+=paid;emit RewardsClaimed(msg.sender,paid,u.credit);
    }
    // Manual principal exits immediately. The 5% fee applies to principal only; rewards are fee-free.
    function requestExit(uint256 amount) external nonReentrant returns(uint256 id){
        _ready();if(amount==0)revert InvalidAmount();_checkpoint(msg.sender);
        Account storage u=accounts[msg.sender];if(amount>u.principal)revert InvalidAmount();
        u.principal-=amount;totalManualPrincipal-=amount;totalExitPrincipal+=amount;
        uint256 fee=Math.mulDiv(amount,500,10_000,Math.Rounding.Ceil);
        uint256 unlock=block.timestamp;
        uint256 reward=u.credit;u.credit=0;id=exits.length;
        exits.push(Exit(msg.sender,amount,fee,unlock,reward,false));
        emit ExitRequested(id,msg.sender,amount,fee,unlock,reward);
        _claimExit(id);
    }
    function claimExit(uint256 id) external nonReentrant {_ready();_claimExit(id);}
    function _claimExit(uint256 id) internal {
        if(id>=exits.length)revert InvalidAmount();Exit storage e=exits[id];
        if(e.owner!=msg.sender)revert Unauthorized();if(block.timestamp<e.unlockTime)revert NotReady();
        if(e.principalPaid&&e.reward==0)revert NothingToClaim();
        uint256 principal;uint256 fee;
        if(!e.principalPaid){e.principalPaid=true;principal=e.principal;fee=e.fee;totalExitPrincipal-=principal;
            IERC20(token).safeTransfer(e.owner,principal-fee);if(fee!=0)IERC20(token).safeTransfer(feeWallet,fee);}
        uint256 reward=e.reward;e.reward=0;
        uint256 paid=FRCRewardVault(rewardVault).pay(e.owner,reward);
        e.reward=reward-paid;totalRewardPaid+=paid;
        emit ExitPaid(id,e.owner,principal,fee,paid,e.reward);
    }
    function exitCount() external view returns(uint256){return exits.length;}
}
