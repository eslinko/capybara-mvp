require("dotenv").config();
const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Получаем конфигурацию сети
const network = hre.network.name;
// Приватный ключ из .env
const privateKey = process.env.PRIVATE_KEY.startsWith('0x') 
  ? process.env.PRIVATE_KEY 
  : `0x${process.env.PRIVATE_KEY}`;
// RPC URL из конфига сети
const RPC_URL = hre.network.config.url;

// Создаем провайдер
const web3 = new Web3(RPC_URL);

// Создаем аккаунт из приватного ключа
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

// Пути к ABI и байткоду контракта
const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "CapybaraToken.sol", "CapybaraToken.json");
if (!fs.existsSync(artifactPath)) {
  throw new Error("Contract artifact not found. Please compile the contract first.");
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

// Функция для конвертации баланса с учетом 8 знаков после запятой
function formatBalance(balanceBigInt) {
  const balance = Number(balanceBigInt);
  return (balance / (10 ** 8)).toFixed(8);
}

async function main() {
  const deployer = account.address;
  console.log(`\n=== Начинаем деплой CapybaraToken в сеть ${network.toUpperCase()} ===`);
  console.log("Деплоер:", deployer);
  
  // Проверяем баланс в нативной валюте сети
  const balance = await web3.eth.getBalance(deployer);
  const currency = network === 'polygon' ? 'MATIC' : 'ETH';
  console.log("Баланс деплоера:", web3.utils.fromWei(balance, 'ether'), currency);
  console.log("RPC URL:", RPC_URL);

  // Проверяем цену газа
  const gasPrice = await web3.eth.getGasPrice();
  console.log("Текущая цена газа:", web3.utils.fromWei(gasPrice, 'gwei'), "Gwei");

  // Примерная стоимость деплоя (5M газа)
  const deploymentCost = BigInt(gasPrice) * BigInt(5000000);
  console.log("Примерная стоимость деплоя:", web3.utils.fromWei(deploymentCost.toString(), 'ether'), currency);

  if (BigInt(balance) < deploymentCost) {
    throw new Error(`Недостаточно ${currency} для деплоя. Необходимо минимум: ${web3.utils.fromWei(deploymentCost.toString(), 'ether')} ${currency}`);
  }

  console.log("\nДеплоим контракт...");
  const contract = new web3.eth.Contract(artifact.abi);
  const token = await contract.deploy({
    data: artifact.bytecode,
    arguments: []
  }).send({
    from: deployer,
    gas: 5000000,
    gasPrice: gasPrice
  });
  
  console.log("\n=== Деплой успешен! ===");
  console.log("Адрес контракта:", token.options.address);
  
  // Проверяем начальный баланс
  const initialBalance = await token.methods.balanceOf(deployer).call();
  console.log("Начальный баланс деплоера:", formatBalance(initialBalance), "CAPY");
  
  // Проверяем общий supply
  const totalSupply = await token.methods.totalSupply().call();
  console.log("Общий supply:", formatBalance(totalSupply), "CAPY");
  
  // Проверяем decimals
  const decimals = await token.methods.decimals().call();
  console.log("Decimals:", decimals);
  
  // Проверяем INITIAL_SUPPLY
  const initialSupply = await token.methods.INITIAL_SUPPLY().call();
  console.log("INITIAL_SUPPLY:", formatBalance(initialSupply), "CAPY");

  console.log("\nВы можете проверить контракт на PolygonScan:");
  console.log(`https://polygonscan.com/token/${token.options.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n=== Ошибка при деплое ===");
    console.error(error.message || error);
    process.exit(1);
  });
