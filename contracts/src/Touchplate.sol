// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Hamming} from "./Hamming.sol";

/// @title Touchplate
/// @notice Passkey-sealed, finality-gated provenance registry. No admin over priority or entries.
contract Touchplate {
    using SafeERC20 for IERC20;

    bytes32 public constant DOMAIN_STUDIO = keccak256("touchplate.studio.v1");
    bytes32 public constant DOMAIN_TOUCH = keccak256("touchplate.touch.v1");
    bytes32 public constant DOMAIN_ENTRY = keccak256("touchplate.entry.v1");
    /// @dev about 7 days at the measured 0.304 s block interval.
    uint256 public constant REVEAL_WINDOW = 2_000_000;
    uint256 public constant MATCH_THRESHOLD = 31;
    uint16 public constant MAX_FEE_BPS = 300;

    struct Studio {
        bytes32 qx;
        bytes32 qy;
        bytes32 ed25519Pub;
        uint64 registeredAt;
        bool active;
    }

    struct Touch {
        address author;
        uint32 blockNumber;
        uint32 count;
        uint32 revealed;
    }

    /// @dev five slots in one storage page (measured in spike S9).
    struct Entry {
        bytes32 pdq;
        bytes32 dihedralRoot;
        bytes32 markSeedHash;
        address author;
        uint96 licensePrice;
        uint32 touchBlock;
        uint32 revealBlock;
        bool derivative;
    }

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;

    mapping(address => Studio) public studios;
    mapping(address => uint256) public touchNonce;
    mapping(bytes32 => Touch) public touches;
    mapping(bytes32 => Entry) public entries;

    event StudioRegistered(address indexed author, bytes32 qx, bytes32 qy, bytes32 ed25519Pub);
    event Touched(bytes32 indexed root, address indexed author, uint32 count, uint256 nonce);
    event Revealed(
        bytes32 indexed commitment,
        bytes32 indexed root,
        address indexed author,
        bytes32 pdq,
        bytes32 dihedralRoot,
        uint32 touchBlock,
        bytes32 markSeedHash,
        bytes32 manifestHash,
        uint96 licensePrice
    );
    event PriorityRecorded(bytes32 indexed earlier, bytes32 indexed later, uint256 distance);
    event MarkProven(bytes32 indexed commitment, bytes32 suspectSha256, bytes32 seed, uint32 zMilli, string uri);
    event Licensed(
        bytes32 indexed commitment,
        address indexed licensee,
        address indexed author,
        address token,
        uint256 paid,
        uint256 fee
    );

    error NotStudio();
    error AlreadyRegistered();
    error BadAssertion();
    error TouchExists();
    error NotAuthor();
    error RevealTooEarly();
    error RevealTooLate();
    error BadProof();
    error AlreadyRevealed();
    error NotRevealed();
    error NotMatched();
    error NotEarlier();
    error SameBlock();
    error SeedMismatch();
    error IsDerivative();
    error PriceAboveMax();
    error TokenNotAllowed();
    error FeeTooHigh();
    error CountZero();
    error PriceTooLarge();

    constructor(IERC20 a, IERC20 b, address feeRecipient_, uint16 feeBps_) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        tokenA = a;
        tokenB = b;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    function registerStudio(bytes32 qx, bytes32 qy, bytes32 ed25519Pub, WebAuthn.WebAuthnAuth calldata auth) external {
        if (studios[msg.sender].active) revert AlreadyRegistered();
        bytes32 challenge = keccak256(abi.encode(DOMAIN_STUDIO, block.chainid, msg.sender, qx, qy, ed25519Pub));
        if (!WebAuthn.verify(abi.encodePacked(challenge), auth, qx, qy)) revert BadAssertion();
        studios[msg.sender] = Studio(qx, qy, ed25519Pub, uint64(block.timestamp), true);
        emit StudioRegistered(msg.sender, qx, qy, ed25519Pub);
    }

    function touch(bytes32 root, uint32 count, WebAuthn.WebAuthnAuth calldata auth) external {
        Studio storage s = studios[msg.sender];
        if (!s.active) revert NotStudio();
        if (count == 0) revert CountZero();
        if (touches[root].author != address(0)) revert TouchExists();
        uint256 nonce = touchNonce[msg.sender];
        bytes32 challenge = keccak256(abi.encode(DOMAIN_TOUCH, block.chainid, msg.sender, root, count, nonce));
        if (!WebAuthn.verify(abi.encodePacked(challenge), auth, s.qx, s.qy)) revert BadAssertion();
        touchNonce[msg.sender] = nonce + 1;
        touches[root] = Touch(msg.sender, uint32(block.number), count, 0);
        emit Touched(root, msg.sender, count, nonce);
    }

    function commitmentOf(
        address author,
        bytes32 pdq,
        bytes32 dihedralRoot,
        bytes32 salt,
        bytes32 markSeedHash,
        bytes32 manifestHash
    ) public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_ENTRY, block.chainid, author, pdq, dihedralRoot, salt, markSeedHash, manifestHash));
    }

    function reveal(
        bytes32 root,
        bytes32[] calldata proof,
        bytes32 pdq,
        bytes32 dihedralRoot,
        bytes32 salt,
        bytes32 markSeedHash,
        bytes32 manifestHash,
        uint128 licensePrice
    ) external {
        Touch storage t = touches[root];
        if (t.author != msg.sender) revert NotAuthor();
        if (block.number <= t.blockNumber) revert RevealTooEarly();
        if (block.number > uint256(t.blockNumber) + REVEAL_WINDOW) revert RevealTooLate();
        if (licensePrice > type(uint96).max) revert PriceTooLarge();
        bytes32 commitment = commitmentOf(msg.sender, pdq, dihedralRoot, salt, markSeedHash, manifestHash);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(commitment))));
        if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert BadProof();
        if (entries[commitment].author != address(0)) revert AlreadyRevealed();
        entries[commitment] = Entry(
            pdq, dihedralRoot, markSeedHash, msg.sender, uint96(licensePrice), t.blockNumber, uint32(block.number), false
        );
        t.revealed += 1;
        emit Revealed(
            commitment, root, msg.sender, pdq, dihedralRoot, t.blockNumber, markSeedHash, manifestHash, uint96(licensePrice)
        );
    }

    /// @notice Permissionless. `variant` is one of the earlier entry's committed dihedral hashes.
    function recordPriority(bytes32 earlier, bytes32 later, bytes32 variant, bytes32[] calldata proof) external {
        Entry storage e = entries[earlier];
        Entry storage l = entries[later];
        if (e.author == address(0) || l.author == address(0)) revert NotRevealed();
        if (e.author == l.author) revert NotMatched();
        if (l.derivative) revert IsDerivative();
        if (e.touchBlock == l.touchBlock) revert SameBlock();
        if (e.touchBlock > l.touchBlock) revert NotEarlier();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(variant))));
        if (!MerkleProof.verifyCalldata(proof, e.dihedralRoot, leaf)) revert BadProof();
        uint256 d = Hamming.distance(variant, l.pdq);
        if (d > MATCH_THRESHOLD) revert NotMatched();
        l.derivative = true;
        emit PriorityRecorded(earlier, later, d);
    }

    function proveMark(bytes32 commitment, bytes32 suspectSha256, bytes32 seed, uint32 zMilli, string calldata uri)
        external
    {
        Entry storage e = entries[commitment];
        if (e.author != msg.sender) revert NotAuthor();
        if (keccak256(abi.encode(seed)) != e.markSeedHash) revert SeedMismatch();
        emit MarkProven(commitment, suspectSha256, seed, zMilli, uri);
    }

    function license(bytes32 commitment, address token, uint256 maxPrice) external {
        if (token != address(tokenA) && token != address(tokenB)) revert TokenNotAllowed();
        Entry storage e = entries[commitment];
        if (e.author == address(0)) revert NotRevealed();
        if (e.derivative) revert IsDerivative();
        uint256 price = e.licensePrice;
        if (price > maxPrice) revert PriceAboveMax();
        uint256 fee = (price * feeBps) / 10_000;
        IERC20 t = IERC20(token);
        t.safeTransferFrom(msg.sender, e.author, price - fee);
        if (fee > 0) t.safeTransferFrom(msg.sender, feeRecipient, fee);
        emit Licensed(commitment, msg.sender, e.author, token, price, fee);
    }
}
