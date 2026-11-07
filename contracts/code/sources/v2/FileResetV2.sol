// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IV2Sale,IV2LiquidityVault,IV2PriceOracle,IPancakeFactoryV2,IPancakePairV2} from "./V2Interfaces.sol";

contract FileResetV2 is ERC20, AccessControlDefaultAdminRules {
    uint256 public constant INITIAL_SUPPLY = 210_000_000 ether;
    uint256 public constant SUPPLY_FLOOR = 21_000_000 ether;
    uint256 public constant PRESALE_ALLOCATION = 3_000_000 ether;
    uint256 public constant INITIAL_LIQUIDITY = 1_710_000 ether;
    uint256 public constant STRATEGIC_RESERVE = 16_290_000 ether;
    uint256 public constant DEFLATION_ALLOCATION = 189_000_000 ether;
    uint256 public constant MAX_BURN_MULTIPLIER = 100;
    uint256 public constant MAX_SELL_TAX_BPS = 2500;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant LAUNCH_ROLE = keccak256("LAUNCH_ROLE");
    bytes32 public constant BATCH_REGISTRAR_ROLE = keccak256("BATCH_REGISTRAR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    address public immutable paymentToken;
    address public immutable dexFactory;
    address public ecosystemWallet;
    address public pendingEcosystemWallet;
    address public sale;
    address public liquidityVault;
    address public primaryPair;
    address public priceOracle;
    uint256 public launchTime;
    uint256 public burnMultiplier = 1;
    uint256 public deflationRemaining = DEFLATION_ALLOCATION;
    int256 public cumulativeNetBuy;
    int256 public netBuyHighWater;
    uint256 public extraSellTaxBps;
    uint256 public protectionUntil;
    uint256 public cooldownUntil;

    error InvalidConfiguration();
    error AlreadyConfigured();
    error TradingClosed();
    error SaleNotComplete();
    error LiquidityNotReady();
    error InvalidMultiplier();
    error UnauthorizedOracle();
    error AdminExitBeforeLaunch();
    error ConfigurationLocked();
    event ModulesConfigured(address sale,address vault);
    event PairConfigured(address pair);
    event OracleConfigured(address oracle);
    event BurnMultiplierChanged(uint256 previous,uint256 next);
    event LaunchScheduled(uint256 timestamp);
    event ProtectionTriggered(uint256 extraSellTaxBps,uint256 expires,uint256 cooldownUntil);
    event TransactionTax(address indexed from,address indexed to,uint256 burned,uint256 ecosystemFee);
    event DeflationBurned(uint256 newHighWater,uint256 burned,uint256 remaining);
    event EcosystemWalletProposed(address next);
    event EcosystemWalletChanged(address previous,address next);

    // 部署交易发送者自动成为唯一初始超管，避免部署参数把权限授予错误地址。
    // ERC-20 名称在安装时确认，部署后由链上 name() 和 symbol() 固定提供。
    constructor(string memory tokenName_,string memory tokenSymbol_,address usdt,address factory,address ecoWallet,address operator,address launch,address batchRegistrar,address pauser)
        ERC20(tokenName_,tokenSymbol_) AccessControlDefaultAdminRules(2 days,msg.sender) {
        if (usdt.code.length == 0 || factory.code.length == 0 || ecoWallet == address(0)
            || ecoWallet == address(this) || operator == address(0) || launch == address(0)
            || batchRegistrar == address(0) || pauser == address(0)) revert InvalidConfiguration();
        paymentToken=usdt;
        dexFactory=factory;
        ecosystemWallet=ecoWallet;
        // The super administrator keeps full operational and launch capability,
        // even when the day-to-day operator is a separate wallet.
        // 超管通过各模块的管理员绕过校验拥有全部受限操作权限。
        _grantRole(OPERATOR_ROLE,operator);
        _grantRole(LAUNCH_ROLE,launch);
        _grantRole(BATCH_REGISTRAR_ROLE,batchRegistrar);
        _grantRole(PAUSER_ROLE,pauser);
        _mint(address(this),INITIAL_SUPPLY);
    }

    function configureModules(address sale_,address vault_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireBootstrapMutable();
        if (sale_.code.length == 0 || vault_.code.length == 0 || sale_ == vault_
            || IV2Sale(sale_).token() != address(this) || IV2LiquidityVault(vault_).token() != address(this)) revert InvalidConfiguration();
        if (IV2Sale(sale_).totalParticipants()!=0 || IV2Sale(sale_).cursor()!=0 || IV2Sale(sale_).sold()!=0
            || IV2LiquidityVault(vault_).initialSeeded()) revert InvalidConfiguration();
        // Recover only the uncommitted bootstrap allocation; never touch a funded sale.
        if(sale!=address(0)) {
            if(balanceOf(sale)!=PRESALE_ALLOCATION || balanceOf(liquidityVault)!=INITIAL_LIQUIDITY+STRATEGIC_RESERVE)
                revert ConfigurationLocked();
            super._update(sale,address(this),PRESALE_ALLOCATION);
            super._update(liquidityVault,address(this),INITIAL_LIQUIDITY+STRATEGIC_RESERVE);
        }
        sale=sale_;
        liquidityVault=vault_;
        // Bootstrap allocation uses the base ERC20 path; no public mint/exemption switch exists.
        super._update(address(this),sale_,PRESALE_ALLOCATION);
        super._update(address(this),vault_,INITIAL_LIQUIDITY+STRATEGIC_RESERVE);
        emit ModulesConfigured(sale_,vault_);
    }

    function configurePair(address pair_) external {
        _checkRoleOrAdmin(OPERATOR_ROLE);
        _requireBootstrapMutable();
        if (sale == address(0) || pair_.code.length == 0 || pair_ == ecosystemWallet) revert InvalidConfiguration();
        IPancakePairV2 pair=IPancakePairV2(pair_);
        address a=pair.token0(); address b=pair.token1();
        if (!((a==address(this)&&b==paymentToken)||(b==address(this)&&a==paymentToken))
            || pair.factory()!=dexFactory || IPancakeFactoryV2(dexFactory).getPair(address(this),paymentToken)!=pair_) revert InvalidConfiguration();
        primaryPair=pair_;
        emit PairConfigured(pair_);
    }

    function configureOracle(address oracle) external {
        // 首次绑定允许操作员配置；替换已有预言机属于超管操作。
        if (priceOracle != address(0)) {
            if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert AccessControlUnauthorizedAccount(msg.sender, DEFAULT_ADMIN_ROLE);
        } else if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(OPERATOR_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, OPERATOR_ROLE);
        }
        if (primaryPair==address(0) || oracle.code.length==0 || IV2PriceOracle(oracle).token()!=address(this)
            || IV2PriceOracle(oracle).pair()!=primaryPair) revert InvalidConfiguration();
        priceOracle=oracle;
        IV2PriceOracle(oracle).resetForActivation();
        extraSellTaxBps=0;protectionUntil=0;cooldownUntil=0;
        emit OracleConfigured(oracle);
    }
    function resetOracleProtection() external {
        if(msg.sender!=priceOracle) revert UnauthorizedOracle();
        extraSellTaxBps=0;protectionUntil=0;cooldownUntil=0;
    }

    function bootstrapMutable() public view returns(bool) {
        if(launchTime!=0) return false;
        if(sale!=address(0) && (IV2Sale(sale).totalParticipants()!=0 || IV2Sale(sale).cursor()!=0
            || IV2Sale(sale).sold()!=0 || IV2FundedSale(sale).initialLiquidityFunded())) return false;
        if(liquidityVault!=address(0) && IV2LiquidityVault(liquidityVault).initialSeeded()) return false;
        if(primaryPair!=address(0) && IPancakePairV2(primaryPair).totalSupply()!=0) return false;
        return true;
    }
    function _requireBootstrapMutable() internal view {
        if(!bootstrapMutable()) revert ConfigurationLocked();
    }

    function setBurnMultiplier(uint256 next) external {
        _checkRoleOrAdmin(OPERATOR_ROLE);
        if (next==0 || next>MAX_BURN_MULTIPLIER) revert InvalidMultiplier();
        uint256 previous=burnMultiplier; burnMultiplier=next;
        emit BurnMultiplierChanged(previous,next);
    }

    function scheduleLaunch(uint256 timestamp) external {
        _checkRoleOrAdmin(LAUNCH_ROLE);
        if (tradingOpen()) revert ConfigurationLocked();
        if (sale==address(0) || !IV2Sale(sale).allRoundsFinalized() || IV2Sale(sale).sold()!=PRESALE_ALLOCATION) revert SaleNotComplete();
        if (primaryPair==address(0) || priceOracle==address(0) || !IV2LiquidityVault(liquidityVault).initialSeeded()) revert LiquidityNotReady();
        (uint112 a,uint112 b,)=IPancakePairV2(primaryPair).getReserves();
        if (a==0||b==0) revert LiquidityNotReady();
        if (timestamp<=block.timestamp) revert InvalidConfiguration();
        launchTime=timestamp;
        emit LaunchScheduled(timestamp);
    }

    function tradingOpen() public view returns(bool) { return launchTime!=0 && block.timestamp>=launchTime; }
    function initialFundingReady() external view returns(bool) {
        return sale!=address(0)&&IV2FundedSale(sale).initialLiquidityFunded();
    }

    // Price observations come only from the currently bound oracle, not an operator's price input.
    function observeDrop(uint256 dropBps) external {
        if (msg.sender!=priceOracle || !tradingOpen()) revert UnauthorizedOracle();
        // extraSellTaxBps records the increase over the normal 5% combined sell tax.
        // Tier 1: 11% total (8% burn + 3% ecosystem); tier 2: 18% total (15% + 3%).
        uint256 level=dropBps>2000 ? 1300 : dropBps>1000 ? 600 : 0;
        if (level==0) return;
        if (block.timestamp<protectionUntil) {
            if (level>extraSellTaxBps) {
                extraSellTaxBps=level; // Escalation does not extend the original 24-hour window.
                emit ProtectionTriggered(level,protectionUntil,cooldownUntil);
            }
        } else if (block.timestamp>=cooldownUntil) {
            extraSellTaxBps=level;
            protectionUntil=block.timestamp+1 days;
            cooldownUntil=protectionUntil+1 days;
            emit ProtectionTriggered(level,protectionUntil,cooldownUntil);
        }
    }

    function activeExtraSellTaxBps() public view returns(uint256) {
        if (block.timestamp>=protectionUntil || priceOracle==address(0)) return 0;
        try IV2PriceOracle(priceOracle).isFresh() returns(bool fresh) { return fresh ? extraSellTaxBps : 0; }
        catch { return 0; } // An oracle failure never locks selling.
    }

    function effectiveSellTaxBps() external view returns(uint256 burnBps,uint256 ecosystemBps) {
        return _sellRates();
    }
    function _sellRates() internal view returns(uint256 burnBps,uint256 ecoBps) {
        uint256 extra=activeExtraSellTaxBps();
        burnBps=totalSupply()>SUPPLY_FLOOR ? (extra==0 ? 400 : extra==600 ? 800 : 1500) : 0;
        ecoBps=extra==0 ? 100 : 300;
        assert(burnBps+ecoBps<=MAX_SELL_TAX_BPS);
    }

    function proposeEcosystemWallet(address next) external {
        _checkRoleOrAdmin(OPERATOR_ROLE);
        if (next==address(0)||next==address(this)||next==primaryPair||next==sale||next==liquidityVault) revert InvalidConfiguration();
        pendingEcosystemWallet=next;
        emit EcosystemWalletProposed(next);
    }
    function acceptEcosystemWallet() external {
        if (msg.sender!=pendingEcosystemWallet) revert InvalidConfiguration();
        address previous=ecosystemWallet;ecosystemWallet=msg.sender;pendingEcosystemWallet=address(0);
        emit EcosystemWalletChanged(previous,msg.sender);
    }
    /// @dev 超管拥有全部职责权限；其它调用者必须持有方法对应的角色。
    function _checkRoleOrAdmin(bytes32 role) internal view {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(role, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, role);
        }
    }
    function renounceRole(bytes32 role,address account) public override {
        if(role==DEFAULT_ADMIN_ROLE && !tradingOpen()) revert AdminExitBeforeLaunch();
        super.renounceRole(role,account);
    }

    function _update(address from,address to,uint256 amount) internal override {
        if(from==address(0)){super._update(from,to,amount);return;}
        bool vaultDeposit=from==liquidityVault && to==primaryPair && primaryPair!=address(0)
            && IV2LiquidityVault(liquidityVault).liquidityInProgress();
        if(vaultDeposit){super._update(from,to,amount);return;}
        if(!tradingOpen()) revert TradingClosed();
        bool buy=from==primaryPair;bool sell=to==primaryPair;
        if(buy&&sell) revert InvalidConfiguration();
        if((!buy&&!sell)||amount==0){super._update(from,to,amount);return;}
        uint256 burnBps;uint256 ecoBps;
        if(buy){burnBps=200;ecoBps=100;}else{(burnBps,ecoBps)=_sellRates();}
        uint256 fee=amount*ecoBps/10000;
        uint256 burn=amount*burnBps/10000;
        uint256 headroom=totalSupply()-SUPPLY_FLOOR;
        if(burn>headroom) burn=headroom;
        if(fee>0) super._update(from,ecosystemWallet,fee);
        if(burn>0) super._update(from,address(0),burn);
        super._update(from,to,amount-fee-burn);
        emit TransactionTax(from,to,burn,fee);
        cumulativeNetBuy+=buy ? int256(amount) : -int256(amount);
        if(cumulativeNetBuy>netBuyHighWater){
            uint256 increase=uint256(cumulativeNetBuy-netBuyHighWater);
            netBuyHighWater=cumulativeNetBuy;
            uint256 poolBurn=increase*burnMultiplier;
            headroom=totalSupply()-SUPPLY_FLOOR;
            if(poolBurn>headroom)poolBurn=headroom;
            if(poolBurn>deflationRemaining)poolBurn=deflationRemaining;
            if(poolBurn>0){deflationRemaining-=poolBurn;super._update(address(this),address(0),poolBurn);
                emit DeflationBurned(increase,poolBurn,deflationRemaining);}
        }
    }
}
interface IV2FundedSale {function initialLiquidityFunded() external view returns(bool);}
