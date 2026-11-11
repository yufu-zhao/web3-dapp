// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
/// @dev 本地测试使用，不模拟实际代币税费。
contract BatchTestPayment is ERC20 {
    constructor() ERC20("Payment", "PAY") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract BatchTestToken is ERC20 {
    address public paymentToken; address public dexFactory; address public primaryPair;
    bool public tradingOpen = true; address public admin;
    constructor(address payment, address factory, address pair) ERC20("Token", "TKN") {
        paymentToken = payment; dexFactory = factory; primaryPair = pair; admin = msg.sender;
    }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function hasRole(bytes32 role, address who) external view returns (bool) { return role == bytes32(0) && who == admin; }
}
contract BatchTestFactory {
    address public pair;
    function setPair(address value) external { pair = value; }
    function getPair(address, address) external view returns (address) { return pair; }
}
contract BatchTestRouter {
    address public factory;
    constructor(address f) { factory = f; }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amount, uint256 minimum, address[] calldata path, address to, uint256) external {
        require(amount >= minimum, "minOut");
        require(ERC20(path[0]).transferFrom(msg.sender, address(this), amount));
        require(ERC20(path[1]).transfer(to, amount));
    }
}
/// @dev 以本地 EOA 代签，验证目标合约对 ERC-1271 钱包订单的支持。
contract BatchTest1271Wallet is IERC1271 {
    address public immutable signer;
    constructor(address signer_) { signer = signer_; }
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature);
        return error == ECDSA.RecoverError.NoError && recovered == signer ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
    function execute(address target, bytes calldata data) external returns (bool success, bytes memory result) {
        require(msg.sender == signer, "signer only");
        (success, result) = target.call(data);
    }
}
