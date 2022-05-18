//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint) external;
}

// This contract simply calls multiple targets sequentially, ensuring WETH balance before and after
contract FlashBotsMultiCall {
    IWETH private constant WETH = IWETH(0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6);
    IERC20 private constant WETH_ERC20 = IWETH(0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6);
    IERC20 private constant TREV = IERC20(0x6dC371370Be6bc66a5bD752e59d78CCB869F3cfD);

    constructor() public payable {
    }

    fallback() external payable {}

    receive() external payable {}

    function uniswapWeth(uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) external payable {
        require (_targets.length == _payloads.length, 'lengths do not match');
        
        WETH.deposit{value: msg.value}();
        uint256 _wethBalanceBefore = WETH.balanceOf(address(this));
        
        if (_targets.length > 0) {
            WETH.transfer(_targets[0], _wethBalanceBefore);
        }
        for (uint256 i = 0; i < _targets.length; i++) {
            (bool _success, bytes memory _response) = _targets[i].call(_payloads[i]);
            require(_success, 'call failed'); _response;
        }

        uint256 _wethBalanceAfter = WETH.balanceOf(address(this));
        // require(_wethBalanceAfter >= _wethBalanceBefore + _ethAmountToCoinbase, 'weth did not increase');

        if (_wethBalanceAfter > 0) {
            WETH.withdraw(_wethBalanceAfter);
            msg.sender.transfer(_wethBalanceAfter - _ethAmountToCoinbase);
        }

        if (_ethAmountToCoinbase == 0) return;            
        block.coinbase.transfer(_ethAmountToCoinbase);
    }
}