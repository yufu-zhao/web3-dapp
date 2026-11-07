// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IProjectToken} from "./V2Interfaces.sol";

/// @notice Fixed-ticket entry (default 100 payment-token units), once across all rounds. Terms lock on first entry.
contract FairSaleV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 private constant OPERATOR_ROLE=keccak256("OPERATOR_ROLE");
    bytes32 private constant LAUNCH_ROLE=keccak256("LAUNCH_ROLE");
    uint256 public constant ALLOCATION=3_000_000 ether;
    uint256 private constant ROUND_ONE_BASE=800_000 ether;
    uint256 private constant ROUND_TWO_BASE=1_000_000 ether;
    uint256 private constant ROUND_THREE_BASE=1_200_000 ether;
    address public immutable token;
    IERC20 public immutable paymentToken;
    address public proceedsWallet;
    address public pendingProceedsWallet;
    uint256 public immutable paymentUnit;
    uint256 public ticket;
    uint256[3] private prices;
    uint256[3] public roundBase;
    uint256 public totalParticipants;
    // Each round has an explicit opening time. A zero value means not yet scheduled.
    uint256[3] public roundStartTimes;
    struct Round {
        uint256 endTime;
        uint256 offered;
        uint256 participants;
        uint256 allocated;
        uint256 share;
        uint256 extraWeiParticipants;
        uint256 acceptedPayment;
        bool finalized;
    }
    struct Entry { uint8 roundPlusOne; uint256 index; bool refundClaimed; }
    Round[3] public rounds;
    mapping(address=>Entry) public entries;
    mapping(address=>uint256) public claimed;
    uint8 public cursor;
    uint256 public sold;
    uint256 public acceptedPayment;
    uint256 public refundLiability;
    uint256 public proceedsWithdrawn;
    bool public initialLiquidityFunded;
    error Unauthorized();error InvalidRound();error InvalidTime();error AlreadyEntered();
    error NotFinalized();error NothingToClaim();error SaleNotComplete();error InvalidConfiguration();error PaymentMismatch();
    event RoundEndSet(uint8 indexed round,uint256 timestamp);
    event RoundTimesSet(uint8 indexed round,uint256 startTime,uint256 endTime);
    event SaleTermsChanged(uint256[3] prices,uint256[3] roundAmounts,uint256 ticket);
    event ProceedsWalletProposed(address next);
    event ProceedsWalletChanged(address previous,address next);
    event Committed(address indexed buyer,uint8 indexed round,uint256 index,uint256 payment);
    event RoundFinalized(uint8 indexed round,uint256 allocated,uint256 accepted,uint256 carry);
    event RefundClaimed(address indexed buyer,uint256 amount);
    event Claimed(address indexed buyer,uint256 amount);
    event InitialLiquidityFunded(address vault,uint256 amount);
    event ProceedsWithdrawn(address wallet,uint256 amount);

    constructor(address token_,address proceeds_) {
        if(token_.code.length==0||proceeds_==address(0)||proceeds_==address(this))revert InvalidConfiguration();
        token=token_;proceedsWallet=proceeds_;
        address payment=IProjectToken(token_).paymentToken();
        uint8 decimals=IERC20Metadata(payment).decimals();
        if(decimals!=6&&decimals!=18)revert InvalidConfiguration();
        paymentToken=IERC20(payment);paymentUnit=10**decimals;ticket=100*paymentUnit;
        prices=[paymentUnit*20/100,paymentUnit*28/100,paymentUnit*35/100];
        roundBase=[ROUND_ONE_BASE,ROUND_TWO_BASE,ROUND_THREE_BASE];
        rounds[0].offered=ROUND_ONE_BASE;
    }
    // 超管拥有全部操作权限；其他调用者必须持有运营角色。
    modifier operator(){if(!IProjectToken(token).hasRole(bytes32(0),msg.sender)&&!IProjectToken(token).hasRole(OPERATOR_ROLE,msg.sender))revert Unauthorized();_;}
    modifier admin(){if(!IProjectToken(token).hasRole(bytes32(0),msg.sender))revert Unauthorized();_;}
    function activeModule() public view returns(bool){return IProjectToken(token).sale()==address(this);}
    function price(uint8 round) public view returns(uint256){
        if(round>2)revert InvalidRound();return prices[round];
    }
    function configureSaleTerms(uint256[3] calldata nextPrices,uint256[3] calldata amounts,uint256 nextTicket) external admin {
        if(!activeModule()||totalParticipants!=0||cursor!=0||IProjectToken(token).launchTime()!=0)revert InvalidConfiguration();
        if(nextTicket==0||amounts[0]+amounts[1]+amounts[2]!=ALLOCATION)revert InvalidConfiguration();
        for(uint256 i=0;i<3;i++) {
            // Each ticket must buy >=1 raw TOKEN unit. Bound cost arithmetic to the allocation.
            if(nextPrices[i]==0||nextPrices[i]>type(uint128).max||amounts[i]==0
                ||Math.mulDiv(nextTicket,1 ether,nextPrices[i])==0)revert InvalidConfiguration();
        }
        if(nextTicket>type(uint128).max)revert InvalidConfiguration();
        uint256 expectedProceeds;
        for(uint256 i=0;i<3;i++)expectedProceeds+=Math.mulDiv(amounts[i],nextPrices[i],1 ether);
        if(expectedProceeds<600_000*paymentUnit)revert InvalidConfiguration();
        prices=nextPrices;roundBase=amounts;ticket=nextTicket;rounds[0].offered=amounts[0];
        emit SaleTermsChanged(nextPrices,amounts,nextTicket);
    }
    function proposeProceedsWallet(address next) external admin {
        if(next==address(0)||next==address(this)||next==token)revert InvalidConfiguration();
        pendingProceedsWallet=next;emit ProceedsWalletProposed(next);
    }
    function acceptProceedsWallet() external {
        if(msg.sender!=pendingProceedsWallet)revert Unauthorized();
        address previous=proceedsWallet;proceedsWallet=msg.sender;pendingProceedsWallet=address(0);
        emit ProceedsWalletChanged(previous,msg.sender);
    }
    function activeRound() public view returns(uint8){
        return cursor;
    }
    // 0: waiting for schedule, 1: scheduled but not open, 2: accepting,
    // 3: awaiting settlement, 4: finished.
    function roundState() external view returns(uint8){
        if(cursor==3)return 4;
        uint256 start=roundStartTimes[cursor];
        uint256 end=rounds[cursor].endTime;
        if(start==0||end==0)return 0;
        if(block.timestamp<start)return 1;
        return block.timestamp<end?2:3;
    }
    function roundStartTime(uint8 id) external view returns(uint256){
        if(id>2)revert InvalidRound();return roundStartTimes[id];
    }
    function setRoundTimes(uint8 id,uint256 startTime,uint256 endTime) external operator nonReentrant {
        if(!activeModule())revert InvalidConfiguration();
        if(id!=cursor||id>2)revert InvalidRound();
        Round storage r=rounds[id];
        if(r.endTime!=0&&block.timestamp>=r.endTime)revert InvalidTime();
        uint256 existingStart=roundStartTimes[id];
        // Opening time is immutable once reached or once the first entry is accepted.
        if(r.participants!=0||(existingStart!=0&&block.timestamp>=existingStart)){
            if(startTime!=existingStart)revert InvalidTime();
        } else if(startTime<=block.timestamp)revert InvalidTime();
        if(endTime<=block.timestamp||endTime<=startTime)revert InvalidTime();
        roundStartTimes[id]=startTime;r.endTime=endTime;
        emit RoundTimesSet(id,startTime,endTime);
        emit RoundEndSet(id,endTime);
    }
    function setRoundEnd(uint8 id,uint256 timestamp) external operator nonReentrant {
        if(!activeModule())revert InvalidConfiguration();
        if(id!=cursor||id>2)revert InvalidRound();
        uint256 start=roundStartTimes[id];
        // Keep the start fixed; the operator may extend/shorten the future deadline only.
        if(start==0||timestamp<=block.timestamp||timestamp<=start||block.timestamp>=rounds[id].endTime)revert InvalidTime();
        if(rounds[id].participants!=0&&block.timestamp<start)revert InvalidConfiguration();
        rounds[id].endTime=timestamp;emit RoundEndSet(id,timestamp);
    }
    function commit(uint8 expectedRound) external nonReentrant {
        _commit(expectedRound);
    }
    function termsHash(uint8 id) public view returns(bytes32) {
        if(id>2)revert InvalidRound();
        return keccak256(abi.encode(address(this),block.chainid,id,prices[id],roundBase[id],ticket,rounds[id].endTime));
    }
    function commitWithTerms(uint8 expectedRound,bytes32 expectedTerms) external nonReentrant {
        if(termsHash(expectedRound)!=expectedTerms)revert InvalidConfiguration();
        _commit(expectedRound);
    }
    function _commit(uint8 expectedRound) internal {
        if(!activeModule())revert InvalidConfiguration();
        if(cursor>2||expectedRound!=cursor)revert InvalidRound();
        uint256 start=roundStartTimes[cursor];
        uint256 end=rounds[cursor].endTime;
        if(start==0||end==0||block.timestamp<start||block.timestamp>=end)revert InvalidTime();
        if(entries[msg.sender].roundPlusOne!=0)revert AlreadyEntered();
        // Require bootstrap and the first deadline before accepting deposits.
        if(rounds[0].endTime==0||IERC20(token).balanceOf(address(this))<ALLOCATION)revert InvalidConfiguration();
        Round storage r=rounds[cursor];
        entries[msg.sender]=Entry(cursor+1,r.participants,false);
        totalParticipants++;
        r.participants++;
        uint256 balance=paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender,address(this),ticket);
        if(paymentToken.balanceOf(address(this))-balance!=ticket)revert PaymentMismatch();
        emit Committed(msg.sender,cursor,r.participants-1,ticket);
    }
    function finalize(uint8 expectedRound) external nonReentrant {
        IProjectToken projectToken=IProjectToken(token);
        if(!projectToken.hasRole(bytes32(0),msg.sender)&&!projectToken.hasRole(OPERATOR_ROLE,msg.sender)
            &&!projectToken.hasRole(LAUNCH_ROLE,msg.sender))revert Unauthorized();
        if(cursor!=expectedRound||cursor>2||rounds[cursor].endTime==0||block.timestamp<rounds[cursor].endTime)revert InvalidRound();
        _finalize();
    }
    function _cost(uint256 share,uint8 id) internal view returns(uint256){
        return Math.mulDiv(share,price(id),1 ether,Math.Rounding.Ceil);
    }
    function _finalize() internal {
        uint8 id=cursor;Round storage r=rounds[id];
        uint256 n=r.participants;
        if(n>0){
            uint256 affordable=Math.mulDiv(ticket,1 ether,price(id));
            uint256 maximum=affordable*n;
            r.allocated=maximum<r.offered?maximum:r.offered;
            r.share=r.allocated/n;
            r.extraWeiParticipants=r.allocated%n;
            r.acceptedPayment=(n-r.extraWeiParticipants)*_cost(r.share,id)
                +r.extraWeiParticipants*_cost(r.share+1,id);
            refundLiability+=n*ticket-r.acceptedPayment;
        }
        r.finalized=true;sold+=r.allocated;acceptedPayment+=r.acceptedPayment;
        uint256 carry=r.offered-r.allocated;
        cursor++;
        if(cursor<3)rounds[cursor].offered=roundBase[cursor]+carry;
        emit RoundFinalized(id,r.allocated,r.acceptedPayment,carry);
    }
    function allocationOf(address buyer) public view returns(uint256 amount,uint256 cost,uint256 refund){
        Entry memory e=entries[buyer];if(e.roundPlusOne==0)return(0,0,0);
        uint8 id=e.roundPlusOne-1;Round memory r=rounds[id];
        if(!r.finalized)return(0,0,0);
        amount=r.share+(e.index<r.extraWeiParticipants?1:0);
        cost=_cost(amount,id);refund=ticket-cost;
    }
    function purchased(address buyer) external view returns(uint256){(uint256 amount,,)=allocationOf(buyer);return amount;}
    function claimRefund() external nonReentrant {
        Entry storage e=entries[msg.sender];
        if(e.roundPlusOne==0||!rounds[e.roundPlusOne-1].finalized)revert NotFinalized();
        if(e.refundClaimed)revert NothingToClaim();
        (,,uint256 amount)=allocationOf(msg.sender);
        e.refundClaimed=true;refundLiability-=amount;
        if(amount>0)paymentToken.safeTransfer(msg.sender,amount);
        emit RefundClaimed(msg.sender,amount);
    }
    function allRoundsFinalized() public view returns(bool){return cursor==3;}
    function claimable(address buyer) public view returns(uint256){
        if(!IProjectToken(token).tradingOpen())return 0;
        uint256 start=IProjectToken(token).launchTime();
        uint256 elapsed=block.timestamp-start;
        uint256 percentage=elapsed>=365 days?100:elapsed>=180 days?80:elapsed>=90 days?50:20;
        (uint256 amount,,)=allocationOf(buyer);
        return amount*percentage/100-claimed[buyer];
    }
    function claim() external nonReentrant {
        uint256 amount=claimable(msg.sender);if(amount==0)revert NothingToClaim();
        claimed[msg.sender]+=amount;
        IERC20(token).safeTransfer(msg.sender,amount);
        emit Claimed(msg.sender,amount);
    }
    // Only settled proceeds may leave escrow. Unclaimed refunds remain fully collateralized.
    function fundInitialLiquidity() external nonReentrant {
        if(!allRoundsFinalized()||sold!=ALLOCATION||initialLiquidityFunded)revert SaleNotComplete();
        address vault=IProjectTokenWithVault(token).liquidityVault();
        if(vault==address(0))revert InvalidConfiguration();
        uint256 amount=600_000*paymentUnit;
        if(acceptedPayment<amount)revert SaleNotComplete();
        initialLiquidityFunded=true;proceedsWithdrawn=amount;
        paymentToken.safeTransfer(vault,amount);
        emit InitialLiquidityFunded(vault,amount);
    }
    function withdrawProceeds() external nonReentrant {
        if(!initialLiquidityFunded)revert SaleNotComplete();
        uint256 amount=acceptedPayment-proceedsWithdrawn;
        if(amount==0)revert NothingToClaim();
        proceedsWithdrawn+=amount;paymentToken.safeTransfer(proceedsWallet,amount);
        emit ProceedsWithdrawn(proceedsWallet,amount);
    }
}
interface IProjectTokenWithVault{function liquidityVault() external view returns(address);}
