// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFamilyToken.sol";


/**
 * @title FamilyToken
 * @dev Семейный токен ERC20 с 8 знаками после запятой. Только владелец может выпускать токены и ставить контракт на паузу.
 * manifesto 💠 Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.
 */
contract FamilyToken is ERC20, Pausable, Ownable, IFamilyToken {

    string public manifesto = "Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.";

    uint8 private constant _DECIMALS = 8;
    uint256 private MAX_MINT_AMOUNT = 1000000 * 10**8; // Максимальная эмиссия

    event InitialMintCompleted(address owner, uint256 amount);
    event DebugMint(address to, uint256 amount, string message);
    event TokensBurned(address owner, uint256 amount);
    event AddressBlacklisted(address account);
    event MaxMintAmountUpdated(uint256 newMaxAmount);
    event TokensLocked(address account, uint256 duration);

    mapping(address => bool) private _blacklisted;
    mapping(address => uint256) private _lockedUntil;

    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        
        // Устанавливаем владельца
        _transferOwnership(initialOwner);
        
        // Минтим сразу на initialOwner
        _mint(initialOwner, 88888 * 10**_DECIMALS);
        
        // Логируем данные перед минтом
        emit DebugMint(initialOwner, 88888 * 10**_DECIMALS, "Before initial mint");
        
        // Логируем успешный минт
        emit InitialMintCompleted(initialOwner, 88888 * 10**_DECIMALS);
        
        // Проверяем баланс после минта
        uint256 balance = balanceOf(initialOwner);
        emit DebugMint(initialOwner, balance, "After initial mint balance check");
    }

    function decimals() public pure override(ERC20, IFamilyToken) returns (uint8) {
        return _DECIMALS;
    }

    function transfer(address to, uint256 amount) public override(ERC20, IFamilyToken) whenNotPaused returns (bool) {
        require(to != address(0), "Transfer to zero address");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override(ERC20, IFamilyToken) whenNotPaused returns (bool) {
        require(to != address(0), "Transfer to zero address");
        return super.transferFrom(from, to, amount);
    }

    function balanceOf(address account) public view override(ERC20, IFamilyToken) returns (uint256) {
        return super.balanceOf(account);
    }

    function approve(address spender, uint256 amount) public override(ERC20, IFamilyToken) whenNotPaused returns (bool) {
        require(spender != address(0), "Approve to zero address");
        return super.approve(spender, amount);
    }

    function allowance(address owner, address spender) public view override(ERC20, IFamilyToken) returns (uint256) {
        return super.allowance(owner, spender);
    }

    function mint(address to, uint256 amount) external override onlyOwner whenNotPaused {
        require(to != address(0), "Mint to zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(totalSupply() + amount <= MAX_MINT_AMOUNT, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function pause() external override onlyOwner {
        _pause();
        emit TokenPaused(msg.sender);
    }

    function unpause() external override onlyOwner {
        _unpause();
        emit TokenUnpaused(msg.sender);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    function blacklist(address account) external onlyOwner {
        _blacklisted[account] = true;
        emit AddressBlacklisted(account);
    }

    function updateMaxMintAmount(uint256 newMaxAmount) external onlyOwner {
        require(newMaxAmount > totalSupply(), "New max amount must be greater than current supply");
        MAX_MINT_AMOUNT = newMaxAmount;
        emit MaxMintAmountUpdated(newMaxAmount);
    }

    function lockTokens(address account, uint256 duration) external onlyOwner {
        _lockedUntil[account] = block.timestamp + duration;
        emit TokensLocked(account, duration);
    }
}
