// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IProjectToken,IPancakePairV2,IPancakeRouterV2} from "./V2Interfaces.sol";

/// @dev No owner, transfer, approval, delegatecall, rescue or selfdestruct entry point.
contract PermanentLPVaultV2 {}

contract StrategicLiquidityVaultV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant INITIAL_TOKEN=1_710_000 ether;
    uint256 public constant STRATEGIC_TOKEN=16_290_000 ether;
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
        paymentToken=IERC20(IProjectToken(token_).paymentToken());
        paymentUnit=10**IERC20Metadata(address(paymentToken)).decimals();
        if(IPancakeRouterV2(router_).factory()!=IProjectTokenFactory(token_).dexFactory())revert InvalidConfiguration();
        lpVault=address(new PermanentLPVaultV2());
    }

    function proposeFundingWallet(address next) external {
        if(!IProjectToken(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
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
        if(IProjectToken(token).liquidityVault()!=address(this))revert NotReady();
        // 超管可直接操作；其余调用者必须持有主代币的运营角色。
        if(!IProjectToken(token).hasRole(bytes32(0),msg.sender)&&!IProjectToken(token).hasRole(keccak256("OPERATOR_ROLE"),msg.sender))revert Unauthorized();
        address pair=IProjectToken(token).primaryPair();
        if(initialSeeded||pair==address(0)||IPancakePairV2(pair).totalSupply()!=0
            ||!IProjectTokenSaleReady(token).initialFundingReady())revert NotReady();
        uint256 payment=600_000*paymentUnit;
        if(paymentToken.balanceOf(address(this))<payment||IERC20(token).balanceOf(address(this))<INITIAL_TOKEN+STRATEGIC_TOKEN)revert NotReady();
        if(minimumLP==0)revert InvalidSlippage();
        initialSeeded=true;liquidityInProgress=true;
        IERC20(token).safeTransfer(pair,INITIAL_TOKEN);
        paymentToken.safeTransfer(pair,payment);
        uint256 lp=IPancakePairV2(pair).mint(lpVault);
        liquidityInProgress=false;
        if(lp<minimumLP)revert InvalidSlippage();
        emit InitialLiquiditySeeded(pair,INITIAL_TOKEN,payment,lp);
    }

    /// @notice The default admin authorizes reserve releases; released TOKEN can only be added to liquidity.
    function unlockStrategic(uint256 amount) external {
        if(!IProjectToken(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();
        if(!initialSeeded||!IProjectToken(token).tradingOpen())revert NotReady();
        if(amount==0||amount>STRATEGIC_TOKEN-unlocked)revert AmountExceeded();
        unlocked+=amount;
        emit StrategicReserveUnlocked(msg.sender,amount,unlocked,STRATEGIC_TOKEN-unlocked);
    }
    function available() public view returns(uint256){return unlocked-injected;}

    /// @notice Funding wallet contributes the configured payment token; unused funds return only to that wallet.
    function inject(uint256 amountToken,uint256 maximumPayment,uint256 minimumToken,uint256 minimumPayment,uint256 deadline)
        external nonReentrant returns(uint256 usedToken,uint256 usedPayment,uint256 lp) {
        if(IProjectToken(token).liquidityVault()!=address(this))revert NotReady();
        if(msg.sender!=fundingWallet)revert Unauthorized();
        if(!initialSeeded||!IProjectToken(token).tradingOpen())revert NotReady();
        if(amountToken==0||amountToken>available()||maximumPayment==0)revert AmountExceeded();
        // At least 99% of desired amounts: no zero-minimum operation or arbitrary loose slippage.
        if(minimumToken<amountToken*99/100||minimumPayment<maximumPayment*99/100
            ||minimumToken>amountToken||minimumPayment>maximumPayment||deadline<block.timestamp||deadline>block.timestamp+30 minutes)revert InvalidSlippage();
        uint256 beforeBalance=paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(fundingWallet,address(this),maximumPayment);
        if(paymentToken.balanceOf(address(this))-beforeBalance!=maximumPayment)revert InvalidConfiguration();
        IERC20(token).forceApprove(router,amountToken);paymentToken.forceApprove(router,maximumPayment);
        liquidityInProgress=true;
        (usedToken,usedPayment,lp)=IPancakeRouterV2(router).addLiquidity(token,address(paymentToken),amountToken,maximumPayment,minimumToken,minimumPayment,lpVault,deadline);
        liquidityInProgress=false;
        if(usedToken==0||lp==0||usedToken>amountToken||usedPayment>maximumPayment)revert InvalidConfiguration();
        injected+=usedToken;
        IERC20(token).forceApprove(router,0);paymentToken.forceApprove(router,0);
        if(maximumPayment>usedPayment)paymentToken.safeTransfer(fundingWallet,maximumPayment-usedPayment);
        emit StrategicLiquidityInjected(usedToken,usedPayment,lp,injected);
    }
}
interface IProjectTokenFactory{function dexFactory() external view returns(address);}
interface IProjectTokenSaleReady{function initialFundingReady() external view returns(bool);}
