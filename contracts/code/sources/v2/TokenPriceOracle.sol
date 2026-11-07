// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IProjectToken,IPancakePairV2} from "./V2Interfaces.sol";

/// @notice Permissionless V2 cumulative-price samples. No arbitrary operator price setter.
/// @dev Deployment policy: short-period TWAP vs the closest non-stale TWAP ending >=24h earlier.
contract TokenPriceOracle {
    address public immutable token;
    address public pair;
    uint256 public period;
    uint256 public minimumPaymentReserve;
    uint256 private immutable paymentUnit;
    bool private tokenIsZero;
    uint256 private constant Q112=2**112;
    uint256 private constant CAPACITY=512;
    struct Observation{uint256 timestamp;uint256 price;}
    Observation[512] private observations;
    uint256 public count;
    uint256 public nextIndex;
    uint256 public lastSample;
    uint256 public lastCumulative;
    uint256 public latestPrice;
    bool public initialized;
    error InvalidConfiguration();error NotReady();error TooSoon();
    event OracleStarted(uint256 timestamp);
    event HistoryReset(uint256 timestamp);
    event PriceObserved(uint256 timestamp,uint256 price,uint256 baseline,uint256 dropBps);
    event ParametersChanged(uint256 samplePeriod,uint256 minReserve);

    constructor(address token_,uint256 samplePeriod,uint256 minReserve){
        if(token_.code.length==0||samplePeriod<5 minutes||samplePeriod>1 hours||minReserve==0||minReserve>type(uint112).max)revert InvalidConfiguration();
        token=token_;
        address configuredPair=IProjectToken(token_).primaryPair();
        if(configuredPair!=address(0))_validatePair(configuredPair);
        pair=configuredPair;
        tokenIsZero=configuredPair!=address(0)&&IPancakePairV2(configuredPair).token0()==token_;
        address payment=IProjectToken(token_).paymentToken();
        paymentUnit=10**IERC20Metadata(payment).decimals();
        period=samplePeriod;minimumPaymentReserve=minReserve;
    }

    /// @notice 交易对登记到主代币后，由部署超管设置预言机交易对。
    function configurePair(address nextPair) external {
        if(!IProjectToken(token).hasRole(bytes32(0),msg.sender))revert InvalidConfiguration();
        if(nextPair==address(0)||IProjectToken(token).primaryPair()!=nextPair)revert InvalidConfiguration();
        if(pair!=address(0)) {
            if(pair==nextPair)return;
            revert InvalidConfiguration();
        }
        _validatePair(nextPair);
        pair=nextPair;
        tokenIsZero=IPancakePairV2(nextPair).token0()==token;
        _reset();
    }

    function _validatePair(address pair_) internal view {
        if(pair_.code.length==0)revert InvalidConfiguration();
        address token0=IPancakePairV2(pair_).token0();
        address token1=IPancakePairV2(pair_).token1();
        address payment=IProjectToken(token).paymentToken();
        if(!((token0==token&&token1==payment)||(token1==token&&token0==payment)))revert InvalidConfiguration();
    }
    function configureParameters(uint256 samplePeriod,uint256 minReserve) external {
        if(!IProjectToken(token).hasRole(bytes32(0),msg.sender))revert InvalidConfiguration();
        if(samplePeriod<5 minutes||samplePeriod>1 hours||minReserve==0||minReserve>type(uint112).max)revert InvalidConfiguration();
        period=samplePeriod;minimumPaymentReserve=minReserve;
        _reset();
        if(IProjectToken(token).priceOracle()==address(this))IProjectToken(token).resetOracleProtection();
        emit ParametersChanged(samplePeriod,minReserve);
    }
    function resetForActivation() external {
        if(msg.sender!=token)revert InvalidConfiguration();
        _reset();
    }
    function _reset() internal {
        initialized=false;count=0;nextIndex=0;lastSample=0;lastCumulative=0;latestPrice=0;
        emit HistoryReset(block.timestamp);
    }
    function _cumulative() internal view returns(uint256 cumulative){
        if(pair==address(0))revert NotReady();
        IPancakePairV2 p=IPancakePairV2(pair);
        (uint112 a,uint112 b,uint32 stamp)=p.getReserves();
        uint256 tokenReserve=tokenIsZero?a:b;uint256 usdReserve=tokenIsZero?b:a;
        if(tokenReserve==0||usdReserve<minimumPaymentReserve)revert NotReady();
        cumulative=tokenIsZero?p.price0CumulativeLast():p.price1CumulativeLast();
        unchecked {
            uint32 elapsed=uint32(block.timestamp)-stamp;
            cumulative+=(usdReserve*Q112/tokenReserve)*elapsed;
        }
    }
    function start() external {
        if(pair==address(0)||initialized||IProjectToken(token).priceOracle()!=address(this)||!IProjectToken(token).tradingOpen())revert NotReady();
        lastCumulative=_cumulative();lastSample=block.timestamp;initialized=true;
        emit OracleStarted(block.timestamp);
    }
    function isFresh() external view returns(bool){
        if(pair==address(0)||!initialized||latestPrice==0||block.timestamp>lastSample+2*period)return false;
        (uint112 a,uint112 b,)=IPancakePairV2(pair).getReserves();
        return (tokenIsZero?a:b)>0&&(tokenIsZero?b:a)>=minimumPaymentReserve;
    }
    function sample() external {
        if(!initialized)revert NotReady();
        uint256 elapsed=block.timestamp-lastSample;
        if(elapsed<period)revert TooSoon();
        uint256 cumulative=_cumulative();
        if(elapsed>2*period){
            count=0;nextIndex=0;latestPrice=0;lastSample=block.timestamp;lastCumulative=cumulative;
            emit HistoryReset(block.timestamp);return;
        }
        uint256 delta;unchecked{delta=cumulative-lastCumulative;}
        uint256 price=Math.mulDiv(delta/elapsed,1e36,Q112*paymentUnit);
        uint256 baseline;uint256 baselineTime;
        if(block.timestamp>=1 days){
            uint256 target=block.timestamp-1 days;
            for(uint256 i=0;i<count;i++){
                Observation memory o=observations[i];
                if(o.timestamp<=target&&o.timestamp+2*period>=target&&o.timestamp>baselineTime){
                    baselineTime=o.timestamp;baseline=o.price;
                }
            }
        }
        observations[nextIndex]=Observation(block.timestamp,price);
        nextIndex=(nextIndex+1)%CAPACITY;if(count<CAPACITY)count++;
        lastSample=block.timestamp;lastCumulative=cumulative;latestPrice=price;
        uint256 drop=baseline>price&&baseline>0?Math.mulDiv(baseline-price,10000,baseline):0;
        if(baseline>0)IProjectToken(token).observeDrop(drop);
        emit PriceObserved(block.timestamp,price,baseline,drop);
    }
}
