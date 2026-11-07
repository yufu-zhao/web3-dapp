// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFRCV2,IPancakePairV2,IPancakeRouterV2} from "./V2Interfaces.sol";

/// @dev No owner, transfer, approval, delegatecall, rescue or selfdestruct entry point.
contract PermanentLPVaultV2 {}

contract StrategicLiquidityVaultV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant INITIAL_FRC=1_710_000 ether;
    uint256 public constant STRATEGIC_FRC=16_290_000 ether;
    address public immutable token;
    IERC20 public immutable paymentToken;
    address public fundingWallet;
    address public pendingFundingWallet;
    address public immutable router;
    address public immutable lpVault;
    uint256 public immutable paymentUnit;
    uint256 public unlocked;
    uint256 public injected;
    bool public initialSeeded;
    bool public liquidityInProgress;
    error InvalidConfiguration();error Unauthorized();error NotReady();error AmountExceeded();error InvalidSlippage();
    event InitialLiquiditySeeded(address pair,uint256 tokenAmount,uint256 paymentAmount,uint256 lp);
    event StrategicReserveUnlocked(address indexed admin,uint256 amount,uint256 unlockedTotal,uint256 remaining);
    event StrategicLiquidityInjected(uint256 tokenAmount,uint256 paymentAmount,uint256 lp,uint256 injectedTotal);
    event FundingWalletProposed(address next);
    event FundingWalletChanged(address previous,address next);

    constructor(address token_,address router_,address fundingWallet_){
        if(token_.code.length==0||router_.code.length==0||fundingWallet_==address(0)||fundingWallet_==address(this))revert InvalidConfiguration();
        token=token_;router=router_;fundingWallet=fundingWallet_;
        paymentToken=IERC20(IFRCV2(token_).paymentToken());
        paymentUnit=10**IERC20Metadata(address(paymentToken)).decimals();
        if(IPancakeRouterV2(router_).factory()!=IFRCV2Factory(token_).dexFactory())revert InvalidConfiguration();
        lpVault=address(new PermanentLPVaultV2());
    }

    function proposeFundingWallet(address next) external {
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
        if(next==address(0)||next==address(this)||next==token)revert InvalidConfiguration();
        pendingFundingWallet=next;emit FundingWalletProposed(next);
    }
    function acceptFundingWallet() external {
        if(msg.sender!=pendingFundingWallet)revert Unauthorized();
        address previous=fundingWallet;fundingWallet=msg.sender;pendingFundingWallet=address(0);
        emit FundingWalletChanged(previous,msg.sender);
    }

    /// @dev Seed exact assets directly then mint LP, avoiding router's zero/one-sided reserve quote path.
    function seedInitialLiquidity(uint256 minimumLP) external nonReentrant {
        if(IFRCV2(token).liquidityVault()!=address(this))revert NotReady();
        // 超管可直接操作；其余调用者必须持有主代币的运营角色。
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender)&&!IFRCV2(token).hasRole(keccak256("OPERATOR_ROLE"),msg.sender))revert Unauthorized();
        address pair=IFRCV2(token).primaryPair();
        if(initialSeeded||pair==address(0)||IPancakePairV2(pair).totalSupply()!=0
            ||!IFRCV2SaleReady(token).initialFundingReady())revert NotReady();
        uint256 payment=600_000*paymentUnit;
        if(paymentToken.balanceOf(address(this))<payment||IERC20(token).balanceOf(address(this))<INITIAL_FRC+STRATEGIC_FRC)revert NotReady();
        if(minimumLP==0)revert InvalidSlippage();
        initialSeeded=true;liquidityInProgress=true;
        IERC20(token).safeTransfer(pair,INITIAL_FRC);
        paymentToken.safeTransfer(pair,payment);
        uint256 lp=IPancakePairV2(pair).mint(lpVault);
        liquidityInProgress=false;
        if(lp<minimumLP)revert InvalidSlippage();
        emit InitialLiquiditySeeded(pair,INITIAL_FRC,payment,lp);
    }

    /// @notice The default admin authorizes reserve releases; released FRC can only be added to liquidity.
    function unlockStrategic(uint256 amount) external {
        if(!IFRCV2(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
        if(!initialSeeded||!IFRCV2(token).tradingOpen())revert NotReady();
        if(amount==0||amount>STRATEGIC_FRC-unlocked)revert AmountExceeded();
        unlocked+=amount;
        emit StrategicReserveUnlocked(msg.sender,amount,unlocked,STRATEGIC_FRC-unlocked);
    }
    function available() public view returns(uint256){return unlocked-injected;}

    /// @notice Funding wallet contributes USDT; unused USDT returns only to that same immutable wallet.
    function inject(uint256 amountFRC,uint256 maximumUSDT,uint256 minimumFRC,uint256 minimumUSDT,uint256 deadline)
        external nonReentrant returns(uint256 usedFRC,uint256 usedUSDT,uint256 lp) {
        if(IFRCV2(token).liquidityVault()!=address(this))revert NotReady();
        if(msg.sender!=fundingWallet)revert Unauthorized();
        if(!initialSeeded||!IFRCV2(token).tradingOpen())revert NotReady();
        if(amountFRC==0||amountFRC>available()||maximumUSDT==0)revert AmountExceeded();
        // At least 99% of desired amounts: no zero-minimum operation or arbitrary loose slippage.
        if(minimumFRC<amountFRC*99/100||minimumUSDT<maximumUSDT*99/100
            ||minimumFRC>amountFRC||minimumUSDT>maximumUSDT||deadline<block.timestamp||deadline>block.timestamp+30 minutes)revert InvalidSlippage();
        uint256 beforeBalance=paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(fundingWallet,address(this),maximumUSDT);
        if(paymentToken.balanceOf(address(this))-beforeBalance!=maximumUSDT)revert InvalidConfiguration();
        IERC20(token).forceApprove(router,amountFRC);paymentToken.forceApprove(router,maximumUSDT);
        liquidityInProgress=true;
        (usedFRC,usedUSDT,lp)=IPancakeRouterV2(router).addLiquidity(token,address(paymentToken),amountFRC,maximumUSDT,minimumFRC,minimumUSDT,lpVault,deadline);
        liquidityInProgress=false;
        if(usedFRC==0||lp==0||usedFRC>amountFRC||usedUSDT>maximumUSDT)revert InvalidConfiguration();
        injected+=usedFRC;
        IERC20(token).forceApprove(router,0);paymentToken.forceApprove(router,0);
        if(maximumUSDT>usedUSDT)paymentToken.safeTransfer(fundingWallet,maximumUSDT-usedUSDT);
        emit StrategicLiquidityInjected(usedFRC,usedUSDT,lp,injected);
    }
}
interface IFRCV2Factory{function dexFactory() external view returns(address);}
interface IFRCV2SaleReady{function initialFundingReady() external view returns(bool);}
