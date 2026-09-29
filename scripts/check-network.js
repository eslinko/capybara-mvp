const { Web3 } = require("web3");
const hre = require("hardhat");
require('dotenv').config();

// Адрес для проверки
const CHECK_ADDRESS = "0x12Dc497c4F65C275EE13e385Bb67fDd6c689A8F4";

async function main() {
  const network = hre.network.name;
  const rpcUrl = hre.network.config.url;
  
  console.log(`=== Проверка подключения к сети ${network.toUpperCase()} ===`);
  console.log("RPC URL:", rpcUrl);
  
  try {
    const web3 = new Web3(rpcUrl);
    
    // Проверяем подключение, запрашивая номер последнего блока
    const blockNumber = await web3.eth.getBlockNumber();
    console.log("\n✅ Подключение успешно!");
    console.log("Текущий номер блока:", blockNumber);
    
    // Получаем информацию о газе
    const gasPrice = await web3.eth.getGasPrice();
    console.log("Текущая цена газа:", web3.utils.fromWei(gasPrice, 'gwei'), "Gwei");
    
    // Проверяем данные по адресу
    console.log("\n=== Проверка данных по адресу ===");
    console.log("Адрес:", CHECK_ADDRESS);
    
    // Проверяем баланс
    const balance = await web3.eth.getBalance(CHECK_ADDRESS);
    console.log("Баланс:", web3.utils.fromWei(balance, 'ether'), "MATIC");
    
    // Проверяем количество транзакций
    const transactionCount = await web3.eth.getTransactionCount(CHECK_ADDRESS);
    console.log("Количество транзакций:", transactionCount);
    
    // Проверяем код контракта (если это контракт)
    const code = await web3.eth.getCode(CHECK_ADDRESS);
    if (code !== '0x') {
      console.log("Это контракт!");
      console.log("Длина байткода:", code.length - 2, "байт");
    } else {
      console.log("Это EOA (внешний аккаунт)");
    }

    // Проверяем доступ через приватный ключ
    console.log("\n=== Проверка доступа через приватный ключ ===");
    if (!process.env.PRIVATE_KEY) {
      console.log("❌ PRIVATE_KEY не найден в .env файле");
      return;
    }

    console.log("Длина приватного ключа:", process.env.PRIVATE_KEY.length, "символов");
    console.log("Приватный ключ начинается с:", process.env.PRIVATE_KEY.substring(0, 8) + "...");
    console.log("Приватный ключ заканчивается на:", "..." + process.env.PRIVATE_KEY.substring(process.env.PRIVATE_KEY.length - 8));

    try {
      // Пробуем добавить 0x префикс если его нет
      const privateKey = process.env.PRIVATE_KEY.startsWith('0x') 
        ? process.env.PRIVATE_KEY 
        : `0x${process.env.PRIVATE_KEY}`;
      
      console.log("Используем ключ с префиксом 0x:", privateKey.substring(0, 10) + "...");
      
      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      console.log("✅ Ключ успешно загружен");
      console.log("Адрес из приватного ключа:", account.address);
      
      // Проверяем баланс аккаунта
      const accountBalance = await web3.eth.getBalance(account.address);
      console.log("Баланс аккаунта:", web3.utils.fromWei(accountBalance, 'ether'), "MATIC");
      
      // Проверяем, совпадает ли адрес с проверяемым
      if (account.address.toLowerCase() === CHECK_ADDRESS.toLowerCase()) {
        console.log("✅ Доступ подтвержден: приватный ключ соответствует проверяемому адресу");
      } else {
        console.log("❌ Доступ не подтвержден: приватный ключ не соответствует проверяемому адресу");
        console.log("Ожидаемый адрес:", CHECK_ADDRESS);
        console.log("Полученный адрес:", account.address);
      }
    } catch (error) {
      console.log("❌ Ошибка при проверке приватного ключа:");
      console.log("Текст ошибки:", error.message);
      if (error.stack) {
        console.log("Стек ошибки:", error.stack);
      }
    }
    
  } catch (error) {
    console.error("\n❌ Ошибка подключения:");
    console.error(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 