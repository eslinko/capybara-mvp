// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFamilyToken is IERC20 {
    function decimals() external pure returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function mint(address to, uint256 amount) external;
    function pause() external;
    function unpause() external;

    event TokensMinted(address indexed to, uint256 amount);
    event TokenPaused(address indexed by);
    event TokenUnpaused(address indexed by);
}
