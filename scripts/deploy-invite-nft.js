const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Константы ролей и их типов
const ROLES = {
    SAGE: { type: 1, name: "Capybara — Sage" },
    GARDENER: { type: 2, name: "Capybara — Gardener" },
    ARTIST: { type: 3, name: "Capybara — Artist" },
    CHEF: { type: 4, name: "Capybara — Chef" },
    EXPLORER: { type: 5, name: "Capybara — Explorer" },
    MUSICIAN: { type: 6, name: "Capybara — Musician" },
    ARCHITECT: { type: 7, name: "Capybara — Architect" },
    ATHLETE: { type: 8, name: "Capybara — Athlete" }
};

async function main() {
    console.log('🚀 Начинаем деплой NFT контракта...');

    // 1. Деплой контракта
    const [deployer] = await hre.ethers.getSigners();
    console.log(`📝 Деплой с аккаунта: ${deployer.address}`);

    const CapybaraInviteNFT = await hre.ethers.getContractFactory("CapybaraInviteNFT");
    const nft = await CapybaraInviteNFT.deploy();
    await nft.waitForDeployment();
    console.log(`✅ Контракт развернут по адресу: ${nft.target}`);

    // Подписываемся на события
    nft.on("MintStarted", (setCount, totalSets) => {
        console.log(`📊 Начат минт: ${setCount} сетов из ${totalSets}`);
    });

    nft.on("MintProgress", (currentSet, totalSets) => {
        console.log(`⏳ Прогресс минта: ${currentSet}/${totalSets} сетов`);
    });

    nft.on("MintCompleted", (totalMinted) => {
        console.log(`✅ Минт завершен: всего заминтировано ${totalMinted} токенов`);
    });

    nft.on("NFTTypeSet", (tokenId, nftType) => {
        console.log(`🎯 Токен ${tokenId} получил тип ${nftType}`);
    });

    nft.on("AttributesSet", (tokenId, nftType, wisdom, creativity, sociability, curiosity) => {
        console.log(`📝 Установлены атрибуты для токена ${tokenId}:`);
        console.log(`   Тип: ${nftType}`);
        console.log(`   Мудрость: ${wisdom}`);
        console.log(`   Креативность: ${creativity}`);
        console.log(`   Общительность: ${sociability}`);
        console.log(`   Любознательность: ${curiosity}`);
    });

    nft.on("MintError", (tokenId, reason) => {
        console.error(`❌ Ошибка при минте токена ${tokenId}: ${reason}`);
    });

    // 2. Читаем и обрабатываем IPFS хеши из properties файла
    console.log('📖 Читаем IPFS хеши из nft_assets.properties...');
    const propertiesContent = await readFile('nft_assets.properties', 'utf8');
    const roleURIs = {};

    propertiesContent.split('\n').forEach(line => {
        if (line && !line.startsWith('#')) {
            const [file, uri] = line.split('=');
            if (file.endsWith('.json')) {
                const roleName = file.replace('.json', '');
                for (const [roleKey, roleData] of Object.entries(ROLES)) {
                    if (roleData.name === roleName) {
                        roleURIs[roleKey] = uri.trim();
                        break;
                    }
                }
            }
        }
    });

    // 3. Минтим 888 сетов
    console.log('🔄 Начинаем минт 888 сетов...');
    const setCount = 8;

    // Оценка газа перед минтом
    const estimatedGas = await nft.mintAdditional.estimateGas(setCount);
    console.log(`⛽️ Оценка газа для минта ${setCount} сетов: ${estimatedGas.toString()}`);

    // Минт
    const mintTx = await nft.mintAdditional(setCount);
    console.log('⏳ Ожидаем подтверждения транзакции минта...');
    const mintReceipt = await mintTx.wait();
    console.log('✅ Минт сетов завершен');

    // Фактический расход газа
    const actualGas = mintReceipt.gasUsed;
    console.log(`⛽️ Фактический расход газа: ${actualGas.toString()}`);

    // Разница
    const diff = actualGas - estimatedGas;
    console.log(`📊 Разница между оценкой и фактом: ${diff > 0 ? '+' : ''}${diff}`);

    // Анализируем события из рецепта транзакции
    console.log('\n📊 Анализ событий минта:');
    const logs = mintReceipt.logs;
    for (const log of logs) {
        try {
            const parsed = nft.interface.parseLog(log);
            console.log(`Событие: ${parsed.name}`, parsed.args);
        } catch (e) {
            // Лог не относится к нашему контракту, пропускаем
        }
    }

    // 4. Устанавливаем URI для каждой роли
    console.log('🔗 Устанавливаем URI для каждой роли...');
    for (const [roleKey, roleData] of Object.entries(ROLES)) {
        const uri = roleURIs[roleKey];
        if (uri) {
            console.log(`Устанавливаем URI для роли ${roleKey}...`);
            const setUriTx = await nft.setTokenURIByRole(roleData.type, uri);
            const setUriReceipt = await setUriTx.wait();
            console.log(`✅ URI установлен для роли ${roleKey}`);
            
            // Анализируем события установки URI
            const logs = setUriReceipt.logs;
            for (const log of logs) {
                try {
                    const parsed = nft.interface.parseLog(log);
                    if (parsed.name === 'TraitsUpdated') {
                        console.log(`Обновлены черты для токена ${parsed.args.tokenId}`);
                    }
                } catch (e) {
                    // Лог не относится к нашему контракту, пропускаем
                }
            }
        } else {
            console.warn(`⚠️ Не найден URI для роли ${roleKey}`);
        }
    }

    // Сохраняем информацию о деплое
    const deploymentInfo = {
        network: hre.network.name,
        contractAddress: nft.address,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        roles: ROLES,
        roleURIs: roleURIs,
        setCount: setCount,
        totalTokens: setCount * Object.keys(ROLES).length
    };

    await writeFile(
        'deployment-info.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log('💾 Информация о деплое сохранена в deployment-info.json');

    // Проверяем результат
    console.log('\n🔍 Проверяем результат:');
    for (const [roleKey, roleData] of Object.entries(ROLES)) {
        const typeCount = await nft.getTypeCount(roleData.type);
        console.log(`${roleKey}: ${typeCount} токенов`);
    }

    console.log('\n✨ Деплой успешно завершен!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Ошибка при деплое:', error);
        process.exit(1);
    });
