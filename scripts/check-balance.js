require("dotenv").config();
const { Web3 } = require("web3");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Адрес для проверки
const CHECK_ADDRESS = "0x12Dc497c4F65C275EE13e385Bb67fDd6c689A8F4";
// Адрес контракта токена
const TOKEN_ADDRESS = "0xFF5053F2bE129c7A1BbcA839a93ebB027e80eF5a";

// Приватный ключ из .env (если есть)
const privateKey = process.env.PRIVATE_KEY?.startsWith('0x') 
  ? process.env.PRIVATE_KEY 
  : process.env.PRIVATE_KEY ? `0x${process.env.PRIVATE_KEY}` : null;

// Получаем конфигурацию сети
const network = hre.network.name;
const RPC_URL = hre.network.config.url;

// Загружаем ABI токена
const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "CapybaraToken.sol", "CapybaraToken.json");
const tokenABI = JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;

// Функция для форматирования баланса токена
function formatTokenBalance(balance, decimals) {
  return (Number(BigInt(balance)) / (10 ** Number(decimals))).toFixed(8);
}

async function main() {
  console.log(`\n=== Проверка баланса в сети ${network.toUpperCase()} ===`);
  console.log("RPC URL:", RPC_URL);
  
  const web3 = new Web3(RPC_URL);
  const currency = network === 'localhost' ? 'ETH' : 'MATIC';
  
  console.log("\n=== Информация об адресе ===");
  console.log("Адрес:", CHECK_ADDRESS);
  
  // Проверяем баланс MATIC
  const balance = await web3.eth.getBalance(CHECK_ADDRESS);
  console.log("Баланс:", web3.utils.fromWei(balance, 'ether'), currency);
  
  // Проверяем баланс CAPY токена
  console.log("\n=== Информация о токене CAPY ===");
  console.log("Адрес контракта:", TOKEN_ADDRESS);
  
  const token = new web3.eth.Contract(tokenABI, TOKEN_ADDRESS);
  try {
    const tokenBalance = await token.methods.balanceOf(CHECK_ADDRESS).call();
    const decimals = await token.methods.decimals().call();
    const symbol = await token.methods.symbol().call();
    const totalSupply = await token.methods.totalSupply().call();
    
    console.log("Баланс токенов:", formatTokenBalance(tokenBalance, decimals), symbol);
    console.log("Общий supply:", formatTokenBalance(totalSupply, decimals), symbol);
    console.log("Decimals:", decimals);
  } catch (error) {
    console.log("❌ Ошибка при проверке баланса токена:", error.message);
  }
  
  // Проверяем количество транзакций
  const txCount = await web3.eth.getTransactionCount(CHECK_ADDRESS);
  console.log("\n=== Общая информация ===");
  console.log("Количество транзакций:", txCount);
  
  // Проверяем цену газа
  const gasPrice = await web3.eth.getGasPrice();
  console.log("Текущая цена газа:", web3.utils.fromWei(gasPrice, 'gwei'), "Gwei");
  
  // Проверяем, является ли адрес контрактом
  const code = await web3.eth.getCode(CHECK_ADDRESS);
  if (code !== '0x') {
    console.log("Это адрес контракта");
  } else {
    console.log("Это внешний аккаунт (EOA)");
  }

  // Если есть приватный ключ, проверяем доступ
  if (privateKey) {
    try {
      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      if (account.address.toLowerCase() === CHECK_ADDRESS.toLowerCase()) {
        console.log("\n✅ Есть доступ к адресу через приватный ключ");
      }
    } catch (error) {
      console.log("\n❌ Ошибка при проверке приватного ключа:", error.message);
    }
  }

  // Рекомендуемый минимум для деплоя (0.1 MATIC/ETH)
  const recommendedMin = web3.utils.toWei('0.1', 'ether');
  if (BigInt(balance) < BigInt(recommendedMin)) {
    console.log(`\n⚠️ Внимание: Баланс меньше рекомендуемого минимума (0.1 ${currency})`);
    console.log("Рекомендуется пополнить баланс перед деплоем");
  } else {
    console.log(`\n✅ Баланс достаточен для деплоя (больше 0.1 ${currency})`);
  }

  // Выводим ссылки на explorer
  console.log("\nПосмотреть адрес на PolygonScan:");
  console.log(`https://polygonscan.com/address/${CHECK_ADDRESS}`);
  console.log("\nПосмотреть токен на PolygonScan:");
  console.log(`https://polygonscan.com/token/${TOKEN_ADDRESS}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n=== Ошибка при проверке баланса ===");
    console.error(error.message || error);
    process.exit(1);
  }); 