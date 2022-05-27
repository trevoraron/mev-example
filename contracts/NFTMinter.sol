//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

interface IMintable {
    function safeMint(address to) external;
}

// This contract simply calls mint in a loop
contract NFTMinter {
    function mintBlock(uint amountToMint, address _target) external payable {
        IMintable minter = IMintable(_target);
        for (uint256 i = 0; i < amountToMint; i++) {
            minter.safeMint(msg.sender);
        }

        // send the bribe
        block.coinbase.transfer(msg.value);
    }
}