// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Capybara Token
 * @dev Семейный токен ERC20 с 8 знаками после запятой. Только владелец может выпускать токены и ставить контракт на паузу.
 * manifesto 💠 Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.
 */
contract CapybaraToken is ERC20, Pausable, Ownable {

    string public manifesto = "Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.";
    
    /// @notice Изначальная эмиссия токенов: 1,000,000,000 * 10^8 (с учётом десятичности)
    uint256 private constant INITIAL_SUPPLY = 88_888_888_8 * 10 ** 8;
    uint8 private constant DECIMALS = 8;

    // Добавить события
    event TokensMinted(address to, uint256 amount);
    event TokensBurned(address from, uint256 amount);

    /**
     * @dev Конструктор. Минтит начальную эмиссию и передаёт право управления отправителю.
     */
    constructor() ERC20("Capybara", "CAPY") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @notice Минт новых токенов (только для владельца)
     * @param to Кому начислять токены
     * @param amount Количество в минимальных единицах (с 8 знаками)
     */
    function mint(address to, uint256 amount) external onlyOwner whenNotPaused {
        require(to != address(0), "ERC20: mint to the zero address");
        require(amount > 0, "ERC20: mint amount must be greater than 0");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Ставит контракт на паузу (только владелец)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Снимает контракт с паузы (только владелец)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Возвращает количество десятичных знаков — 8.
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        if (to == address(0)) revert("Transfer to zero address");
        if (amount == 0) revert("Amount must be greater than 0");
        if (balanceOf(msg.sender) < amount) revert("Insufficient balance");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override whenNotPaused returns (bool) {
        if (to == address(0)) revert("Transfer to zero address");
        if (amount == 0) revert("Amount must be greater than 0");
        if (balanceOf(from) < amount) revert("Insufficient balance");
        if (allowance(from, msg.sender) < amount) revert("Insufficient allowance");
        return super.transferFrom(from, to, amount);
    }

    function approve(address spender, uint256 amount) public override whenNotPaused returns (bool) {
        if (spender == address(0)) revert("Approve to zero address");
        if (amount == 0) revert("Amount must be greater than 0");
        return super.approve(spender, amount);
    }

    /**
     * @notice Возвращает общее количество токенов в обращении
     * @return uint256 общее количество токенов
     */
    function totalSupply() public view override returns (uint256) {
        return super.totalSupply();
    }

    // Добавить механизм сжигания
    function burn(uint256 amount) external {
        if (amount == 0) revert("Amount must be greater than 0");
        if (balanceOf(msg.sender) < amount) revert("Insufficient balance");
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
}
