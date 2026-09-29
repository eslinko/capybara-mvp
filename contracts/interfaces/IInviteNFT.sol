// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInviteNFT {
    /**
     * @dev Проверяет, владеет ли адрес Invite NFT
     * @param owner Адрес для проверки
     * @return bool True если адрес владеет хотя бы одним Invite NFT
     */
    function hasInvite(address owner) external view returns (bool);

    /**
     * @dev Проверяет, был ли передан конкретный Invite NFT
     * @param tokenId ID токена для проверки
     * @return bool True если токен никогда не передавался
     */
    function isInviteUntransferred(uint256 tokenId) external view returns (bool);

    /**
     * @dev Получает тип (роль) Invite NFT
     * @param tokenId ID токена
     * @return uint256 Тип токена (1-8)
     */
    function getType(uint256 tokenId) external view returns (uint256);

    /**
     * @dev Получает ID первого Invite NFT, которым владеет адрес
     * @param owner Адрес владельца
     * @return uint256 ID первого Invite NFT или 0 если нет токенов
     */
    function getFirstInviteId(address owner) external view returns (uint256);

    /**
     * @dev Получает адрес владельца токена
     * @param tokenId ID токена
     * @return address Адрес владельца токена
     */
    function ownerOf(uint256 tokenId) external view returns (address);

    function setInviteUsed(uint256 tokenId, address user) external;
} 