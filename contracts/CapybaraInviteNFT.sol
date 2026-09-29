// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title Capybara Invite NFT
 * @dev NFT контракт для семейного токена Capybara
 * manifesto 💠 Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.
 */
contract CapybaraInviteNFT is ERC721, Pausable, AccessControl {

    string public manifesto = "Money takes a new form. The flow is open. This token resonates with the shift in value transmission. Holding or transferring this token embeds you in a new energetic economy.";
    
    using Counters for Counters.Counter;
    
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    Counters.Counter private _tokenIdCounter;
    
    // Маппинги для отслеживания передач
    mapping(uint256 => bool) public isTransferred;
    mapping(uint256 => address) public transferHistory;
    mapping(address => uint256[]) public userTransfers;
    
    // Маппинг для отслеживания использованных инвайтов
    mapping(uint256 => bool) public isInviteUsed;
    mapping(address => uint256) public usedInviteByUser;
    
    // Счетчики передач
    mapping(uint256 => uint256) public transferCount;
    uint256 public totalTransfers;
    
    // Маппинг для хранения типов NFT
    mapping(uint256 => uint8) public nftTypes;
    
    // Константы для типов NFT
    uint8 public constant TYPE_SAGE = 1;      // Мудрец
    uint8 public constant TYPE_GARDENER = 2;  // Садовник
    uint8 public constant TYPE_ARTIST = 3;    // Художник
    uint8 public constant TYPE_CHEF = 4;      // Повар
    uint8 public constant TYPE_EXPLORER = 5;  // Исследователь
    uint8 public constant TYPE_MUSICIAN = 6;  // Музыкант
    uint8 public constant TYPE_ARCHITECT = 7; // Архитектор
    uint8 public constant TYPE_ATHLETE = 8;   // Атлет

    // Максимальное количество типов NFT
    uint8 public constant MAX_NFT_TYPES = 8;
    
    uint256 public constant TOTAL_SUPPLY = 8888;
    uint256 public constant NFT_PER_TYPE = 1111;
    uint256 public constant SET_SIZE = 8;
    
    // Счетчики для каждого типа
    mapping(uint8 => uint256) public typeCounter;
    
    // Структура для хранения атрибутов NFT
    struct NFTAttributes {
        uint8 nftType;        // NFT type (1-8)
        uint8 wisdom;         // Wisdom (1-10)
        uint8 creativity;     // Creativity (1-10)
        uint8 sociability;    // Sociability (1-10)
        uint8 curiosity;      // Curiosity (1-10)
        uint8 empathy;        // Empathy (1-10)
        uint8 determination;  // Determination (1-10)
        uint8 adaptability;   // Adaptability (1-10)
        uint8 leadership;     // Leadership (1-10)
        uint256 creationDate; // Creation date
        bytes traits;         // Additional traits
    }
    
    // Маппинг для хранения атрибутов
    mapping(uint256 => NFTAttributes) public nftAttributes;
    
    // Структура для базовых атрибутов роли
    struct RoleAttributes {
        uint8 wisdom;      // Мудрость
        uint8 creativity;  // Креативность
        uint8 sociability; // Общительность
        uint8 curiosity;   // Любознательность
        uint8 empathy;     // Эмпатия
        uint8 determination; // Решительность
        uint8 adaptability; // Адаптивность
        uint8 leadership;  // Лидерство
    }
    
    // Маппинг для хранения атрибутов ролей
    mapping(string => RoleAttributes) public roleAttributes;
    
    // Mapping from role type to character name
    mapping(uint8 => string) public roleToCharacter;
    
    // Mapping for individual token URIs (IPFS json)
    mapping(uint256 => string) public tokenURIs;
    
    // Добавляем структуру для статуса минтинга
    struct MintStatus {
        uint256 totalMinted;
        uint256 totalSets;
        uint256 currentSet;
        bool isInitialized;
        bool isPaused;
        mapping(uint8 => uint256) typeCounts;
    }
    
    // Добавляем маппинг для хранения статуса минтинга
    mapping(address => MintStatus) private mintStatus;
    
    // События
    event NFTTypeSet(uint256 indexed tokenId, uint8 nftType);
    event NFTTransferred(uint256 indexed tokenId, address from, address to, uint256 transferNumber);
    event SetTransferred(address indexed to, uint256[] tokenIds, uint256 transferNumber);
    event InitialMintCompleted(uint256 totalSupply);
    event AttributesSet(
        uint256 indexed tokenId, 
        uint8 nftType, 
        uint8 wisdom, 
        uint8 creativity, 
        uint8 sociability, 
        uint8 curiosity
    );
    event TraitsUpdated(uint256 indexed tokenId, bytes newTraits);
    event MintStarted(uint256 indexed setCount, uint256 totalSets);
    event MintProgress(uint256 indexed currentSet, uint256 totalSets);
    event MintError(uint256 indexed tokenId, string reason);
    event MintCompleted(uint256 indexed totalMinted);
    
    // События для отслеживания использования инвайтов
    event InviteUsed(uint256 indexed tokenId, address indexed user, uint256 timestamp);
    event InviteAlreadyUsed(uint256 indexed tokenId, address indexed user, string reason);
    event InviteNotOwned(uint256 indexed tokenId, address indexed user, address actualOwner);
    event InviteUserAlreadyUsed(address indexed user, uint256 previousInviteId);
    event InviteUsageAttempt(
        uint256 indexed tokenId,
        address indexed user,
        bool success,
        string reason
    );
    
    constructor() ERC721("Capybara Invite NFT", "CINFT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FACTORY_ROLE, msg.sender);
        
        // Role to character mapping
        roleToCharacter[TYPE_SAGE] = "Capybara";
        roleToCharacter[TYPE_GARDENER] = "Capybara";
        roleToCharacter[TYPE_ARTIST] = "Fox";
        roleToCharacter[TYPE_CHEF] = "Fox";
        roleToCharacter[TYPE_EXPLORER] = "Hare";
        roleToCharacter[TYPE_MUSICIAN] = "Hare";
        roleToCharacter[TYPE_ARCHITECT] = "BorderCollie";
        roleToCharacter[TYPE_ATHLETE] = "BorderCollie";
        
        // Инициализация атрибутов ролей
        _initializeRoleAttributes();
    }
    
    // Валидация типов NFT
    function isValidNFTType(uint8 nftType) public pure returns (bool) {
        return nftType >= TYPE_SAGE && nftType <= TYPE_ATHLETE;
    }
    
    // Проверка баланса типов
    function getTypeBalance(uint8 nftType) public view returns (uint256) {
        require(isValidNFTType(nftType), "Invalid NFT type");
        return typeCounter[nftType];
    }
    
    function transferSet(address to) external onlyRole(FACTORY_ROLE) returns (uint256[] memory) {
        require(to != address(0), "Invalid recipient");
        require(_tokenIdCounter.current() >= SET_SIZE, "Not enough tokens");
        
        uint256[] memory tokenIds = new uint256[](SET_SIZE);
        uint8[] memory usedTypes = new uint8[](SET_SIZE);
        uint256 setIndex = 0;
        
        // Ищем по одному токену каждого типа
        for (uint8 nftType = 1; nftType <= SET_SIZE; nftType++) {
            bool found = false;
            for (uint256 tokenId = 0; tokenId < _tokenIdCounter.current(); tokenId++) {
                if (ownerOf(tokenId) == msg.sender && 
                    nftTypes[tokenId] == nftType && 
                    !isTransferred[tokenId]) {
                    tokenIds[setIndex] = tokenId;
                    usedTypes[setIndex] = nftType;
                    setIndex++;
                    found = true;
                    break;
                }
            }
            require(found, "Incomplete set");
        }
        
        // Передаем токены
        for (uint256 i = 0; i < SET_SIZE; i++) {
            _transfer(msg.sender, to, tokenIds[i]);
        }
        
        totalTransfers++;
        emit SetTransferred(to, tokenIds, totalTransfers);
        return tokenIds;
    }
    
    function getNFTType(uint256 tokenId) external view returns (uint8) {
        require(_exists(tokenId), "Token does not exist");
        return nftTypes[tokenId];
    }
    
    function getTypeCount(uint8 nftType) external view returns (uint256) {
        require(nftType > 0 && nftType <= MAX_NFT_TYPES, "Invalid type");
        return typeCounter[nftType];
    }
    
    function mintAdditional(uint256 setCount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!paused(), "Contract is paused");
        require(setCount > 0, "Set count must be greater than 0");
        
        // Проверяем, что не превысим TOTAL_SUPPLY
        uint256 currentSupply = _tokenIdCounter.current();
        require(currentSupply + (setCount * SET_SIZE) <= TOTAL_SUPPLY, "Would exceed total supply");
        
        // Проверяем, что все типы валидны
        for (uint8 nftType = 1; nftType <= SET_SIZE; nftType++) {
            require(isValidNFTType(nftType), "Invalid NFT type in additional mint");
        }
        
        emit MintStarted(setCount, setCount);
        
        // Минтим указанное количество сетов
        for (uint256 set = 0; set < setCount; set++) {
            // Проверяем, что у нас достаточно газа для следующего сета
            require(gasleft() > 100000, "Insufficient gas for next set");
            
            for (uint8 nftType = 1; nftType <= SET_SIZE; nftType++) {
                uint256 tokenId = _tokenIdCounter.current();
                
                // Проверяем, что не превысим TOTAL_SUPPLY
                require(tokenId < TOTAL_SUPPLY, "Would exceed total supply");
                
                _mint(msg.sender, tokenId);
                nftTypes[tokenId] = nftType;
                typeCounter[nftType]++;
                emit NFTTypeSet(tokenId, nftType);
                _tokenIdCounter.increment();
            }
            
            emit MintProgress(set + 1, setCount);
        }
        
        // Проверяем, что все типы в новом минте имеют одинаковое количество
        uint256 baseCount = typeCounter[1];
        for (uint8 nftType = 2; nftType <= SET_SIZE; nftType++) {
            require(typeCounter[nftType] == baseCount, "Type count mismatch in additional mint");
        }
        
        emit MintCompleted(_tokenIdCounter.current());
        
        // Обновляем статус минтинга
        MintStatus storage status = mintStatus[msg.sender];
        status.totalMinted = _tokenIdCounter.current();
        status.totalSets += setCount;
        status.currentSet = setCount;
        status.isInitialized = true;
        status.isPaused = paused();
        
        for (uint8 nftType = 1; nftType <= SET_SIZE; nftType++) {
            status.typeCounts[nftType] = typeCounter[nftType];
        }
    }
    
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    function setFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(FACTORY_ROLE, factory);
    }
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        
        // Проверяем, что это не первый минт
        if (from != address(0)) {
            require(!isTransferred[tokenId], "NFT can only be transferred once");
            isTransferred[tokenId] = true;
            transferHistory[tokenId] = to;
            transferCount[tokenId] = 1;
            userTransfers[to].push(tokenId);
            totalTransfers++;
            emit NFTTransferred(tokenId, from, to, totalTransfers);
        }
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    // Вспомогательные функции для проверки передач
    function getTransferHistory(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "Token does not exist");
        return transferHistory[tokenId];
    }
    
    function getUserTransfers(address user) external view returns (uint256[] memory) {
        return userTransfers[user];
    }
    
    function getTransferCount(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return transferCount[tokenId];
    }
    
    /**
     * @dev Проверяет, может ли NFT быть передан
     * @param tokenId ID NFT для проверки
     * @return bool true если NFT может быть передан
     */
    function isTransferable(uint256 tokenId) public view returns (bool) {
        require(_exists(tokenId), "Token does not exist");
        if (paused()) return false;
        if (isTransferred[tokenId]) return false;
        return true;
    }
    
    /**
     * @dev Проверяет, может ли набор NFT быть передан
     * @param tokenIds массив ID NFT для проверки
     * @return bool true если все NFT могут быть переданы
     */
    function isSetTransferable(uint256[] calldata tokenIds) external view returns (bool) {
        if (tokenIds.length != SET_SIZE) return false;
        if (paused()) return false;
        
        // Проверяем, что все токены принадлежат отправителю
        address owner = ownerOf(tokenIds[0]);
        for (uint256 i = 1; i < tokenIds.length; i++) {
            if (ownerOf(tokenIds[i]) != owner) return false;
        }
        
        // Проверяем, что все токены могут быть переданы
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (!isTransferable(tokenIds[i])) return false;
        }
        
        // Проверяем, что в наборе все типы разные
        uint8[] memory types = new uint8[](SET_SIZE);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            types[i] = nftTypes[tokenIds[i]];
            // Проверяем на дубликаты
            for (uint256 j = 0; j < i; j++) {
                if (types[i] == types[j]) return false;
            }
        }
        
        return true;
    }
    
    /**
     * @dev Переопределенная функция передачи токена
     * @param from адрес отправителя
     * @param to адрес получателя
     * @param tokenId ID токена
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override whenNotPaused {
        require(_exists(tokenId), "Token does not exist");
        // Проверяем, что токен может быть передан
        require(isTransferable(tokenId), "Token is not transferable");
        
        // Проверяем, что отправитель является владельцем
        require(from == ownerOf(tokenId), "Transfer from incorrect owner");
        
        // Проверяем, что получатель не нулевой адрес
        require(to != address(0), "Transfer to the zero address");
        
        // Проверяем, что это не первый минт
        if (from != address(0)) {
            // Обновляем историю передач
            transferHistory[tokenId] = to;
            transferCount[tokenId] = 1;
            userTransfers[to].push(tokenId);
            totalTransfers++;
            emit NFTTransferred(tokenId, from, to, totalTransfers);
        }
        
        // Выполняем стандартную передачу
        super._transfer(from, to, tokenId);
    }
    
    /**
     * @dev Получает атрибуты NFT
     * @param tokenId ID NFT
     * @return NFTAttributes структура с атрибутами
     */
    function getAttributes(uint256 tokenId) external view returns (NFTAttributes memory) {
        require(_exists(tokenId), "Token does not exist");
        return nftAttributes[tokenId];
    }
    
    /**
     * @dev Обновляет черты характера NFT
     * @param tokenId ID NFT
     * @param newTraits новые черты характера
     */
    function updateTraits(uint256 tokenId, bytes calldata newTraits) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        nftAttributes[tokenId].traits = newTraits;
        emit TraitsUpdated(tokenId, newTraits);
    }
    
    /**
     * @dev Обновляет личностные параметры NFT
     * @param tokenId ID NFT
     * @param wisdom мудрость (1-10)
     * @param creativity креативность (1-10)
     * @param sociability общительность (1-10)
     * @param curiosity любознательность (1-10)
     */
    function updatePersonality(
        uint256 tokenId,
        uint8 wisdom,
        uint8 creativity,
        uint8 sociability,
        uint8 curiosity
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(wisdom >= 1 && wisdom <= 10, "Invalid wisdom value");
        require(creativity >= 1 && creativity <= 10, "Invalid creativity value");
        require(sociability >= 1 && sociability <= 10, "Invalid sociability value");
        require(curiosity >= 1 && curiosity <= 10, "Invalid curiosity value");
        
        nftAttributes[tokenId].wisdom = wisdom;
        nftAttributes[tokenId].creativity = creativity;
        nftAttributes[tokenId].sociability = sociability;
        nftAttributes[tokenId].curiosity = curiosity;
        
        emit AttributesSet(tokenId, nftAttributes[tokenId].nftType, wisdom, creativity, sociability, curiosity);
    }
    
    /**
     * @dev Получает описание роли
     * @param nftType тип NFT
     * @return string описание роли
     */
    function getRoleDescription(uint8 nftType) external view returns (string memory) {
        require(isValidNFTType(nftType), "Invalid NFT type");
        return roleToCharacter[nftType];
    }
    
    /**
     * @dev Returns the character name for a given role type
     * @param roleType Role type (1-8)
     * @return character name (string)
     */
    function getCharacterByRole(uint8 roleType) external view returns (string memory) {
        return roleToCharacter[roleType];
    }
    
    /**
     * @dev Sets the tokenURI for a given tokenId (admin only)
     * @param tokenId Token ID
     * @param uri IPFS JSON URI
     */
    function setTokenURI(uint256 tokenId, string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        tokenURIs[tokenId] = uri;
    }
    
    /**
     * @dev Returns the tokenURI for a given tokenId
     * @param tokenId Token ID
     * @return string IPFS JSON URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        string memory uri = tokenURIs[tokenId];
        require(bytes(uri).length > 0, "Token URI not set");
        return uri;
    }
    
    /**
     * @dev Batch set tokenURIs for multiple tokenIds (admin only)
     * @param tokenIds Array of token IDs
     * @param uris Array of IPFS JSON URIs
     */
    function batchSetTokenURI(uint256[] calldata tokenIds, string[] calldata uris) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenIds.length == uris.length, "Array length mismatch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(_exists(tokenIds[i]), "Token does not exist");
            tokenURIs[tokenIds[i]] = uris[i];
        }
    }
    
    /**
     * @dev Возвращает статус минтинга для адреса
     * @param minter адрес минтера
     * @return totalMinted общее количество заминтинных токенов
     * @return totalSets общее количество сетов
     * @return currentSet текущий сет
     * @return isInitialized инициализирован ли контракт
     * @return isPaused на паузе ли контракт
     * @return typeCounts количество токенов каждого типа
     */
    function getMintStatus(address minter) external view returns (
        uint256 totalMinted,
        uint256 totalSets,
        uint256 currentSet,
        bool isInitialized,
        bool isPaused,
        uint256[8] memory typeCounts
    ) {
        MintStatus storage status = mintStatus[minter];
        totalMinted = status.totalMinted;
        totalSets = status.totalSets;
        currentSet = status.currentSet;
        isInitialized = status.isInitialized;
        isPaused = paused();
        
        for (uint8 i = 0; i < 8; i++) {
            typeCounts[i] = status.typeCounts[i + 1];
        }
    }
    
    /**
     * @dev Возвращает статистику минтинга
     * @return totalMinted общее количество заминтинных токенов
     * @return totalSets общее количество сетов
     * @return isInitialized инициализирован ли контракт
     * @return isPaused на паузе ли контракт
     */
    function getMintStats() external view returns (
        uint256 totalMinted,
        uint256 totalSets,
        bool isInitialized,
        bool isPaused
    ) {
        totalMinted = _tokenIdCounter.current();
        totalSets = totalMinted / SET_SIZE;
        isInitialized = totalMinted > 0;
        isPaused = paused();
    }
    
    /**
     * @dev Возвращает количество доступных сетов
     * @return availableSets количество доступных сетов
     * @return totalSets общее количество сетов
     */
    function getAvailableSets() external view returns (uint256 availableSets, uint256 totalSets) {
        uint256 totalMinted = _tokenIdCounter.current();
        totalSets = totalMinted / SET_SIZE;
        
        // Подсчитываем количество нетрансференных токенов каждого типа
        uint256[] memory availableByType = new uint256[](SET_SIZE);
        for (uint256 tokenId = 0; tokenId < totalMinted; tokenId++) {
            if (!isTransferred[tokenId]) {
                uint8 nftType = nftTypes[tokenId];
                availableByType[nftType - 1]++;
            }
        }
        
        // Находим минимальное количество доступных токенов по типам
        availableSets = availableByType[0];
        for (uint8 i = 1; i < SET_SIZE; i++) {
            if (availableByType[i] < availableSets) {
                availableSets = availableByType[i];
            }
        }
    }
    
    // Инициализация атрибутов ролей
    function _initializeRoleAttributes() internal {
        // Sage (Мудрец)
        roleAttributes["Sage"] = RoleAttributes({
            wisdom: 10,
            creativity: 6,
            sociability: 9,
            curiosity: 7,
            empathy: 10,
            determination: 8,
            adaptability: 8,
            leadership: 9
        });

        // Gardener (Садовник)
        roleAttributes["Gardener"] = RoleAttributes({
            wisdom: 8,
            creativity: 7,
            sociability: 8,
            curiosity: 6,
            empathy: 9,
            determination: 7,
            adaptability: 8,
            leadership: 6
        });

        // Artist (Художник)
        roleAttributes["Artist"] = RoleAttributes({
            wisdom: 6,
            creativity: 10,
            sociability: 8,
            curiosity: 9,
            empathy: 7,
            determination: 6,
            adaptability: 9,
            leadership: 5
        });

        // Chef (Повар)
        roleAttributes["Chef"] = RoleAttributes({
            wisdom: 6,
            creativity: 9,
            sociability: 10,
            curiosity: 8,
            empathy: 8,
            determination: 7,
            adaptability: 9,
            leadership: 6
        });

        // Explorer (Исследователь)
        roleAttributes["Explorer"] = RoleAttributes({
            wisdom: 7,
            creativity: 7,
            sociability: 6,
            curiosity: 10,
            empathy: 9,
            determination: 7,
            adaptability: 9,
            leadership: 5
        });

        // Musician (Музыкант)
        roleAttributes["Musician"] = RoleAttributes({
            wisdom: 8,
            creativity: 9,
            sociability: 7,
            curiosity: 7,
            empathy: 10,
            determination: 6,
            adaptability: 8,
            leadership: 5
        });

        // Architect (Архитектор)
        roleAttributes["Architect"] = RoleAttributes({
            wisdom: 9,
            creativity: 7,
            sociability: 6,
            curiosity: 7,
            empathy: 7,
            determination: 10,
            adaptability: 6,
            leadership: 8
        });

        // Athlete (Атлет)
        roleAttributes["Athlete"] = RoleAttributes({
            wisdom: 6,
            creativity: 7,
            sociability: 8,
            curiosity: 7,
            empathy: 6,
            determination: 10,
            adaptability: 8,
            leadership: 7
        });
    }

    function setTokenURIByRole(
        uint8 roleType,
        string calldata uri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isValidNFTType(roleType), "Invalid role type");
        require(bytes(uri).length > 0, "Empty URI");
        
        // Устанавливаем один и тот же URI для всех токенов данной роли
        for (uint256 tokenId = 0; tokenId < _tokenIdCounter.current(); tokenId++) {
            if (nftTypes[tokenId] == roleType) {
                tokenURIs[tokenId] = uri;
            }
        }
    }

    // Функции для проверок Invite NFT
    function hasInvite(address owner) external view returns (bool) {
        require(owner != address(0), "Invalid owner address");
        return balanceOf(owner) > 0;
    }

    function isInviteUntransferred(uint256 tokenId) external view returns (bool) {
        require(_exists(tokenId), "Token does not exist");
        return !isTransferred[tokenId];
    }

    function getType(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return nftTypes[tokenId];
    }

    function getFirstInviteId(address owner) external view returns (uint256) {
        require(owner != address(0), "Invalid owner address");
        // Ищем первый токен, принадлежащий пользователю
        for (uint256 tokenId = 0; tokenId < _tokenIdCounter.current(); tokenId++) {
            if (ownerOf(tokenId) == owner) {
                return tokenId;
            }
        }
        return 0; // Возвращаем 0 если токен не найден
    }

    /**
     * @dev Проверяет, был ли использован инвайт
     * @param tokenId ID токена
     * @return bool true если инвайт был использован
     */
    function isInviteTokenUsed(uint256 tokenId) external view returns (bool) {
        require(_exists(tokenId), "Token does not exist");
        return isInviteUsed[tokenId];
    }

    /**
     * @dev Получает ID использованного инвайта пользователя
     * @param user адрес пользователя
     * @return uint256 ID использованного инвайта или 0 если не использован
     */
    function getUsedInvite(address user) external view returns (uint256) {
        return usedInviteByUser[user];
    }

    /**
     * @dev Отмечает инвайт как использованный
     * @param tokenId ID токена
     * @param user адрес пользователя
     */
    function markInviteAsUsed(uint256 tokenId, address user) external onlyRole(FACTORY_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        
        // Проверяем, что пользователь не использовал другой инвайт
        require(usedInviteByUser[user] == 0, "User already used an invite");
        
        // Проверяем, что пользователь является владельцем инвайта
        require(ownerOf(tokenId) == user, "User is not the owner of this invite");
        
        // Отмечаем инвайт как использованный
        isInviteUsed[tokenId] = true;
        usedInviteByUser[user] = tokenId;
        
        // Эмитим события
        emit InviteUsed(tokenId, user, block.timestamp);
        emit InviteUsageAttempt(tokenId, user, true, "Success");
    }

    /**
     * @dev Проверяет возможность использования инвайта
     * @param tokenId ID токена
     * @param user адрес пользователя
     * @return bool true если инвайт может быть использован
     * @return string причина, если инвайт не может быть использован
     */
    function canUseInvite(uint256 tokenId, address user) external view returns (bool, string memory) {
        if (!_exists(tokenId)) {
            return (false, "Token does not exist");
        }
        
        if (ownerOf(tokenId) != user) {
            return (false, "User is not the owner of this invite");
        }
        
        if (isInviteUsed[tokenId]) {
            return (false, "Invite already used");
        }
        
        if (usedInviteByUser[user] != 0) {
            return (false, "User already used an invite");
        }
        
        return (true, "Invite can be used");
    }

    function setInviteUsed(uint256 tokenId, address user) external onlyRole(FACTORY_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        require(ownerOf(tokenId) == user, "User is not the owner of this token");
        require(!isInviteUsed[tokenId], "Invite already used");
        
        isInviteUsed[tokenId] = true;
        usedInviteByUser[user] = tokenId;
        
        emit InviteUsed(tokenId, user, block.timestamp);
    }
}
