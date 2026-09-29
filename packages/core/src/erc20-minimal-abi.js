'use strict';

/** Minimal ERC20 ABI for $CAPY — no Hardhat artifact required. */
const MINIMAL_ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

module.exports = { MINIMAL_ERC20_ABI };
