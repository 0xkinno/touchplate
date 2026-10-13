// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Touchplate} from "../src/Touchplate.sol";
import {Hamming} from "../src/Hamming.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract HammingHarness {
    function dist(bytes32 a, bytes32 b) external pure returns (uint256) {
        return Hamming.distance(a, b);
    }
}

abstract contract Base is Test {
    uint256 internal constant N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
    Touchplate internal tp;
    TestToken internal ausd;
    TestToken internal usdc;
    address internal feeTo = address(0xFEE);
    uint256 internal constant PK_A = 0xA11CE;
    uint256 internal constant PK_B = 0xB0B;
    address internal alice = address(0xA11CE0);
    address internal bob = address(0xB0B0);
    bytes32 internal constant ED = bytes32(uint256(0xed25519));

    function setUp() public virtual {
        ausd = new TestToken();
        usdc = new TestToken();
        tp = new Touchplate(IERC20(address(ausd)), IERC20(address(usdc)), feeTo, 100);
        vm.roll(1000);
    }

    function _auth(uint256 pk, bytes32 challenge, uint8 flags) internal view returns (WebAuthn.WebAuthnAuth memory a) {
        bytes memory authData = abi.encodePacked(bytes32(uint256(1)), flags, uint32(7));
        string memory cd = string.concat(
            '{"type":"webauthn.get","challenge":"', Base64.encodeURL(abi.encodePacked(challenge)), '","origin":"https://touchplate.app"}'
        );
        bytes32 digest = sha256(abi.encodePacked(authData, sha256(bytes(cd))));
        (bytes32 r, bytes32 s) = vm.signP256(pk, digest);
        if (uint256(s) > N / 2) s = bytes32(N - uint256(s));
        a = WebAuthn.WebAuthnAuth(r, s, 23, 1, authData, cd);
    }

    function _pub(uint256 pk) internal pure returns (bytes32 x, bytes32 y) {
        (uint256 px, uint256 py) = vm.publicKeyP256(pk);
        return (bytes32(px), bytes32(py));
    }

    function _register(address who, uint256 pk) internal {
        (bytes32 x, bytes32 y) = _pub(pk);
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_STUDIO(), block.chainid, who, x, y, ED));
        WebAuthn.WebAuthnAuth memory a = _auth(pk, ch, 0x05);
        vm.prank(who);
        tp.registerStudio(x, y, ED, a);
    }

    function _touch(address who, uint256 pk, bytes32 root, uint32 count) internal {
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_TOUCH(), block.chainid, who, root, count, tp.touchNonce(who)));
        WebAuthn.WebAuthnAuth memory a = _auth(pk, ch, 0x05);
        vm.prank(who);
        tp.touch(root, count, a);
    }

    function _leaf(bytes32 v) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(v))));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev builds a 2-leaf tree [orig, variant] for the dihedral root.
    function _dih(bytes32 orig, bytes32 variant) internal pure returns (bytes32 root) {
        root = _pair(_leaf(orig), _leaf(variant));
    }

    struct Sealed {
        bytes32 commitment;
        bytes32 root;
        bytes32[] proof;
        bytes32 pdq;
        bytes32 dih;
        bytes32 salt;
    }

    /// @dev seals one image (2-leaf touch tree with a filler leaf) and returns what reveal needs.
    function _seal(address who, uint256 pk, bytes32 pdq, bytes32 variant, bytes32 salt) internal returns (Sealed memory s) {
        s.pdq = pdq;
        s.salt = salt;
        s.dih = _dih(pdq, variant);
        s.commitment = tp.commitmentOf(who, pdq, s.dih, salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)));
        bytes32 filler = _leaf(keccak256(abi.encode("filler", salt)));
        s.root = _pair(_leaf(s.commitment), filler);
        s.proof = new bytes32[](1);
        s.proof[0] = filler;
        _touch(who, pk, s.root, 2);
    }

    function _reveal(address who, Sealed memory s, uint128 price) internal {
        vm.prank(who);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), price);
    }
}

contract TouchplateTest is Base {
    function test_registerStudio() public {
        _register(alice, PK_A);
        (,,,, bool active) = tp.studios(alice);
        assertTrue(active);
    }

    function test_registerStudio_twice_reverts() public {
        _register(alice, PK_A);
        (bytes32 x, bytes32 y) = _pub(PK_A);
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_STUDIO(), block.chainid, alice, x, y, ED));
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, ch, 0x05);
        vm.prank(alice);
        vm.expectRevert(Touchplate.AlreadyRegistered.selector);
        tp.registerStudio(x, y, ED, a);
    }

    function test_registerStudio_wrongChallenge_reverts() public {
        (bytes32 x, bytes32 y) = _pub(PK_A);
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, bytes32(uint256(9)), 0x05);
        vm.prank(alice);
        vm.expectRevert(Touchplate.BadAssertion.selector);
        tp.registerStudio(x, y, ED, a);
    }

    function test_registerStudio_noUserVerification_reverts() public {
        (bytes32 x, bytes32 y) = _pub(PK_A);
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_STUDIO(), block.chainid, alice, x, y, ED));
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, ch, 0x01);
        vm.prank(alice);
        vm.expectRevert(Touchplate.BadAssertion.selector);
        tp.registerStudio(x, y, ED, a);
    }

    function test_touch_requiresStudio() public {
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, bytes32(0), 0x05);
        vm.prank(alice);
        vm.expectRevert(Touchplate.NotStudio.selector);
        tp.touch(bytes32(uint256(1)), 1, a);
    }

    function test_touch_countZero_reverts() public {
        _register(alice, PK_A);
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, bytes32(0), 0x05);
        vm.prank(alice);
        vm.expectRevert(Touchplate.CountZero.selector);
        tp.touch(bytes32(uint256(1)), 0, a);
    }

    function test_touch_replayedAssertion_reverts() public {
        _register(alice, PK_A);
        bytes32 root = bytes32(uint256(77));
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_TOUCH(), block.chainid, alice, root, uint32(2), tp.touchNonce(alice)));
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, ch, 0x05);
        vm.prank(alice);
        tp.touch(root, 2, a);
        assertEq(tp.touchNonce(alice), 1);
        // same assertion, same root: root already touched
        vm.prank(alice);
        vm.expectRevert(Touchplate.TouchExists.selector);
        tp.touch(root, 2, a);
        // same assertion for a different root: challenge no longer matches (nonce advanced and root differs)
        vm.prank(alice);
        vm.expectRevert(Touchplate.BadAssertion.selector);
        tp.touch(bytes32(uint256(78)), 2, a);
    }

    function test_touch_assertionBoundToSender() public {
        _register(alice, PK_A);
        _register(bob, PK_A);
        bytes32 root = bytes32(uint256(5));
        bytes32 ch = keccak256(abi.encode(tp.DOMAIN_TOUCH(), block.chainid, alice, root, uint32(1), uint256(0)));
        WebAuthn.WebAuthnAuth memory a = _auth(PK_A, ch, 0x05);
        vm.prank(bob);
        vm.expectRevert(Touchplate.BadAssertion.selector);
        tp.touch(root, 1, a);
    }

    function test_reveal_happyPath() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(0xabc)), bytes32(uint256(0xdef)), bytes32(uint256(1)));
        vm.roll(block.number + 3);
        _reveal(alice, s, 12e6);
        (bytes32 pdq,,, address author, uint96 price, uint32 tb,, bool deriv) = tp.entries(s.commitment);
        assertEq(pdq, s.pdq);
        assertEq(author, alice);
        assertEq(price, 12e6);
        assertEq(tb, 1000);
        assertFalse(deriv);
        (,,, uint32 revealed) = tp.touches(s.root);
        assertEq(revealed, 1);
    }

    function test_reveal_sameBlock_tooEarly() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.prank(alice);
        vm.expectRevert(Touchplate.RevealTooEarly.selector);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), 1);
    }

    function test_reveal_tooLate() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + tp.REVEAL_WINDOW() + 1);
        vm.prank(alice);
        vm.expectRevert(Touchplate.RevealTooLate.selector);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), 1);
    }

    function test_reveal_notAuthor() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        vm.prank(bob);
        vm.expectRevert(Touchplate.NotAuthor.selector);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), 1);
    }

    function test_reveal_badProof() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        vm.prank(alice);
        vm.expectRevert(Touchplate.BadProof.selector);
        tp.reveal(s.root, s.proof, bytes32(uint256(999)), s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), 1);
    }

    function test_reveal_twice_reverts() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        _reveal(alice, s, 1);
        vm.prank(alice);
        vm.expectRevert(Touchplate.AlreadyRevealed.selector);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), 1);
    }

    function test_reveal_priceTooLarge() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        vm.prank(alice);
        vm.expectRevert(Touchplate.PriceTooLarge.selector);
        tp.reveal(s.root, s.proof, s.pdq, s.dih, s.salt, bytes32(uint256(0x5eed)), bytes32(uint256(0x3a41)), uint128(type(uint96).max) + 1);
    }

    function _thiefScenario() internal returns (Sealed memory orig, Sealed memory thief) {
        _register(alice, PK_A);
        _register(bob, PK_B);
        bytes32 origHash = bytes32(uint256(0xF0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0));
        bytes32 rotated = bytes32(uint256(0x0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F));
        orig = _seal(alice, PK_A, origHash, rotated, bytes32(uint256(11)));
        vm.roll(block.number + 5);
        // thief stole the rotated copy and flipped three bits
        thief = _seal(bob, PK_B, rotated ^ bytes32(uint256(7)), bytes32(uint256(0x1234)), bytes32(uint256(22)));
        vm.roll(block.number + 5);
        _reveal(alice, orig, 12e6);
        _reveal(bob, thief, 12e6);
    }

    function test_recordPriority_marksThiefDerivative_andBlocksLicense() public {
        (Sealed memory orig, Sealed memory thief) = _thiefScenario();
        bytes32 rotated = bytes32(uint256(0x0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(orig.pdq);
        tp.recordPriority(orig.commitment, thief.commitment, rotated, proof);
        (,,,,,,, bool deriv) = tp.entries(thief.commitment);
        assertTrue(deriv);
        ausd.mint(address(this), 100e6);
        ausd.approve(address(tp), type(uint256).max);
        vm.expectRevert(Touchplate.IsDerivative.selector);
        tp.license(thief.commitment, address(ausd), 100e6);
    }

    function test_recordPriority_errors() public {
        (Sealed memory orig, Sealed memory thief) = _thiefScenario();
        bytes32 rotated = bytes32(uint256(0x0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F0F));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(orig.pdq);
        // wrong order
        vm.expectRevert(Touchplate.NotEarlier.selector);
        tp.recordPriority(thief.commitment, orig.commitment, rotated, proof);
        // unknown entry
        vm.expectRevert(Touchplate.NotRevealed.selector);
        tp.recordPriority(bytes32(uint256(1)), thief.commitment, rotated, proof);
        // variant not in the committed set
        vm.expectRevert(Touchplate.BadProof.selector);
        tp.recordPriority(orig.commitment, thief.commitment, bytes32(uint256(5)), proof);
        // same author
        vm.expectRevert(Touchplate.NotMatched.selector);
        tp.recordPriority(orig.commitment, orig.commitment, rotated, proof);
    }

    function test_recordPriority_farHash_notMatched() public {
        _register(alice, PK_A);
        _register(bob, PK_B);
        bytes32 a = bytes32(type(uint256).max);
        Sealed memory o = _seal(alice, PK_A, a, bytes32(uint256(3)), bytes32(uint256(1)));
        vm.roll(block.number + 3);
        Sealed memory t = _seal(bob, PK_B, bytes32(0), bytes32(uint256(4)), bytes32(uint256(2)));
        vm.roll(block.number + 3);
        _reveal(alice, o, 1);
        _reveal(bob, t, 1);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(bytes32(uint256(3)));
        vm.expectRevert(Touchplate.NotMatched.selector);
        tp.recordPriority(o.commitment, t.commitment, a, proof);
    }

    function test_recordPriority_sameBlock_reverts() public {
        _register(alice, PK_A);
        _register(bob, PK_B);
        Sealed memory o = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        Sealed memory t = _seal(bob, PK_B, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(2)));
        vm.roll(block.number + 3);
        _reveal(alice, o, 1);
        _reveal(bob, t, 1);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(bytes32(uint256(2)));
        vm.expectRevert(Touchplate.SameBlock.selector);
        tp.recordPriority(o.commitment, t.commitment, bytes32(uint256(1)), proof);
    }

    function test_proveMark() public {
        _register(alice, PK_A);
        bytes32 seed = bytes32(uint256(0x5eed));
        // markSeedHash in helper is a fixed constant; craft an entry whose hash equals keccak(abi.encode(seed))
        bytes32 msh = keccak256(abi.encode(seed));
        bytes32 pdq = bytes32(uint256(1));
        bytes32 dih = _dih(pdq, bytes32(uint256(2)));
        bytes32 commitment = tp.commitmentOf(alice, pdq, dih, bytes32(uint256(1)), msh, bytes32(uint256(3)));
        bytes32 filler = _leaf(bytes32(uint256(99)));
        bytes32 root = _pair(_leaf(commitment), filler);
        _touch(alice, PK_A, root, 2);
        vm.roll(block.number + 2);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = filler;
        vm.prank(alice);
        tp.reveal(root, proof, pdq, dih, bytes32(uint256(1)), msh, bytes32(uint256(3)), 5);
        vm.prank(alice);
        tp.proveMark(commitment, bytes32(uint256(8)), seed, 12_000, "ipfs://x");
        vm.prank(alice);
        vm.expectRevert(Touchplate.SeedMismatch.selector);
        tp.proveMark(commitment, bytes32(uint256(8)), bytes32(uint256(1)), 1, "");
        vm.prank(bob);
        vm.expectRevert(Touchplate.NotAuthor.selector);
        tp.proveMark(commitment, bytes32(uint256(8)), seed, 1, "");
    }

    function test_license_paysAuthorAndFee_bothTokens() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        _reveal(alice, s, 100e6);
        ausd.mint(bob, 100e6);
        usdc.mint(bob, 100e6);
        vm.startPrank(bob);
        ausd.approve(address(tp), type(uint256).max);
        usdc.approve(address(tp), type(uint256).max);
        tp.license(s.commitment, address(ausd), 100e6);
        tp.license(s.commitment, address(usdc), 100e6);
        vm.stopPrank();
        assertEq(ausd.balanceOf(alice), 99e6);
        assertEq(ausd.balanceOf(feeTo), 1e6);
        assertEq(usdc.balanceOf(alice), 99e6);
    }

    function test_license_errors() public {
        _register(alice, PK_A);
        Sealed memory s = _seal(alice, PK_A, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(1)));
        vm.roll(block.number + 2);
        _reveal(alice, s, 100e6);
        vm.expectRevert(Touchplate.TokenNotAllowed.selector);
        tp.license(s.commitment, address(0xdead), 100e6);
        vm.expectRevert(Touchplate.NotRevealed.selector);
        tp.license(bytes32(uint256(1)), address(ausd), 100e6);
        vm.expectRevert(Touchplate.PriceAboveMax.selector);
        tp.license(s.commitment, address(ausd), 99e6);
    }

    function test_constructor_feeCap() public {
        vm.expectRevert(Touchplate.FeeTooHigh.selector);
        new Touchplate(IERC20(address(ausd)), IERC20(address(usdc)), feeTo, 301);
    }

    function test_realPasskeyAssertion_fixture() public view {
        // Assertion captured from a real WebAuthn ceremony in spike S3 (challenge is a bare bytes32).
        bytes32 qx = 0x605365188b9f80a4a1c27bf2225ef07668dcb4fcc6cffc45d2f61ced6b1414f0;
        bytes32 qy = 0x91880b91be01d79cc586525ebbca9f50120a020c621b94a92f96139c16054c9b;
        bytes32 challenge = 0x241e6e0c0b38550bab97e7aa73d44bccf23c55858c5fbc8720e4a70aac21b00a;
        WebAuthn.WebAuthnAuth memory a = WebAuthn.WebAuthnAuth({
            r: 0x48cad5a974e3edc96e3d5a83ab96ff93bedc93d915ab257e4fb883e13151dacd,
            s: 0x3c144350a58d2f867ee33488c00b5617bfc5f231f1d5161b6e3e53550e648b90,
            challengeIndex: 23,
            typeIndex: 1,
            authenticatorData: hex"49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000003",
            clientDataJSON: '{"type":"webauthn.get","challenge":"JB5uDAs4VQurl-eqc9RLzPI8VYWMX7yHIOSnCqwhsAo","origin":"http://localhost:4173","crossOrigin":false}'
        });
        assertTrue(WebAuthn.verify(abi.encodePacked(challenge), a, qx, qy));
        a.r = bytes32(uint256(a.r) ^ 1);
        assertFalse(WebAuthn.verify(abi.encodePacked(challenge), a, qx, qy));
    }
}

contract HammingTest is Test {
    HammingHarness internal h = new HammingHarness();

    function _naive(bytes32 a, bytes32 b) internal pure returns (uint256 c) {
        uint256 x = uint256(a ^ b);
        for (uint256 i = 0; i < 256; i++) {
            c += (x >> i) & 1;
        }
    }

    function testFuzz_matchesNaive(bytes32 a, bytes32 b) public view {
        assertEq(h.dist(a, b), _naive(a, b));
    }

    function test_extremes() public view {
        assertEq(h.dist(bytes32(0), bytes32(type(uint256).max)), 256);
        assertEq(h.dist(bytes32(uint256(5)), bytes32(uint256(5))), 0);
    }
}

/// @dev Invariant handler: random sequences of seal/reveal/record/license by two studios.
contract Handler is Base {
    mapping(bytes32 => uint32) public firstTouchBlock;
    bytes32[] public commitments;
    uint256 internal salt;
    bool public paidDerivative;

    function init() external {
        setUp();
        _register(alice, PK_A);
        _register(bob, PK_B);
        ausd.mint(address(this), type(uint96).max);
        ausd.approve(address(tp), type(uint256).max);
    }

    function step(uint8 who, uint256 pdqSeed) external {
        address a = who % 2 == 0 ? alice : bob;
        uint256 pk = who % 2 == 0 ? PK_A : PK_B;
        salt++;
        vm.roll(block.number + 1);
        Sealed memory s = _seal(a, pk, bytes32(pdqSeed % 4), bytes32(pdqSeed % 4), bytes32(salt));
        vm.roll(block.number + 1);
        _reveal(a, s, 1e6);
        firstTouchBlock[s.commitment] = uint32(block.number - 1);
        commitments.push(s.commitment);
    }

    function link(uint256 i, uint256 j) external {
        if (commitments.length < 2) return;
        bytes32 e = commitments[i % commitments.length];
        bytes32 l = commitments[j % commitments.length];
        (bytes32 epdq,,,,,,,) = tp.entries(e);
        (bytes32 lpdq,,,,,,,) = tp.entries(l);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(epdq);
        // variant is the second leaf, which equals pdq in this handler, so proof for variant needs the sibling leaf
        try tp.recordPriority(e, l, lpdq, proof) {} catch {}
    }

    function pay(uint256 i) external {
        if (commitments.length == 0) return;
        bytes32 c = commitments[i % commitments.length];
        (,,,,,,, bool deriv) = tp.entries(c);
        try tp.license(c, address(ausd), 1e6) {
            if (deriv) paidDerivative = true;
        } catch {}
    }

    function registry() external view returns (Touchplate) {
        return tp;
    }

    function count() external view returns (uint256) {
        return commitments.length;
    }
}

contract TouchplateInvariants is Test {
    Handler internal handler;

    function setUp() public {
        handler = new Handler();
        handler.init();
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](3);
        sel[0] = Handler.step.selector;
        sel[1] = Handler.link.selector;
        sel[2] = Handler.pay.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function invariant_touchBlockNeverChanges() public view {
        Touchplate tp = handler.registry();
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; i++) {
            bytes32 c = handler.commitments(i);
            (,,,,, uint32 tb,,) = tp.entries(c);
            assertEq(tb, handler.firstTouchBlock(c));
        }
    }

    function invariant_licenseNeverPaysDerivative() public view {
        assertFalse(handler.paidDerivative());
    }

    function invariant_derivativeImpliesEarlierOtherAuthor() public view {
        Touchplate tp = handler.registry();
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; i++) {
            (,,, address author,, uint32 tb,, bool deriv) = tp.entries(handler.commitments(i));
            if (!deriv) continue;
            bool found;
            for (uint256 j = 0; j < n; j++) {
                (,,, address a2,, uint32 tb2,,) = tp.entries(handler.commitments(j));
                if (a2 != author && tb2 < tb) found = true;
            }
            assertTrue(found);
        }
    }
}
