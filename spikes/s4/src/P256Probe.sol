// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

/// Phase 0 probe: verifies WebAuthn assertions through the P-256 precompile at 0x100.
contract P256Probe {
    event Verified(address indexed caller, bool ok, bytes32 challenge);

    function verifyWebAuthn(
        bytes32 challenge,
        WebAuthn.WebAuthnAuth calldata auth,
        bytes32 qx,
        bytes32 qy
    ) external view returns (bool) {
        return WebAuthn.verify(abi.encodePacked(challenge), auth, qx, qy);
    }

    function verifyNative(bytes32 h, bytes32 r, bytes32 s, bytes32 qx, bytes32 qy) external view returns (bool) {
        return P256.verifyNative(h, r, s, qx, qy);
    }

    function verifySolidityFallback(bytes32 h, bytes32 r, bytes32 s, bytes32 qx, bytes32 qy) external view returns (bool) {
        return P256.verifySolidity(h, r, s, qx, qy);
    }

    /// State-changing variant so a real transaction records gas on chain.
    function attest(bytes32 challenge, WebAuthn.WebAuthnAuth calldata auth, bytes32 qx, bytes32 qy) external returns (bool ok) {
        ok = WebAuthn.verify(abi.encodePacked(challenge), auth, qx, qy);
        emit Verified(msg.sender, ok, challenge);
    }
}
