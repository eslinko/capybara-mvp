require('dotenv').config();
const pinataSDK = require('@pinata/sdk');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Инициализация Pinata
const pinata = new pinataSDK(
    process.env.PINATA_API_KEY,
    process.env.PINATA_API_SECRET
);

// Проверка соединения с Pinata
async function testConnection() {
    try {
        const result = await pinata.testAuthentication();
        console.log('✅ Соединение с Pinata успешно установлено');
        console.log(`Используется аккаунт: ${result.authenticated}`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка соединения с Pinata:', error.message);
        return false;
    }
}

// Функция для создания прогресс-бара
function createProgressBar(total) {
    let current = 0;
    const barLength = 30;
    
    return {
        update(completed = 1) {
            current += completed;
            const percentage = Math.min(100, (current * 100) / total);
            const filledLength = Math.round(barLength * percentage / 100);
            const filled = '█'.repeat(filledLength);
            const empty = '░'.repeat(barLength - filledLength);
            process.stdout.write(`\r[${filled}${empty}] ${percentage.toFixed(1)}% | ${current}/${total}`);
            
            if (current >= total) {
                process.stdout.write('\n');
            }
        }
    };
}

// Получение списка всех файлов с пагинацией
async function getAllFiles() {
    let allFiles = [];
    let hasMore = true;
    let pageOffset = 0;
    const pageLimit = 100;

    console.log('🔍 Начинаем получение списка файлов...');
    
    while (hasMore) {
        try {
            console.log(`   Запрашиваем страницу ${pageOffset / pageLimit + 1}...`);
            const startTime = Date.now();
            
            const response = await pinata.pinList({
                status: 'pinned',
                pageLimit,
                pageOffset
            });
            
            const endTime = Date.now();
            console.log(`   ✓ Получено ${response.rows.length} файлов (заняло ${(endTime - startTime) / 1000} сек)`);
            
            if (response.rows.length > 0) {
                allFiles = [...allFiles, ...response.rows];
                pageOffset += pageLimit;
                hasMore = response.rows.length === pageLimit;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error('❌ Ошибка при получении списка файлов:', error.message);
            throw error;
        }
    }

    return allFiles;
}

// Удаление всех файлов
async function deleteAllFiles() {
    try {
        console.log('\n📋 Получение списка файлов для удаления...');
        const startGetFiles = Date.now();
        const files = await getAllFiles();
        const endGetFiles = Date.now();
        
        console.log(`\n📊 Найдено ${files.length} файлов для удаления`);
        console.log(`⏱️  Получение списка заняло: ${(endGetFiles - startGetFiles) / 1000} секунд\n`);

        if (files.length === 0) {
            console.log('✨ Нет файлов для удаления');
            return;
        }

        const progress = createProgressBar(files.length);
        const errors = [];
        let successCount = 0;
        const startDelete = Date.now();

        // Удаляем файлы пакетами по 10 штук
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
            const batchStartTime = Date.now();
            const batch = files.slice(i, i + batchSize);
            
            console.log(`\n🗑️  Удаляем пакет ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${batch.length} файлов)`);
            
            const promises = batch.map(file => 
                pinata.unpin(file.ipfs_pin_hash)
                    .then(() => {
                        successCount++;
                        return { success: true, hash: file.ipfs_pin_hash };
                    })
                    .catch(error => {
                        errors.push({ hash: file.ipfs_pin_hash, error: error.message });
                        return { success: false, hash: file.ipfs_pin_hash };
                    })
            );

            await Promise.all(promises);
            const batchEndTime = Date.now();
            console.log(`   ✓ Пакет обработан за ${(batchEndTime - batchStartTime) / 1000} сек`);
            
            progress.update(batch.length);
        }

        const endDelete = Date.now();
        const totalTime = (endDelete - startGetFiles) / 1000;
        const deleteTime = (endDelete - startDelete) / 1000;

        // Выводим итоговую статистику
        console.log('\n\n📊 Статистика удаления:');
        console.log(`✅ Успешно удалено: ${successCount} файлов`);
        console.log(`⏱️  Время удаления: ${deleteTime} секунд`);
        console.log(`⏱️  Общее время выполнения: ${totalTime} секунд`);
        
        if (errors.length > 0) {
            console.log(`❌ Ошибки при удалении: ${errors.length} файлов`);
            console.log('\nСписок ошибок:');
            errors.forEach(({hash, error}) => {
                console.log(`- ${hash}: ${error}`);
            });
        }

    } catch (error) {
        console.error('\n❌ Критическая ошибка при удалении файлов:', error.message);
        throw error;
    }
}

// Функция для загрузки файла на Pinata
async function uploadToPinata(filePath, options = {}) {
    try {
        const stream = fs.createReadStream(filePath);
        const result = await pinata.pinFileToIPFS(stream, options);
        return result.IpfsHash;
    } catch (error) {
        console.error(`❌ Ошибка при загрузке файла ${filePath}:`, error.message);
        throw error;
    }
}

// Функция для обновления JSON файла с IPFS хешем изображения
async function updateJsonWithImageHash(jsonPath, imageHash) {
    try {
        const jsonContent = await readFile(jsonPath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        // Создаем новый объект с нужным порядком полей
        const updatedData = {
            name: jsonData.name,
            description: jsonData.description,
            capybara_manifest: "💠 Money takes a new form. The flow is open. This NFT carries the vibration of a safe financial paradigm shift. By interacting with it, you align with the future frequency of abundance.",
            image: `ipfs://${imageHash}`,
            image_url: `https://ipfs.io/ipfs/${imageHash}`,
            external_url: jsonData.external_url,
            attributes: jsonData.attributes,
            properties: jsonData.properties
        };
        
        // Обновляем URI в properties.files если они существуют
        if (updatedData.properties && updatedData.properties.files) {
            updatedData.properties.files[0].uri = `ipfs://${imageHash}`;
        }
        
        // Сохраняем обновленный JSON с отступами для читаемости
        const updatedJson = JSON.stringify(updatedData, null, 2);
        await writeFile(jsonPath, updatedJson);
        
        console.log(`✅ Обновлен JSON файл ${jsonPath}`);
        console.log(`   - image: ${updatedData.image}`);
        console.log(`   - image_url: ${updatedData.image_url}`);
        console.log(`   - capybara_manifest: ${updatedData.capybara_manifest}`);
        
        return updatedData;
    } catch (error) {
        console.error(`❌ Ошибка при обновлении JSON файла ${jsonPath}:`, error.message);
        throw error;
    }
}

// Функция для обновления файла properties
async function updatePropertiesFile(results) {
    try {
        const now = new Date();
        let content = `# IPFS-адреса NFT ассетов\n`;
        content += `# Дата создания: ${now.toLocaleDateString()}\n`;
        content += `# Время создания: ${now.toLocaleTimeString()}\n`;
        content += `# Всего файлов: ${Object.keys(results).length * 2}\n\n`;

        // Сортируем результаты по имени файла
        const sortedResults = Object.entries(results).sort(([a], [b]) => a.localeCompare(b));

        for (const [imageFile, data] of sortedResults) {
            const jsonFile = imageFile.replace('.png', '.json');
            content += `${jsonFile}=${data.json}\n`;
            content += `${imageFile}=${data.image}\n`;
        }

        await writeFile('nft_assets.properties', content);
        console.log('💾 IPFS-адреса сохранены в nft_assets.properties');
    } catch (error) {
        console.error('❌ Ошибка при сохранении IPFS-адресов:', error.message);
        throw error;
    }
}

// Сохранение результатов в файл
async function saveResults(results) {
    try {
        const now = new Date();
        const resultsContent = {
            metadata: {
                date: now.toLocaleDateString(),
                time: now.toLocaleTimeString(),
                totalFiles: Object.keys(results).length,
                successfulUploads: Object.keys(results).length,
                errors: 0
            },
            files: results
        };

        await writeFile('nft_assets.json', JSON.stringify(resultsContent, null, 2));
        console.log('\n💾 Результаты успешно сохранены в nft_assets.json');

        // Обновляем файл properties
        await updatePropertiesFile(results);
    } catch (error) {
        console.error('\n❌ Ошибка при сохранении результатов:', error.message);
        throw error;
    }
}

// Загрузка файлов из папки
async function uploadFiles() {
    try {
        const assetsDir = path.join(__dirname, '..', 'NFT Assets');
        console.log('\n📂 Чтение файлов из папки:', assetsDir);

        // Проверяем существование папки
        if (!fs.existsSync(assetsDir)) {
            throw new Error(`Папка ${assetsDir} не существует`);
        }

        // Получаем список файлов
        const files = await readdir(assetsDir);
        const imageFiles = files.filter(file => file.endsWith('.png'));
        
        console.log(`📊 Найдено ${imageFiles.length} изображений для загрузки\n`);

        if (imageFiles.length === 0) {
            console.log('✨ Нет файлов для загрузки');
            return [];
        }

        const progress = createProgressBar(imageFiles.length * 2); // Умножаем на 2 для изображений и JSON
        const results = {};
        const errors = [];

        // Обрабатываем каждый файл последовательно
        for (const imageFile of imageFiles) {
            try {
                const imagePath = path.join(assetsDir, imageFile);
                const jsonFile = imageFile.replace('.png', '.json');
                const jsonPath = path.join(assetsDir, jsonFile);

                console.log(`\n📤 Обработка: ${imageFile}`);
                console.log(`   JSON файл: ${jsonFile}`);

                // Загружаем изображение
                console.log('   Загрузка изображения...');
                const imageHash = await uploadToPinata(imagePath, {
                    pinataMetadata: {
                        name: imageFile,
                        keyvalues: {
                            type: 'nft-image',
                            date: new Date().toISOString()
                        }
                    }
                });
                console.log(`   ✓ Изображение загружено, хеш: ${imageHash}`);
                progress.update();

                // Обновляем JSON с хешем изображения
                console.log('   Обновление JSON файла...');
                console.log('   Текущее содержимое JSON:');
                const currentJson = await readFile(jsonPath, 'utf8');
                console.log(currentJson);
                
                const updatedJson = await updateJsonWithImageHash(jsonPath, imageHash);
                console.log('   Обновленное содержимое JSON:');
                console.log(JSON.stringify(updatedJson, null, 2));
                
                // Загружаем обновленный JSON
                console.log('   Загрузка JSON файла...');
                const jsonHash = await uploadToPinata(jsonPath, {
                    pinataMetadata: {
                        name: jsonFile,
                        keyvalues: {
                            type: 'nft-metadata',
                            date: new Date().toISOString()
                        }
                    }
                });
                console.log(`   ✓ JSON загружен, хеш: ${jsonHash}`);
                progress.update();

                // Сохраняем результаты
                results[imageFile] = {
                    image: `ipfs://${imageHash}`,
                    json: `ipfs://${jsonHash}`,
                    timestamp: new Date().toISOString()
                };

                console.log(`✅ Успешно обработано: ${imageFile}`);
            } catch (error) {
                errors.push({ file: imageFile, error: error.message });
                console.error(`❌ Ошибка при обработке ${imageFile}:`, error.message);
            }
        }

        // Сохраняем результаты
        await saveResults(results);

        // Выводим статистику
        console.log('\n📊 Статистика загрузки:');
        console.log(`✅ Успешно загружено: ${Object.keys(results).length} пар файлов`);
        
        if (errors.length > 0) {
            console.log(`❌ Ошибки при загрузке: ${errors.length} файлов`);
            console.log('\nСписок ошибок:');
            errors.forEach(({file, error}) => {
                console.log(`- ${file}: ${error}`);
            });
        }

        return results;
    } catch (error) {
        console.error('\n❌ Критическая ошибка при загрузке файлов:', error.message);
        throw error;
    }
}

// Основная функция
async function main() {
    try {
        // Проверяем соединение
        const isConnected = await testConnection();
        if (!isConnected) {
            console.error('❌ Невозможно продолжить без соединения с Pinata');
            process.exit(1);
        }

        // Удаляем файлы
        await deleteAllFiles();

        // Загружаем новые файлы
        await uploadFiles();
        
        console.log('\n✨ Операция завершена');
    } catch (error) {
        console.error('\n❌ Произошла ошибка:', error.message);
        process.exit(1);
    }
}

// Запуск скрипта
main();
