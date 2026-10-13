// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Touchplate} from "../src/Touchplate.sol";

contract Deploy is Script {
    function run() external returns (Touchplate tp) {
        address a = vm.envAddress("LICENSE_TOKEN_A");
        address b = vm.envAddress("LICENSE_TOKEN_B");
        address fee = vm.envAddress("FEE_RECIPIENT");
        uint16 bps = uint16(vm.envUint("FEE_BPS"));
        vm.startBroadcast();
        tp = new Touchplate(IERC20(a), IERC20(b), fee, bps);
        vm.stopBroadcast();
    }
}
