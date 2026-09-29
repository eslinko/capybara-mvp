// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/ICapybaraToken.sol";
import "./interfaces/IFamilyToken.sol";
import "./interfaces/IInviteNFT.sol";
import "./FamilyToken.sol";

contract CapybaraFactory is Ownable, Pausable {
    ICapybaraToken public capybaraToken;
    IInviteNFT public inviteNFT;
    uint256 public welcomeAmount = 888 * 10**8; // 888 CAPYBARA
    uint256 public constant MAX_NAME_LENGTH = 32;
    uint256 public constant MAX_SYMBOL_LENGTH = 10;

    mapping(address => address) public familyTokens; // user => token
    mapping(address => bool) public hasReceivedWelcome; // user => received
    mapping(uint256 => bool) public usedInvites; // tokenId => used
    mapping(address => uint256) public usedInviteByUser; // user => usedInviteId

    event FamilyTokenCreated(address indexed owner, address indexed token);
    event WelcomeTokensSent(address indexed user, uint256 amount);
    event FactoryPaused(address indexed by);
    event FactoryUnpaused(address indexed by);
    event CapybaraAddressSet(address indexed newAddress);
    event InviteNFTAddressSet(address indexed newAddress);
    event WelcomeAmountSet(uint256 newAmount);
    event DebugTokenCreation(address creator, string step, address value);
    event InviteUsed(uint256 indexed tokenId, address indexed user);

    constructor(address _capybaraToken, address _inviteNFT) {
        require(_capybaraToken != address(0), "Invalid CAPYBARA token address");
        require(_inviteNFT != address(0), "Invalid Invite NFT address");
        capybaraToken = ICapybaraToken(_capybaraToken);
        inviteNFT = IInviteNFT(_inviteNFT);
        welcomeAmount = 888 * 10**8; // 888 CAPYBARA
    }

    function createFamilyToken(
        string memory name,
        string memory symbol
    ) external whenNotPaused returns (address) {
        emit DebugTokenCreation(msg.sender, "Start creation - msg.sender", msg.sender);
        
        // Проверяем наличие Invite NFT
        require(inviteNFT.hasInvite(msg.sender), "No Invite NFT found");
        
        // Получаем ID первого Invite NFT
        uint256 inviteId = inviteNFT.getFirstInviteId(msg.sender);
        require(inviteNFT.ownerOf(inviteId) == msg.sender, "No valid Invite NFT found");
        
        // Проверяем, что пользователь еще не использовал инвайт
        require(usedInviteByUser[msg.sender] == 0, "User already used an invite");
        
        // Проверяем, что Invite NFT не был использован
        require(!usedInvites[inviteId], "Invite NFT already used");
        
        // Проверяем, что семейный токен еще не существует
        require(familyTokens[msg.sender] == address(0), "Family token already exists");
        
        // Создаем новый токен
        FamilyToken newToken = new FamilyToken(name, symbol, msg.sender);
        address tokenAddress = address(newToken);
        
        emit DebugTokenCreation(msg.sender, "After creation - token address", tokenAddress);
        
        // Проверяем владельца токена
        address tokenOwner = newToken.owner();
        emit DebugTokenCreation(msg.sender, "Token owner", tokenOwner);
        require(tokenOwner == msg.sender, "Token owner mismatch");
        
        // Проверяем баланс токена у владельца
        uint256 ownerBalance = newToken.balanceOf(msg.sender);
        emit DebugTokenCreation(msg.sender, "Owner balance", msg.sender);
        require(ownerBalance == 88888 * 10**8, "Initial balance not set correctly");
        
        familyTokens[msg.sender] = tokenAddress;
        usedInvites[inviteId] = true;
        usedInviteByUser[msg.sender] = inviteId;
        
        // Обновляем статус инвайта в контракте InviteNFT
        inviteNFT.setInviteUsed(inviteId, msg.sender);
        
        emit FamilyTokenCreated(msg.sender, tokenAddress);
        emit InviteUsed(inviteId, msg.sender);
        
        if (!hasReceivedWelcome[msg.sender]) {
            require(
                capybaraToken.balanceOf(address(this)) >= welcomeAmount,
                "Insufficient welcome tokens"
            );
            require(
                capybaraToken.transfer(msg.sender, welcomeAmount),
                "Welcome tokens transfer failed"
            );
            hasReceivedWelcome[msg.sender] = true;
            emit WelcomeTokensSent(msg.sender, welcomeAmount);
        }
        
        return tokenAddress;
    }

    function getFamilyToken(address user) external view returns (address) {
        require(user != address(0), "Invalid user address");
        return familyTokens[user];
    }

    function setCapybaraToken(address _capybaraToken) external onlyOwner {
        require(_capybaraToken != address(0), "Invalid CAPYBARA token address");
        capybaraToken = ICapybaraToken(_capybaraToken);
        emit CapybaraAddressSet(_capybaraToken);
    }

    function setWelcomeAmount(uint256 _welcomeAmount) external onlyOwner {
        welcomeAmount = _welcomeAmount;
        emit WelcomeAmountSet(_welcomeAmount);
    }

    function setInviteNFT(address _inviteNFT) external onlyOwner {
        require(_inviteNFT != address(0), "Invalid Invite NFT address");
        inviteNFT = IInviteNFT(_inviteNFT);
        emit InviteNFTAddressSet(_inviteNFT);
    }

    function pause() external onlyOwner {
        _pause();
        emit FactoryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit FactoryUnpaused(msg.sender);
    }

    function withdrawCapybara(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(capybaraToken.transfer(owner(), amount), "Transfer failed");
    }
}
