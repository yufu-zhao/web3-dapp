// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 仅供测试网络使用的支付币；任何人都可铸币，严禁作为主网资产。
contract MockUSDT is ERC20 {
    uint8 private immutable units;

    /// @param decimals_ 测试币精度；BSC 测试配置使用 18 位。
    constructor(uint8 decimals_) ERC20("Mock USDT", "USDT") {
        units = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return units;
    }

    /// @notice 测试用途：任何地址均可铸造，不具备真实 USDT 价值。
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
