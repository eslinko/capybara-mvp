# Capybara — архитектура и технические решения

Рабочая документация инструмента **Capybara** — семейный $CAPY-эксченж на архитектуре
`deploy_full`. Всё описанное подтверждено по коду (ссылки вида `file:line` кликабельны).
Юзер-инструкция по запуску — рядом в [USER-MANUAL.md](USER-MANUAL.md).

> Статус: `EPIC-SCR-01-capybara` активен (CAPY-00/01/02/03/04/05 🟢). Аудиты — в
> [`../analysis/`](../analysis/). Логирование операций — в [LOGGING.md](LOGGING.md).

## 1. Назначение

Родитель (я) выступает обменником «$CAPY → фиат» и общим пулом для детей (Tristan, Bastian).
Инструмент — операторский CLI в пакете `capybara/` (core + `cli/`), работающий **только** со
стандартным ERC20-токеном **$CAPY**. Compat-shim: `scripts/capybara.js` → `capybara/cli/capybara.js`.
Действия: проверка связи (0), вывод баланса ребёнка родителю (1), расчёт+сверка+выплата
дневного «карманного» долга (2), списание с ребёнка(детей) в пул со сплитом (3). Каждое денежное
действие пишется в единый журнал операций (см. [LOGGING.md](LOGGING.md)).

Ключевая идея безопасности: по умолчанию всё в режиме **mock (dry-run)** — реальные переводы
включаются только явным `CAPY_MODE=gfl_reality`.

## 2. Связь с `deploy_full` (вендоренная инфраструктура)

Capybara — **отдельный** пакет со **своим** конфигом `capybara/.env`, повторяет модульную
архитектуру `deploy_full.js`. Три утилиты **скопированы** в core (deploy в `scripts/lib/utils/`
не трогаем):

| Утилита | Vendored в core |
|---------|-----------------|
| `Logger` (singleton) | [lib/infrastructure/Logger.js](../../packages/core/src/lib/infrastructure/Logger.js) |
| `RpcProviderManager` | [lib/infrastructure/RpcProviderManager.js](../../packages/core/src/lib/infrastructure/RpcProviderManager.js) |
| `RateLimitHelpers` | [lib/infrastructure/RateLimitHelpers.js](../../packages/core/src/lib/infrastructure/RateLimitHelpers.js) |

Операторский код — [packages/core/src/](../../packages/core/src/). `scripts/lib/capybara/` — только
README redirect (не home исходников).

## 3. Точка входа и диспетчер действий

```
node scripts/capybara.js   или   cd capybara && npm run cli
        │  (shim → capybara/cli/capybara.js)
        ▼
   cli/capybara.js  ── CAPYBARA_ACTION, LOG_LEVEL, wallet checks
        │
        ▼
   CapybaraRouter.initialize()
        │  ┌─ config        ← capybara/.env (валидируется)
        │  ├─ provider      ← ProviderFactory (CAPY_RPC_URL; +RpcProviderManager на 137)
        │  ├─ walletRegistry← tristan / bastian / parent
        │  └─ capyToken     ← CapyToken(…)
        ▼
   CapybaraActionsManager.executeAction(n)  →  action 0 | 1 | 2 | 3
```

- **Вход:** [capybara.js](../../cli/capybara.js) — читает `CAPYBARA_ACTION` (число), при отсутствии/невалидном → ошибка и `exit 1` ([capybara.js:15-25](../../cli/capybara.js#L15)). Скрипт запускается **чистым Node** (`require('ethers')`, не `require('hardhat')`) — не поднимает Hardhat и не читает `scripts/.env`.
- **Router:** [CapybaraRouter.js](../../packages/core/src/CapybaraRouter.js) — ленивая инициализация (провайдер → config → token → wallets), затем `route(action)` ([CapybaraRouter.js:53-67](../../packages/core/src/CapybaraRouter.js#L53)). Зеркалит `DeployRouter` из [deploy_full.js:70](../../deploy_full.js#L70).
- **ActionsManager:** [actions/index.js](../../packages/core/src/actions/index.js) — карта `0/1/2/3 → handler`; неизвестное действие → ошибка со списком доступных ([actions/index.js:86-93](../../packages/core/src/actions/index.js#L86)).

## 4. Конфигурация и окружение

**SSOT конфига — `capybara/.env`** (отдельный от деплойного `scripts/.env`; канонический
путь в [packages/core/src/env-path.js](../../packages/core/src/env-path.js)). Загрузка + валидация +
сборка структуры — [packages/core/src/config/build.js](../../packages/core/src/config/build.js).

**Обязательные ключи** ([build.js:3-15](../../packages/core/src/config/build.js#L3)):
`TRISTAN_ADDRESS/PRIVATE_KEY`, `BASTIAN_ADDRESS/PRIVATE_KEY`, `PARENT_ADDRESS/PRIVATE_KEY`,
`CAPY_TOKEN_ADDRESS`, `CAPY_DAILY_TRISTAN`, `CAPY_DAILY_BASTIAN`, `CAPY_RPC_URL`, `CAPY_CHAIN_ID`.

**Опциональные:** `CAPY_MODE` (default `mock`), `LOG_LEVEL`/`DEBUG`.

**Валидации** ([build.js:37-81](../../packages/core/src/config/build.js#L37)):
- required-ключи не пустые, иначе перечисление ошибок + `exit 1` ([build.js:139-151](../../packages/core/src/config/build.js#L139));
- `CAPY_CHAIN_ID` — целое > 0;
- `CAPY_MODE` ∈ {`mock`, `gfl_reality`};
- `CAPY_DAILY_*` — положительное число.

Приватные ключи нормализуются (префикс `0x`, [build.js:87-90](../../packages/core/src/config/build.js#L87)) и
**никогда не логируются целиком** — только маска (`maskPrivateKey`,
[ProviderFactory.js:11-16](../../packages/core/src/ProviderFactory.js#L11)).

## 5. Провайдер и сеть

[packages/core/src/ProviderFactory.js](../../packages/core/src/ProviderFactory.js) строит провайдер напрямую
из `CAPY_RPC_URL` (`new ethers.JsonRpcProvider`), проверяет связь (`getNetwork` + `getBlockNumber`)
и сверяет `chainId` с `CAPY_CHAIN_ID` (при расхождении — warning, не падение,
[ProviderFactory.js:45-49](../../packages/core/src/ProviderFactory.js#L45)).

На **Polygon mainnet** (`chainId === 137`) включается `RpcProviderManager` с запасными эндпоинтами
([ProviderFactory.js:30-37](../../packages/core/src/ProviderFactory.js#L30)); на других сетях fallback
не нужен.

## 6. Слой $CAPY (ERC20-обёртка)

[packages/core/src/CapyToken.js](../../packages/core/src/CapyToken.js) — обёртка над токеном с минимальным ABI
([erc20-minimal-abi.js](../../packages/core/src/erc20-minimal-abi.js): `balanceOf`, `transfer`,
`decimals`, `symbol`, событие `Transfer`) — artifact не нужен.

- **Чтения:** `getBalance` / `getDecimals` / `getSymbol` / `queryTransfers` — реальные вызовы цепочки.
- **Устойчивость:** на Polygon (137) чтения/запись оборачиваются в `executeWithRateLimitRetry` и при rate-limit переключают эндпоинт; после переключения контракт пересоздаётся на новом провайдере ([CapyToken.js:47-67](../../packages/core/src/CapyToken.js#L47)).
- **Подпись/nonce:** на каждый `transfer` создаётся **новый** `ethers.Wallet` (правило nonce из [EthersUtils.getSigner](../../lib/utils/EthersUtils.js#L35)).
- **Mock-gate (предохранитель):** `transfer` реально шлёт токен **только** при `mode === 'gfl_reality'`; в любом другом режиме — логирует `[MOCK] would transfer …` и возвращает синтетическую tx ([CapyToken.js:109-138](../../packages/core/src/CapyToken.js#L109)). См. §9.

## 7. Реестр кошельков

[packages/core/src/WalletRegistry.js](../../packages/core/src/WalletRegistry.js): резолв имени в
`{address, privateKey}` для `tristan` / `bastian` / `parent` (все три с приватным ключом —
parent-ключ нужен для выплат в action 2). Неизвестное имя → ошибка
([WalletRegistry.js:21-27](../../packages/core/src/WalletRegistry.js#L21)). Метод `listChildren()`
возвращает детей без `parent` (`['tristan','bastian']`) — используется action 3 для режима `all`
([WalletRegistry.js:74](../../packages/core/src/WalletRegistry.js#L74)).

## 8. Действия

### Action 0 — health check (read-only)
[actions/index.js:33-44](../../packages/core/src/actions/index.js#L33). Возвращает `mode`, `chainId`,
адрес токена, список кошельков и `symbol()` — быстрая проверка, что конфиг/сеть/токен рабочие и в
каком режиме (mock/боевой) сейчас инструмент.

### Action 1 — sweep баланса ребёнка → родителю
[packages/core/src/actions/SweepToParentAction.js](../../packages/core/src/actions/SweepToParentAction.js).
Поток: резолв кошелька → `balanceOf(child)` → определить сумму (заданная или полный баланс) →
проверки (ноль-баланс; сумма > баланса; валидность суммы) → `transfer(child→parent)` подпись
**ребёнка** → ждать чек с retry → баланс после. Подача логов — русская с эмодзи
([SweepToParentAction.js:77-205](../../packages/core/src/actions/SweepToParentAction.js#L77)). Валидация
суммы: отрицательная/нечисловая → дружелюбная ошибка до отправки
([:212-231](../../packages/core/src/actions/SweepToParentAction.js#L212)).

### Action 2 — дневные выплаты (расчёт → сверка → подтверждение → перевод)
[packages/core/src/actions/DailyPaymentsAction.js](../../packages/core/src/actions/DailyPaymentsAction.js) +
модуль [packages/core/src/daily-payments/](../../packages/core/src/daily-payments/). Этапы:

1. **Период** ([periodResolver.js](../../packages/core/src/daily-payments/periodResolver.js)): `to ?? сегодня`; `from ?? (день после последней даты в логе)`; лог пуст → один день «сегодня». Если `from > to` → пустой период (`empty:true`) → graceful no-op ([DailyPaymentsAction.js:104-116](../../packages/core/src/actions/DailyPaymentsAction.js#L104)). **Mock (L3):** `readLastLogDate` всегда читает **боевой** журнал (`getProdLogDir`), даже в `CAPY_MODE=mock` — намеренно: dry-run сверяется против реальной истории выплат, а запись идёт в `logs/capybara/mock/` ([ndjsonLogReader.js:49-50](../../packages/core/src/daily-payments/ndjsonLogReader.js#L49), [DailyPaymentsAction.js:148](../../packages/core/src/actions/DailyPaymentsAction.js#L148)).
2. **Сверка** ([reconcileEngine.js](../../packages/core/src/daily-payments/reconcileEngine.js)): читает `Transfer(parent→child)` за период (диапазон блоков оценивается консервативно, §9), агрегирует по дню (UTC, по timestamp блока), считает `expected` (дневная ставка) и `actual`.
3. **Долг:** `owed_total = Σ по дням max(0, expected − actual)` ([reconcileEngine.js:96-107](../../packages/core/src/daily-payments/reconcileEngine.js#L96)).
4. **Презентация:** построчная разбивка (день: ожидалось/выплачено/долг) + итоговая сумма, русский + эмодзи.
5. **Долг = 0** → «🎉 Всё выплачено», лог, выход без вопроса и перевода.
6. **Pre-flight:** проверка баланса **родителя** ≥ долга, иначе ошибка до подтверждения ([DailyPaymentsAction.js:173-177](../../packages/core/src/actions/DailyPaymentsAction.js#L173)).
7. **Подтверждение** ([confirmPayment.js](../../packages/core/src/daily-payments/confirmPayment.js)): интерактивный вопрос с **точной суммой**; «нет» → ничего не шлём; **нет TTY → ошибка** (никогда не платим без живого подтверждения, [confirmPayment.js:47-53](../../packages/core/src/daily-payments/confirmPayment.js#L47)).
8. **Перевод** `parent→child` подпись **родителя**, mock-gate уважается; ждать чек (в mock — синтетический).
9. **Лог** ([ndjsonLogWriter.js](../../packages/core/src/daily-payments/ndjsonLogWriter.js)): append NDJSON `capybara/logs/capybara/<wallet>.ndjson` — строки `day` (дедуп по дате) + строка `payment`. Детали формата и всех типов записей — [LOGGING.md](LOGGING.md).

### Action 3 — списание с ребёнка(детей) в пул (charge)
[packages/core/src/actions/ChargeToPoolAction.js](../../packages/core/src/actions/ChargeToPoolAction.js) +
движок сплита [packages/core/src/charge-pool/splitAllocation.js](../../packages/core/src/charge-pool/splitAllocation.js).
Списание идёт **ребёнок → родитель** (подпись ребёнка). Два режима:

- **Одиночный** (`CAPYBARA_WALLET=tristan|bastian`, `CAPYBARA_AMOUNT`): списать сумму; при нехватке баланса — списать доступное (частично) и записать `shortfall` ([ChargeToPoolAction.js:103-206](../../packages/core/src/actions/ChargeToPoolAction.js#L103)).
- **`all`** (`CAPYBARA_WALLET=all`): `CAPYBARA_AMOUNT` — **общая** сумма, делится между детьми поровну либо по `CAPYBARA_SPLIT=tristan:60,bastian:40` (проценты, сумма=100). Остаток неделимых raw-единиц → первому ребёнку ([splitAllocation.js:71-106](../../packages/core/src/charge-pool/splitAllocation.js#L71)). Перед отправкой — **предпроверка балансов всех**; если кому-то не хватает доли → не начинать ([ChargeToPoolAction.js:232-255](../../packages/core/src/actions/ChargeToPoolAction.js#L232)). Это **N транзакций** (по одной с каждого ребёнка); при сбое одной — продолжить остальных, в конце отчёт `passed/failed`, все успешные — в журнал с общим `batch_id` ([:282-355](../../packages/core/src/actions/ChargeToPoolAction.js#L282)).

Подтверждение — TTY да/нет (по каждому ребёнку при `all`), mock-gate уважается. Журнал: строки
`type:'charge'` через `appendTypedLedgerEntry` (см. [LOGGING.md](LOGGING.md)).

### Action 6 — журнал долга

Отдельный NDJSON обязательств, не журнал выплат. Контракт и подоперации: [docs/architecture/01-child-debt-accounting/](architecture/01-child-debt-accounting/00-overview.md). Путь файла — [debtPath.js](../packages/core/src/debt/debtPath.js): `logs/capybara/debt/` для `gfl_reality` и `logs/capybara/debt/mock/` для остальных режимов, дальше `mode--chainId--token--pool/<ребёнок>.ndjson`. Погашение идёт через `CapyToken` в пул родителя и в mock не вызывает `contract.transfer`. Действия 2 и 3 этот журнал не пишут.

### Ретрофит Action 1 → журнал
Action 1 (sweep) после успешного перевода пишет строку `type:'sweep'` в тот же журнал
([SweepToParentAction.js:311-330](../../packages/core/src/actions/SweepToParentAction.js#L311)) — единая
история всех денежных операций.

## 9. Ключевые технические решения

| Решение | Зачем | Где |
|---------|-------|-----|
| **Отдельный `capybara/.env`, чистый Node-вход** | Изоляция от деплойных секретов; не поднимает Hardhat | [env-path.js](../../packages/core/src/env-path.js), [capybara.js](../../cli/capybara.js) |
| **Fail-safe mock-gate** | Реальная отправка только при `mode === 'gfl_reality'`; любой другой/неизвестный режим = dry-run. Опечатка не уводит деньги | [CapyToken.js:115](../../packages/core/src/CapyToken.js#L115), [DailyPaymentsAction.js:179](../../packages/core/src/actions/DailyPaymentsAction.js#L179) |
| **TTY-подтверждение с точной суммой** | Крупные/боевые переводы (action 2) требуют живого «да»; неинтерактивно → отказ | [confirmPayment.js](../../packages/core/src/daily-payments/confirmPayment.js) |
| **Формула долга `Σ max(0, expected−actual)`** | Доплачиваем только недоплату, не платим дважды за оплаченные дни | [reconcileEngine.js:96-107](../../packages/core/src/daily-payments/reconcileEngine.js#L96) |
| **Консервативная оценка `fromBlock`** | Делитель 1 с/блок + запас 12 блоков → окно сверки не сужается на быстрых сетях (≥1с) → нет риска переплаты | [dateUtils.js:61-92](../../packages/core/src/daily-payments/dateUtils.js#L61) |
| **Новый Wallet на каждый transfer** | Корректный nonce (кэширование signer ломает nonce) | [CapyToken.js:104-106](../../packages/core/src/CapyToken.js#L104) |
| **Retry + switch эндпоинта на 137** | Переживать rate-limit публичных Polygon-RPC | [CapyToken.js:47-67](../../packages/core/src/CapyToken.js#L47), [RateLimitHelpers.js](../../packages/core/src/lib/infrastructure/RateLimitHelpers.js) |
| **Mock period from prod log (L3)** | Dry-run сверяется против реальной истории; mock-запись не сдвигает prod `readLastLogDate` | [ndjsonLogReader.js:49](../../packages/core/src/daily-payments/ndjsonLogReader.js#L49), [DailyPaymentsAction.js:148](../../packages/core/src/actions/DailyPaymentsAction.js#L148) |
| **Indexer, journal или block-scan** | Три источника actual. Без ключа indexer (`SCANNER_API_KEY`, иначе алиас `POLYGONSCAN_API_KEY`) действие 2 берёт actual из prod NDJSON и не вызывает `queryTransfers`: в логе `сверка по журналу (цепь не сканировалась; риск ручных tx на операторе)`. С ключом — indexer, `chainid` = `CAPY_CHAIN_ID`. Если indexer не ответил — полный block-scan. `CAPY_RECONCILE=blockscan` задаёт полный скан RPC даже если ключ задан | [reconcileEngine.js](../packages/core/src/daily-payments/reconcileEngine.js), [ndjsonLogReader.js](../packages/core/src/daily-payments/ndjsonLogReader.js) |
| **Единый типизированный журнал** | Все денежные действия (`payment`/`sweep`/`charge`) пишут в общий per-wallet NDJSON с полем `type` — один источник истории | [ndjsonLogWriter.js:122](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L122), [LOGGING.md](LOGGING.md) |
| **Сплит `all` на raw-единицах + предпроверка** | Точное деление суммы (остаток→первому), батч не стартует при нехватке у кого-либо | [splitAllocation.js:71](../../packages/core/src/charge-pool/splitAllocation.js#L71), [ChargeToPoolAction.js:232](../../packages/core/src/actions/ChargeToPoolAction.js#L232) |
| **Общий `resolveLaunchedBy`** | Атрибуция запуска в журнале (единый util вместо дублей) | [runtimeContext.js](../../packages/core/src/runtimeContext.js) |
| **Баннер боевого режима перед записью** | Видно, что предохранитель снят, до action 1/2/3 | [actions/index.js:27-32](../../packages/core/src/actions/index.js#L27) |

Сеть и indexer: [EPIC-SCR-CAPY-EVM](tasks/epics/EPIC-SCR-CAPY-EVM/EPIC-SCR-CAPY-EVM.md), [INTERVIEW-CAPY-EVM-NETWORK-2026-10-14](tasks/backlog-stories/capybara-evm/INTERVIEW-CAPY-EVM-NETWORK-2026-10-14.md). Runbook смены сети — [USER-MANUAL.md](manuals/USER-MANUAL.md) §Switch network (EVM).

## 10. Тесты

Оффлайн-юнит-тесты (mocha + sinon), без реальной сети и без боевого `.env`:
[tests/unit/](../../tests/unit/). Запуск:
```bash
cd capybara && npm test
```
Покрыто: конфиг/валидация/exit, провайдер, ERC20-обёртка (+retry, +mock-gate), реестр, sweep,
daily-payments (период, сверка/долг, TTY-подтверждение, pre-flight баланса, NDJSON, консервативная
оценка блока), Etherscan V2 indexer + fallback, charge (single/all/split/предпроверка/continue-on-fail),
единый журнал + sweep-ретрофит. Исторический claim — **113 passing** (mocha run — отдельная волна).

## 11. Известные ограничения (открытые LOW)

- **CAPY-01 N1:** сумма-дробь больше `decimals()` токена → сырая ошибка ethers вместо дружелюбной (редкий edge; большинство ERC20 = 18 decimals). [reaudit2 CAPY-01](../analysis/reaudit2-STORY-SCR-CAPY-01-2026-07-01.md).
- **CAPY-02 N1 residual:** консервативная оценка `fromBlock` безопасна для сетей с блоком **≥1с** (Polygon/Ethereum/BSC/DogeOS); суб-секундные L2 (~0.25с) — теоретический остаток. [reaudit2 CAPY-02](../analysis/reaudit2-STORY-SCR-CAPY-02-2026-07-01.md).
- **REG-1 (не Capybara):** битый путь в `tests/e2e/node-reset-validation.e2e.test.js:22` роняет полный `npm test` на сборке — это функциональный e2e из другого (Amanita) кода, кандидат на удаление.

## 12. Дерево файлов

```
capybara/
  package.json                    # workspaces packages/*
  .env(.example)                  # SSOT конфиг (секреты не коммитить)
  cli/capybara.js                 # CLI entry
  packages/core/src/
    env-path.js                   # CAPYBARA_ROOT → .env (+ legacy fallback)
    lib/infrastructure/           # Logger, RpcProviderManager, RateLimitHelpers
    config/  ProviderFactory.js  WalletRegistry.js  CapyToken.js
    CapybaraRouter.js  runtimeContext.js
    actions/  charge-pool/  indexer/  daily-payments/
  logs/capybara/                  # NDJSON выплат (бой + mock/)
  logs/capybara/debt/             # NDJSON долга (бой + mock/), действие 6
  tests/unit/*.test.js            # оффлайн-тесты
  docs/capybara/                  # USER-MANUAL, ARCHITECTURE, LOGGING
scripts/
  capybara.js                     # thin shim → cli/capybara.js
  capybara.env.example            # stub → capybara/.env.example
  lib/capybara/README.md          # redirect only
```
