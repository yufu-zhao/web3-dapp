// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFRCV2} from "./V2Interfaces.sol";

/// @notice Independent, non-yielding custody of FRC with user-selected durations in seconds.
/// No administrator, upgrade, early exit, transfer of ownership, rescue, or discretionary withdrawal.
contract FRCTimeLock is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable token;
    struct Position {
        address owner;
        uint256 amount;
        uint64 createdAt;
        uint64 unlockTime;
        bool claimed;
    }
    Position[] public positions;
    mapping(address=>uint256[]) public ownerPositions;
    uint256 public totalLocked;
    error InvalidConfiguration();
    error InvalidAmount();
    error InvalidDuration();
    error TradingClosed();
    error PaymentMismatch();
    error InvalidPosition();
    error Unauthorized();
    error NotMature();
    error AlreadyClaimed();
    event Locked(uint256 indexed id,address indexed owner,uint256 amount,uint256 duration,uint256 createdAt,uint256 unlockTime);
    event Claimed(uint256 indexed id,address indexed owner,uint256 amount);

    constructor(address token_){
        if(token_.code.length==0||IERC20Metadata(token_).decimals()!=18)revert InvalidConfiguration();
        // Ensure the configured asset exposes the FRC trading gate; deployment may precede opening.
        IFRCV2(token_).tradingOpen();
        token=token_;
    }
    function positionCount() external view returns(uint256){return positions.length;}
    function ownerPositionCount(address owner) external view returns(uint256){return ownerPositions[owner].length;}
    /// @param duration Positive seconds, not days and not an absolute timestamp.
    function lock(uint256 amount,uint256 duration) external nonReentrant returns(uint256 id){
        if(!IFRCV2(token).tradingOpen())revert TradingClosed();
        if(amount==0)revert InvalidAmount();
        if(block.timestamp>type(uint64).max||duration==0||duration>type(uint64).max-block.timestamp)revert InvalidDuration();
        id=positions.length;
        uint256 unlockTime=block.timestamp+duration;
        positions.push(Position(msg.sender,amount,uint64(block.timestamp),uint64(unlockTime),false));
        ownerPositions[msg.sender].push(id);totalLocked+=amount;
        uint256 beforeBalance=IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender,address(this),amount);
        if(IERC20(token).balanceOf(address(this))-beforeBalance!=amount)revert PaymentMismatch();
        emit Locked(id,msg.sender,amount,duration,block.timestamp,unlockTime);
    }
    function claimable(uint256 id) external view returns(uint256){
        if(id>=positions.length)return 0;
        Position memory p=positions[id];
        return !p.claimed&&block.timestamp>=p.unlockTime?p.amount:0;
    }
    function claim(uint256 id) external nonReentrant {
        if(id>=positions.length)revert InvalidPosition();
        Position storage p=positions[id];
        if(p.owner!=msg.sender)revert Unauthorized();
        if(p.claimed)revert AlreadyClaimed();
        if(block.timestamp<p.unlockTime)revert NotMature();
        p.claimed=true;totalLocked-=p.amount;
        IERC20(token).safeTransfer(p.owner,p.amount);
        emit Claimed(id,p.owner,p.amount);
    }
}
