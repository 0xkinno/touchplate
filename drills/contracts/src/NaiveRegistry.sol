// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Deliberately naive registry used only by drill D5. The fingerprint is revealed in the claiming transaction.
contract NaiveRegistry {
    mapping(bytes32 => address) public first;
    mapping(bytes32 => uint256) public firstBlock;

    event Claimed(bytes32 indexed pdq, address indexed claimer);

    function claim(bytes32 pdq) external {
        if (first[pdq] == address(0)) {
            first[pdq] = msg.sender;
            firstBlock[pdq] = block.number;
        }
        emit Claimed(pdq, msg.sender);
    }
}
