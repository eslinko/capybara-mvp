require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = hre.network.name;
    
    console.log(`\n=== Начинаем деплой CapybaraFactory в сеть ${network.toUpperCase()} ===`);
    console.log("Деплоер:", deployer.address);
    
    // Проверяем баланс деплоера
    const balance = await ethers.provider.getBalance(deployer.address);
    const currency = network === 'polygon' ? 'MATIC' : 'ETH';
    console.log("Баланс деплоера:", ethers.formatEther(balance), currency);
    
    // Проверяем цену газа
    const gasPrice = await ethers.provider.getFeeData();
    console.log("Текущая цена газа:", ethers.formatUnits(gasPrice.gasPrice, 'gwei'), "Gwei");
    
    // Примерная стоимость деплоя (3M газа)
    const deploymentCost = gasPrice.gasPrice * BigInt(3000000);
    console.log("Примерная стоимость деплоя:", ethers.formatEther(deploymentCost), currency);
    
    if (balance < deploymentCost) {
        throw new Error(`Недостаточно ${currency} для деплоя. Необходимо минимум: ${ethers.formatEther(deploymentCost)} ${currency}`);
    }

    // Проверяем адрес CAPYBARA токена
    const capybaraAddress = process.env.CAPYBARA_CONTRACT;
    if (!capybaraAddress) {
        throw new Error("CAPYBARA_CONTRACT не указан в .env файле");
    }
    if (!ethers.isAddress(capybaraAddress)) {
        throw new Error("Невалидный адрес CAPYBARA токена");
    }
    
    console.log("\nДеплоим CapybaraFactory...");
    console.log("Адрес CAPYBARA токена:", capybaraAddress);
    
    // Деплоим фабрику
    const CapybaraFactory = await ethers.getContractFactory("CapybaraFactory");
    const factory = await CapybaraFactory.deploy(capybaraAddress);
    await factory.waitForDeployment();
    
    const factoryAddress = await factory.getAddress();
    console.log("\n=== Деплой успешен! ===");
    console.log("CapybaraFactory задеплоен по адресу:", factoryAddress);
    
    // Проверяем настройки фабрики
    console.log("\nПроверка настроек фабрики:");
    const factoryTokenAddress = await factory.capybaraToken();
    console.log("Адрес CAPYBARA токена в фабрике:", factoryTokenAddress);
    console.log("Совпадает с указанным:", factoryTokenAddress === capybaraAddress);
    
    const welcomeAmount = await factory.welcomeAmount();
    console.log("Количество приветственных токенов:", ethers.formatUnits(welcomeAmount, 8), "CAPY");
    
    // Проверяем права владельца
    console.log("\nПроверка владельца:");
    try {
        const owner = await factory.owner();
        console.log("Владелец фабрики:", owner);
        console.log("Совпадает с деплоером:", owner === deployer.address);
    } catch (error) {
        console.log("Ошибка при получении владельца:", error.message);
        console.log("Проверяем код контракта...");
        const code = await ethers.provider.getCode(factoryAddress);
        console.log("Код контракта:", code.slice(0, 100) + "...");
    }
    
    // Отправляем токены на фабрику для приветственных бонусов
    console.log("\nОтправляем CAPYBARA на фабрику для приветственных бонусов...");
    const capybaraToken = await ethers.getContractAt("CapybaraToken", capybaraAddress);
    
    // Отправляем 88888 CAPY на фабрику
    const tokensForFactory = 88888n * 10n**8n; // 88888 CAPY с 8 десятичными знаками
    const tx = await capybaraToken.transfer(factoryAddress, tokensForFactory);
    await tx.wait();
    
    // Проверяем баланс фабрики
    const factoryBalance = await capybaraToken.balanceOf(factoryAddress);
    console.log("Баланс фабрики:", ethers.formatUnits(factoryBalance, 8), "CAPY");
    console.log("Достаточно для создания", Number(factoryBalance / welcomeAmount), "семей");
    
    if (network === 'polygon') {
        console.log("\nВы можете проверить контракт на PolygonScan:");
        console.log(`https://polygonscan.com/address/${factoryAddress}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n=== Ошибка при деплое ===");
        console.error(error.message || error);
        process.exit(1);
    }); 