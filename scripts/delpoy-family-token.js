require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    // 1. Подключение к контрактам
    const capybaraAddress = process.env.CAPYBARA_CONTRACT;
    const factoryAddress = process.env.CAPYBARA_FACTORY_CONTRACT;
    
    const capybaraToken = await ethers.getContractAt("CapybaraToken", capybaraAddress);
    const factory = await ethers.getContractAt("CapybaraFactory", factoryAddress);
    
    // Создаем новый тестовый аккаунт для имитации нового пользователя
    const newFamilyWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    console.log("\nСоздан новый адрес семьи:", newFamilyWallet.address);

    // Отправляем ETH на новый адрес для оплаты газа
    const [deployer] = await ethers.getSigners();
    const tx1 = await deployer.sendTransaction({
        to: newFamilyWallet.address,
        value: ethers.parseEther("1.0")
    });
    await tx1.wait();
    console.log("Отправлено 1 ETH на новый адрес для оплаты газа");

    // 2. Проверяем, есть ли уже токен у семьи
    const existingToken = await factory.familyTokens(newFamilyWallet.address);
    if (existingToken !== ethers.ZeroAddress) {
        console.log("У семьи уже есть токен:", existingToken);
        return;
    }

    // 3. Проверяем баланс CAPYBARA у фабрики
    const factoryBalance = await capybaraToken.balanceOf(factoryAddress);
    const welcomeAmount = await factory.welcomeAmount();
    
    if (factoryBalance < welcomeAmount) {
        console.log("Отправляем CAPYBARA на фабрику для приветственных токенов...");
        const tx = await capybaraToken.transfer(factoryAddress, welcomeAmount);
        await tx.wait();
        console.log("CAPYBARA отправлены на фабрику");
    }

    // 4. Создаем семейный токен
    console.log("\nСоздаем семейный токен...");
    const name = "New Family Paradygm";
    const symbol = "NFP-888";
    
    // Имитируем вызов с адреса семьи
    const tx = await factory.connect(newFamilyWallet).createFamilyToken(name, symbol);
    const receipt = await tx.wait();
    
    // Получаем адрес созданного токена из события
    const event = receipt.logs.find(log => {
        try {
            const decoded = factory.interface.parseLog(log);
            return decoded?.name === 'FamilyTokenCreated';
        } catch (e) {
            return false;
        }
    });
    const tokenAddress = event.args.token;
    console.log("Семейный токен создан:", tokenAddress);

    // 5. Проверяем результаты
    const familyToken = await ethers.getContractAt("FamilyToken", tokenAddress);
    
    // Проверяем владельца токена (теперь это должен быть msg.sender)
    const owner = await familyToken.owner();
    console.log("\nПроверка владельца:");
    console.log("Адрес семьи (newFamilyWallet):", newFamilyWallet.address);
    console.log("Владелец токена:", owner);
    console.log("Владелец совпадает с msg.sender:", owner === newFamilyWallet.address);
    
    // Проверяем балансы
    const familyCapybaraBalance = await capybaraToken.balanceOf(newFamilyWallet.address);
    const familyTokenBalance = await familyToken.balanceOf(newFamilyWallet.address);
    console.log("\nПроверка балансов:");
    console.log("Баланс CAPYBARA (приветственные):", ethers.formatUnits(familyCapybaraBalance, 8));
    console.log("Баланс семейного токена (начальная эмиссия):", ethers.formatUnits(familyTokenBalance, 8));
    
    // Проверяем привязку токена
    const storedTokenAddress = await factory.getFamilyToken(newFamilyWallet.address);
    console.log("\nПроверка привязки токена:");
    console.log("Адрес токена в фабрике:", storedTokenAddress);
    console.log("Совпадает с созданным:", storedTokenAddress === tokenAddress);
    
    // Проверяем общую эмиссию
    const totalSupply = await familyToken.totalSupply();
    console.log("\nОбщая информация:");
    console.log("Общая эмиссия токена:", ethers.formatUnits(totalSupply, 8));
    console.log("Имя токена:", await familyToken.name());
    console.log("Символ токена:", await familyToken.symbol());
    console.log("Количество десятичных знаков:", await familyToken.decimals());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
