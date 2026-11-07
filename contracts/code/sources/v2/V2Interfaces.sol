// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IV2Sale {
    function token() external view returns (address);
    function sold() external view returns (uint256);
    function allRoundsFinalized() external view returns (bool);
    function totalParticipants() external view returns (uint256);
    function cursor() external view returns (uint8);
}
interface IV2LiquidityVault {
    function token() external view returns (address);
    function initialSeeded() external view returns (bool);
    function liquidityInProgress() external view returns (bool);
}
interface IFRCV2 {
    function sale() external view returns (address);
    function liquidityVault() external view returns (address);
    function priceOracle() external view returns (address);
    function paymentToken() external view returns (address);
    function primaryPair() external view returns (address);
    function launchTime() external view returns (uint256);
    function tradingOpen() external view returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function observeDrop(uint256 dropBps) external;
    function resetOracleProtection() external;
}
interface IV2PriceOracle {
    function resetForActivation() external;
    function token() external view returns (address);
    function pair() external view returns (address);
    function isFresh() external view returns (bool);
}
interface IPancakePairV2 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function totalSupply() external view returns (uint256);
    function getReserves() external view returns (uint112,uint112,uint32);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function mint(address to) external returns (uint256);
}
interface IPancakeFactoryV2 {
    function getPair(address a, address b) external view returns (address);
}
interface IPancakeRouterV2 {
    function factory() external view returns (address);
    function addLiquidity(address a,address b,uint256 wantA,uint256 wantB,uint256 minA,uint256 minB,address to,uint256 deadline)
        external returns (uint256 usedA,uint256 usedB,uint256 liquidity);
}
