# Анализ: кто шлёт `personal_sign`, Etherscan vs Capybara host, gap REQ-10

**Дата:** 2026-11-23  
**Правила:** analysis.mdc — только факты из кода / REQ / мануала + сверка с внешним черновиком плана страницы  
**Скоуп:** модель подписи login-challenge; Present/Absent клиента; коррекция «сервер шлёт в сеть → прилетает в MetaMask»  
**Триггер:** операторский manual curl verify с плейсхолдером `0x…` → `EAUTH_INVALID_SIGNATURE`; вопрос про MetaMask / Etherscan Sign Message; черновик [`Capybara_Wallet_Signing_Plan_RU.md`](../../../../.cursor/projects/Users-eslinko-Development-DOGEstonia/attachments/31ba76b5-6b1a-465b-b45c-d89543e13c6f/Capybara_Wallet_Signing_Plan_RU.md) (вне контекста репо)

---

## 1. Короткий ответ на модель оператора

**Нет:** Capybara **host/сервер не** «шлёт `eth_personal_sign` в Ethereum/DogeOS сеть», чтобы запрос «прилетел» в MetaMask.

**Да:** обычно **dApp / страница / POC в браузере** (как Etherscan Sign Message) вызывает локально EIP-1193 провайдер кошелька (`window.ethereum` / выбранный провайдер):

`ethereum.request({ method: 'personal_sign', params: [message, address] })`

MetaMask показывает UI Sign **в том же браузере**, пользователь подтверждает, dApp получает hex `signature` и уже **HTTP** шлёт её на сервер (`POST /auth/verify`).

Подпись login-сообщения **вне блокчейна** (off-chain ERC-191); RPC/chain нужны кошельку для контекста сети, но **не** как транспорт «сервер → mempool → MetaMask».

| Роль | Что делает |
|------|------------|
| Host (REQ-08) | Выдаёт `challengeId` + **точный** `message`; проверяет `signature` через `ethers.verifyMessage` |
| Wallet (MetaMask) | Подписывает байты `message` (human Sign) |
| Client / POC (REQ-10) | Соединяет: challenge → `personal_sign` → verify. **Сейчас Absent** |

Etherscan на скрине — **веб-страница**, подключённая к MetaMask; поле Message + кнопка Sign Message = локальный вызов провайдера, не «транзакция в сеть на подпись».

---

## 2. Контракт Capybara (verified)

Источник: [`packages/core/src/auth/buildSiweClassMessage.js`](../packages/core/src/auth/buildSiweClassMessage.js), [`verifyAddressProof.js`](../packages/core/src/auth/verifyAddressProof.js), host `/auth/*`, REQ-10.

| Что выдаёт сервер | Что подписывать | Что слать на verify |
|-------------------|-----------------|---------------------|
| `challengeId` **и** полный UTF-8 `message` (SIWE-class) | **Точный** `message` (не `challengeId` как текст) | `challengeId` + `signature` |

- `buildSiweClassMessage`: явно «for `personal_sign`»; login ≠ money-sign.
- Verify: `ethers.verifyMessage(challenge.message, signature)` → recovered address == challenge.address; иначе `EAUTH_INVALID_SIGNATURE` / `EAUTH_WRONG_SIGNER`.
- Unit: `wallet.signMessage(challenge.message)` — тестовый ethers Wallet, **не** MetaMask.

Вариант «подписать строку `challengeId`» из внешнего черновика (§2 таблица, 3-я строка) — **не** наш контракт.

---

## 3. Present / Absent

| Seam | State | Evidence |
|------|-------|----------|
| SIWE-class message + challenge/verify core | Present | `packages/core/src/auth/` |
| Host HTTP `/auth/challenge`, `/auth/verify` | Present | EDGE-01 / `host/authHttp.js` |
| MetaMask / `window.ethereum` / EIP-1193 client | **Absent** | нет runtime hits; REQ-10 §0 |
| Terminal MetaMask POC (AC-W06) | **Absent** | REQ-10 name≠create |
| Backlog package / stories под REQ-10 | **Absent** | ROADMAP Phase 2 lists REQ-10; EDGE OOS REQ-10 body |
| Operator manual MetaMask steps | Pointer only | [`IDENTITY-HTTP-EDGE-MANUAL.md`](../manuals/IDENTITY-HTTP-EDGE-MANUAL.md) §6 → REQ-10 |

REQ-08 / EDGE **не пропустили** клиент: он вынесен в sibling **REQ-10** ([`10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md)). Gap = **implement Absent**, не «забыли в анализе EDGE».

---

## 4. Сверка внешнего черновика «Capybara. План страницы подписи»

Черновик (attachments) написан без полного контекста репо. Ниже — совпадения и неточности относительно **текущего** Capybara.

| Утверждение черновика | Вердикт vs Capybara |
|----------------------|---------------------|
| Страница подключает кошелёк, пользователь подписывает в UI кошелька, off-chain | Согласуется с моделью REQ-10 / EIP-1193 |
| Сначала уточнить контракт бэкенда (challengeId+message vs только id) | Верно как метод; **факт:** у нас уже `challengeId` + `message` |
| Подпись строки `challengeId` как один из вариантов | **Не** наш контракт — не выбирать |
| «Если проектируешь новый SIWE…» | Избыточно: SIWE-class message **уже Present** в core |
| `personal_sign` params `[messageHex, address]`, не хешировать на фронте | Согласуется с ERC-191 / MetaMask; verify на сервере через ethers |
| Целевая сеть DogeOS Chikyū `6281971`, RPC dogeos | **Не** зафиксировано в REQ-08/10 как lock identity login; host verify сейчас **не** проверяет chainId в `verifyAddressProof` (message без chain ID field в buildSiweClassMessage as shipped). Сеть на скрине MetaMask ≠ контракт verify |
| WalletConnect / MyDoge / EIP-6963 страница | Имеет смысл как **будущий** client scope; **не Present**; шире минимального REQ-10 terminal POC |
| Размещение страницы на origin = SIWE domain | У нас default domain `capybara.local` / URI `capybara://auth/challenge` — страница на произвольном origin **не** совпадёт с доменом в message, пока domain/uri не согласовать в implement |
| Ручной paste challenge на странице | Рабочий interim; REQ-10 предпочитает terminal POC, который сам берёт challenge с host |

**Итог по черновику:** направление «браузерная страница → MetaMask `personal_sign` → копировать/отправить signature» совместимо с REQ-10. Неточности: (1) не проектировать новый SIWE с нуля; (2) не подписывать `challengeId`; (3) DogeOS chain/WalletConnect — не proven locks текущего identity edge; (4) «сервер шлёт в сеть» — в черновике прямо не сказано, но это **частая путаница** с Etherscan UI: транспорт = browser provider, не L1.

---

## 5. Почему curl с `signature: "0x…"` упал

Оператор вставил **плейсхолдер**, не результат MetaMask. Host корректно взял challenge по id и отклонил невалидную подпись (`EAUTH_INVALID_SIGNATURE`). Это gap **клиента/ручного Sign**, не баг verify.

---

## 6. Что должно появиться (residual, name≠create здесь)

По REQ-10 (когда implement wave):

1. Terminal-started POC: читает `CAPY_POOL_ADDRESS`, `POST /auth/challenge`, открывает browser/bridge → MetaMask Sign **того же** `message`, `POST /auth/verify`, печатает OK без dump секретов (AC-W06).
2. Опционально минимальная страница (как в черновике) — Architect/stories; не заменяет server challenge/verify.
3. Backlog stories package под REQ-10 — отдельная материализация (сейчас Absent).
4. Не делать: custody / auto-sign private key на сервере; broadcast «sign tx» в сеть вместо `personal_sign`.

---

## 7. Источники

| Артефакт | Путь |
|----------|------|
| REQ-10 | `docs/requirements/10-wallet-address-proof-client.md` |
| REQ-08 OOS wallet client | `docs/requirements/08-identity-http-edge-on-host.md` |
| Message builder | `packages/core/src/auth/buildSiweClassMessage.js` |
| Verify | `packages/core/src/auth/verifyAddressProof.js` |
| Manual pointer | `docs/manuals/IDENTITY-HTTP-EDGE-MANUAL.md` §6 |
| External draft (не SSOT) | attachments `Capybara_Wallet_Signing_Plan_RU.md` |
| Related env analysis | `docs/analysis/analysis-arweave-uploader-node-env-startup-2026-11-22.md` |
