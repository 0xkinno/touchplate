// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Phase 0 probe (S9): cost of writing one registry entry under three storage layouts.
contract LayoutProbe {
    // Layout A: the skeleton struct as first sketched (9 fields, 8 slots).
    struct EntryA {
        bytes32 pdq;
        bytes32 root;
        address author;
        uint64 touchBlock;
        uint64 revealBlock;
        bytes32 markSeedHash;
        bytes32 manifestHash;
        uint128 licensePrice;
        bool derivative;
    }
    // Layout B: repacked, only what functions read back (4 slots).
    struct EntryB {
        bytes32 pdq;
        bytes32 markSeedHash;
        address author;
        uint96 licensePrice;
        uint40 touchBlock;
        uint40 revealBlock;
        bool derivative;
    }

    mapping(bytes32 => EntryA) public a;
    mapping(bytes32 => EntryB) public b;
    // Layout C: one mapping per field (what a naive port of the fields to mappings does).
    mapping(bytes32 => bytes32) public cPdq;
    mapping(bytes32 => bytes32) public cRoot;
    mapping(bytes32 => address) public cAuthor;
    mapping(bytes32 => uint64) public cTouch;
    mapping(bytes32 => uint64) public cReveal;
    mapping(bytes32 => bytes32) public cSeed;
    mapping(bytes32 => bytes32) public cManifest;
    mapping(bytes32 => uint128) public cPrice;
    mapping(bytes32 => bool) public cDerivative;

    function writeA(bytes32 k) external {
        a[k] = EntryA(k, k, msg.sender, uint64(block.number), uint64(block.number), k, k, 12e6, false);
    }

    function writeB(bytes32 k) external {
        b[k] = EntryB(k, k, msg.sender, 12e6, uint40(block.number), uint40(block.number), false);
    }

    function writeC(bytes32 k) external {
        cPdq[k] = k;
        cRoot[k] = k;
        cAuthor[k] = msg.sender;
        cTouch[k] = uint64(block.number);
        cReveal[k] = uint64(block.number);
        cSeed[k] = k;
        cManifest[k] = k;
        cPrice[k] = 12e6;
        cDerivative[k] = true;
    }

    function readA(bytes32 k) external view returns (bytes32, address, uint64) {
        EntryA storage e = a[k];
        return (e.pdq, e.author, e.touchBlock);
    }

    function readB(bytes32 k) external view returns (bytes32, address, uint40) {
        EntryB storage e = b[k];
        return (e.pdq, e.author, e.touchBlock);
    }

    function readC(bytes32 k) external view returns (bytes32, address, uint64) {
        return (cPdq[k], cAuthor[k], cTouch[k]);
    }
}
