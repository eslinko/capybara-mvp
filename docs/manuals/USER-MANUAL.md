# Capybara — юзер-мануал (запуск из терминала)

Простая инструкция: как запускать готовые команды. Технику см. в
[ARCHITECTURE.md](ARCHITECTURE.md).

> 🔒 **Главное про безопасность:** по умолчанию инструмент в режиме **mock** — деньги **не**
> двигаются, только показывает, что бы он сделал. Реальные переводы включаются **одной строкой**:
> `CAPY_MODE=gfl_reality` в `capybara/.env`.

---

## 0. Что это

Команды для токена $CAPY:
- **Проверка** — что всё настроено и в каком режиме (mock/боевой).
- **Sweep** — снять $CAPY с кошелька ребёнка и перевести тебе (родителю).
- **Дневные выплаты** — посчитать долг по «карманным» за период, сверить с блокчейном, спросить
  подтверждение и выплатить ребёнку.
- **Списание в пул** — снять с ребёнка (или сразу со всех, поделив сумму) в общий котёл (родитель).
- **Выплаты за активность** — зачёт контрольной/экзамена (метрики в журнал) и опциональная выплата $CAPY ребёнку.
- **Аванс** (действие 7) — отдельный журнал `logs/capybara/advance/`. Это не долг и не списание в пул.
- **Деплой контракта** (действие 51) и **доэмиссия** (действие 52) — от кошелька deployer. Браузерный mint — отдельная страница, эти команды его не заменяют: [README-mint.md](../../scripts/README-mint.md). Эта HTML-страница — Phase F и не входит в эпик EPIC-SCR-CAPY-EVM (Interview Q6=A).

Каждое денежное действие пишется в журнал операций — см. §4 и [LOGGING.md](LOGGING.md).

Все команды запускаются из **корня репозитория** (`/Users/eslinko/Development/DOGEstonia`) через канонический entry:

```bash
node capybara/cli/capybara.js
```

Из каталога `capybara/`: `npm run cli` (тот же `cli/capybara.js`). Compat-shim `scripts/capybara.js` **не** использовать в новых примерах и промптах.

Доэммиссия $CAPY в браузере — не эти команды. Инструкция: [README-mint.md](../../scripts/README-mint.md).

---

## 1. Один раз: настроить `capybara/.env`

Скопируй шаблон и впиши значения (файл с ключами — **не коммитить**):

```bash
cp capybara/.env.example capybara/.env
# затем отредактируй capybara/.env
```

Что означает каждая переменная:

| Переменная | Что это | Пример |
|------------|---------|--------|
| `CAPY_RPC_URL` | RPC любой EVM-сети, где живёт $CAPY. Меняй вместе с `CAPY_CHAIN_ID` и `NETWORK_SCANNER`. Для Polygon публичный `polygon-rpc.com` отключён — нужен endpoint оператора | `https://YOUR_EVM_RPC_HOST` |
| `CAPY_CHAIN_ID` | ID сети. DogeOS testnet = `6281971`. Polygon mainnet = `137` | `6281971` |
| `NETWORK_SCANNER` | Базовый URL обозревателя для людей (`http` или `https`). Это не ключ индексатора | `https://dogeos-testnet.l2scan.co/` |
| `SCANNER` | Устаревший алиас `NETWORK_SCANNER`. Читается только если `NETWORK_SCANNER` пуст. Не задавай оба | (пусто) |
| `CAPY_TOKEN_ADDRESS` | Адрес контракта токена $CAPY | `0x…` |
| `PARENT_ADDRESS` | Твой адрес (обменник/получатель) | `0x…` |
| `PARENT_PRIVATE_KEY` | Твой приватный ключ (нужен для выплат детям) | `0x…` |
| `TRISTAN_ADDRESS` / `TRISTAN_PRIVATE_KEY` | Кошелёк Тристана | `0x…` |
| `BASTIAN_ADDRESS` / `BASTIAN_PRIVATE_KEY` | Кошелёк Бастиана | `0x…` |
| `CAPY_DAILY_TRISTAN` | Дневная ставка Тристана в $CAPY | `5` |
| `CAPY_DAILY_BASTIAN` | Дневная ставка Бастиана в $CAPY | `5` |
| `CAPY_MODE` | Режим: `mock` (тест) или `gfl_reality` (бой). Нет строки = `mock` | `mock` |
| `DEPLOYER_ADDRESS` | Адрес кошелька, который деплоит и минтит контракт (действия 51 и 52) | `0x…` |
| `DEPLOYER_PRIVATE_KEY` | Приватный ключ deployer (`0x` можно и без него) | `0x…` |
| `SCANNER_API_KEY` | Необязательно. Ключ indexer API. Без ключа действие 2 берёт actual из журнала и не сканирует цепь | (пусто) |
| `SCANNER_API_BASE` | Необязательно. База indexer API. Если пусто — `https://api.etherscan.io/v2/api`. Chain id запроса = `CAPY_CHAIN_ID` | `https://api.etherscan.io/v2/api` |
| `POLYGONSCAN_API_KEY` / `POLYGONSCAN_API_BASE` | Устаревшие алиасы `SCANNER_API_*`. Читаются только если соответствующий `SCANNER_API_*` пуст | (пусто) |
| `POLYGONSCAN_CHAIN_ID` | Игнорируется. Chain id индексатора всегда равен `CAPY_CHAIN_ID` | — |
| `CAPY_RECONCILE` | Откуда брать actual в действии 2: `auto` (по умолчанию), `journal`, `indexer`, `blockscan`. Пусто = `auto`. Без ключа indexer это journal. С ключом — indexer. `CAPY_RECONCILE=blockscan` задаёт полный скан RPC даже если ключ задан | `auto` |

Если пропустить обязательную переменную или ошибиться в значении — скрипт **не запустится** и
понятно скажет, что не так.

Шаблон `capybara/.env.example` уже называет те же ключи: `NETWORK_SCANNER`, `SCANNER_API_*` и алиасы `POLYGONSCAN_*`. В свой `.env` не копируй чужой приватный ключ и не коммить файл с секретами.

---

## Switch network (EVM)

Чеклист смены сети: Polygon ↔ DogeOS и любая другая EVM. Секреты в примеры не входят. Предупреждение о полном скане блоков (пункт «не D») допустимо и не значит, что сеть настроена неверно.

**A. Сменить вместе**

- `CAPY_RPC_URL`
- `CAPY_CHAIN_ID`
- `CAPY_TOKEN_ADDRESS` (адрес $CAPY в этой сети)
- кошельки и deployer: `PARENT_*`, `TRISTAN_*`, `BASTIAN_*`, `DEPLOYER_*`
- `NETWORK_SCANNER`
- по желанию `SCANNER_API_KEY` и `SCANNER_API_BASE`

**B. Артефакты для действий 51 и 52**

Если деплой или доэмиссия нужны, а скомпилированных артефактов нет:

```bash
cd capybara && npm run compile
```

**C. Примеры без секретов**

DogeOS testnet:

- `CAPY_CHAIN_ID=6281971`
- `NETWORK_SCANNER=https://dogeos-testnet.l2scan.co/`
- `CAPY_RPC_URL=https://YOUR_EVM_RPC_HOST`

Polygon mainnet:

- `CAPY_CHAIN_ID=137`
- `NETWORK_SCANNER=https://polygonscan.com/`
- `CAPY_RPC_URL=https://YOUR_EVM_RPC_HOST`

---

## 2. Режимы: mock vs боевой

| В `capybara/.env` | Что происходит |
|------------------|----------------|
| строки нет / `CAPY_MODE=mock` | 🧪 **Тест.** Реальные чтения из сети, но переводы **не отправляются** — в логах `[MOCK] would transfer …`. Можно гонять сколько угодно. |
| `CAPY_MODE=gfl_reality` | 🔴 **Бой.** Реальные переводы $CAPY. Перед действием — жёлтый баннер-предупреждение. |

Совет: сначала прогони нужную команду в `mock`, посмотри числа в логах, и только потом переключай
на `gfl_reality`.

---

## 3. Команды

### Помощник: собрать команду из свободного описания

В новом чате приложи этот файл (`@capybara/docs/manuals/USER-MANUAL.md`).

1. **P1** — экспертное интервью. Когда все обязательные поля есть — **сразу** выдаёт
   `## Готовая команда` (не останавливается на «вставь P2»).
2. **P2** — если уже есть параметры/бриф: только собрать команду, без повторного брифа.

Канонический хвост (корень DOGEstonia): `node capybara/cli/capybara.js`.

#### P1 — экспертный диалог (система команд → команда)

```text
Ты — эксперт по семейному Capybara CLI и учебной модели (действия 0–4, 6, 7, 51 и 52: долг, аванс, деплой и доэмиссия контракта).
На входе приложен этот же USER-MANUAL — единственный SSOT.

Задача P1: в диалоге понять запрос, согласовать действие и параметры. Когда обязательные поля
для выбранного action заполнены (gaps пуст) — СРАЗУ выдай итоговую bash-команду. Не проси
оператора отдельно вставлять P2. Не запускай команды.

Правила:
1) Только USER-MANUAL (§3). Не выдумывай действия и env. Разрешены только 0–4, 6, 7, 51 и 52.
2) Отличай: 0 проверка; 1 sweep; 2 дневные; 3 пул; 4 зачёт активности; 51 деплой контракта; 52 доэмиссия. Не путай 3 и 4. Не путай 51/52 с браузерным mint.
3) Action 4: system cidead|ru; level; period?; subject; activity type; subtype?; template?;
   metric value; выплата да/нет + amount. Коды subtype — транслит
   (dictant|samostoyatelnaya|controlnaya|entrega), не кириллица в CAPYBARA_SUBTYPE.
   Subject — slug как в примерах мануала (algebra, russkiy, matematicas).
   CAPYBARA_METRIC_VALUE — числовая строка без суффикса «%» (40.5 не 40.5%).
4) Пока gaps не пуст — короткие уточнения. Не выдавай «Запрос на действие» как финальный
   deliverable вместо команды.
5) Хвост команды всегда: node capybara/cli/capybara.js
   Запрещено: node scripts/capybara.js
6) Default CAPY_MODE=mock, если оператор явно не сказал gfl_reality.
7) Когда gaps пуст — финал ответа ТОЛЬКО такой формы (без преамбулы про бриф):

## Готовая команда
(одна строка или многострочный блок с \ )
Перед боем: чеклист §6 мануала.

Опционально (не вместо команды): краткий список params одной строкой.

Оператор сейчас опишет задачу своими словами.
```

#### P2 — собрать исполняемую команду

```text
Ты — компилятор команд Capybara CLI. Вход: USER-MANUAL + параметры/бриф оператора (если есть).

Задача P2: собрать одну целевую bash-команду. Deliverable — только готовая команда, не бриф
и не handoff «вставь другой промпт». Не запускай команды.

Правила:
1) Только env и действия 0–4, 6, 7, 51 и 52 из мануала. Не выдумывай CLI.
2) Если данных хватает — сразу ## Готовая команда. Интервью только если не хватает
   обязательных полей; не предлагай «Запрос на действие» вместо команды.
3) Не пиши преамбулы вроде «собираю по брифу P1» — максимум одна короткая строка, затем команда.
4) Ограничения: all только action 3; action 4 только tristan|bastian; RU payout → custom
   CAPYBARA_AMOUNT (или 0 / SKIP_PAYOUT=1); CIDEAD auto; score 0 → без payout.
5) Action 4 коды: subtype транслит (samostoyatelnaya и т.д.); subject slug; METRIC_VALUE без «%».
6) Хвост всегда: node capybara/cli/capybara.js
   Запрещено: node scripts/capybara.js
7) Default CAPY_MODE=mock, если не сказали бой.
8) Финал:

## Готовая команда
…
Перед боем: чеклист §6 мануала.

Оператор сейчас даст параметры или уточнит запрос.
```

### 🩺 Действие 0 — Проверка (ничего не двигает)

```bash
CAPYBARA_ACTION=0 node capybara/cli/capybara.js
```
Покажет: текущий режим (mock/боевой), сеть, адрес токена, символ токена, список кошельков. Хорошо
запускать первым, чтобы убедиться, что всё настроено.

---

### 📤 Действие 1 — Sweep: снять $CAPY с ребёнка себе

**Весь баланс** ребёнка → родителю (кошелёк обнуляется):
```bash
CAPYBARA_ACTION=1 CAPYBARA_WALLET=tristan node capybara/cli/capybara.js
```

**Конкретную сумму**:
```bash
CAPYBARA_ACTION=1 CAPYBARA_WALLET=tristan CAPYBARA_AMOUNT=10.5 node capybara/cli/capybara.js
```

Параметры:

| Параметр | Значение | Обязательный |
|----------|----------|--------------|
| `CAPYBARA_ACTION=1` | номер действия (sweep) | да |
| `CAPYBARA_WALLET` | чей кошелёк: `tristan` или `bastian` | да |
| `CAPYBARA_AMOUNT` | сколько $CAPY перевести; **пропусти** — уйдёт весь баланс | нет |

Подпись делает сам ребёнок (его ключ из env), получатель — `PARENT_ADDRESS`. В логах видно баланс
до/после и сколько переведено.

---

### 🦫 Действие 2 — Дневные выплаты ребёнку

Считает недоплату за период, показывает разбивку по дням и **спрашивает подтверждение** перед
переводом. Требует живого терминала (интерактивно).

**За период по умолчанию** (с последней выплаты по сегодня):
```bash
CAPYBARA_ACTION=2 CAPYBARA_WALLET=tristan node capybara/cli/capybara.js
```

**За конкретный период**:
```bash
CAPYBARA_ACTION=2 CAPYBARA_WALLET=tristan CAPYBARA_FROM=2026-06-01 CAPYBARA_TO=2026-06-30 node capybara/cli/capybara.js
```

Параметры:

| Параметр | Значение | Обязательный |
|----------|----------|--------------|
| `CAPYBARA_ACTION=2` | номер действия (дневные выплаты) | да |
| `CAPYBARA_WALLET` | `tristan` или `bastian` | да |
| `CAPYBARA_FROM` | начало периода `ГГГГ-ММ-ДД`; **пропусти** — возьмётся день после последней выплаты из лога | нет |
| `CAPYBARA_TO` | конец периода `ГГГГ-ММ-ДД`; **пропусти** — сегодня | нет |

Как это выглядит:
1. Считает ожидаемое (ставка × дни) и actual: из журнала, из indexer или из скана — по режиму ниже.
2. Печатает по дням: `· 30.06: ожидалось 5 · выплачено 5 ✅` / `❗ долг 5`.
3. Показывает итог: `🧮 К доплате: 15 CAPY`.
4. Спрашивает: `❓ Подтвердить перевод 15 CAPY на Tristan? (да/нет)` — ответь `да`, чтобы отправить.
5. Пишет результат в лог.

Если долг = 0 — просто скажет «🎉 Всё выплачено» и ничего не отправит.

`CAPY_RECONCILE` выбирает источник: `auto` (по умолчанию), `journal`, `indexer` или `blockscan`. Без `SCANNER_API_KEY` и без алиаса `POLYGONSCAN_API_KEY` действие 2 берёт actual из журнала и не сканирует цепь. В логе будет `сверка по журналу (цепь не сканировалась; риск ручных tx на операторе)`. Журнал доверяет записям CLI: перевод, которого нет в NDJSON, в сверке не виден. Если ключ задан, сверка идёт в indexer API, а chain id запроса равен `CAPY_CHAIN_ID`. Если indexer не ответил — `⚠️ Индексатор не ответил (ключ задан) — сверка через полный скан RPC (медленно)`, дальше полный скан. `CAPY_RECONCILE=blockscan` задаёт полный скан RPC даже если ключ задан.

Если у сети есть Etherscan-compatible tokentx API, попроси ключ у фаундера сети и положи его в `SCANNER_API_KEY`. Не вписывай ключ в этот мануал.

---

### 💸 Действие 3 — Списание в пул (с ребёнка или со всех)

Снять $CAPY с ребёнка в общий котёл (на `PARENT_ADDRESS`). Списание идёт **с ребёнка** (подпись
ребёнка). Спрашивает подтверждение перед реальной отправкой.

**С одного ребёнка** заданную сумму:
```bash
CAPYBARA_ACTION=3 CAPYBARA_WALLET=tristan CAPYBARA_AMOUNT=100 node capybara/cli/capybara.js
```
Если у ребёнка меньше на балансе — спишет доступное (частично) и пометит недобор.

**Со всех детей** — указанная сумма делится между ними (по умолчанию поровну):
```bash
CAPYBARA_ACTION=3 CAPYBARA_WALLET=all CAPYBARA_AMOUNT=100 node capybara/cli/capybara.js
```

**Со всех, но по процентам** (когда расходы пошерены неравно; проценты в сумме = 100):
```bash
CAPYBARA_ACTION=3 CAPYBARA_WALLET=all CAPYBARA_AMOUNT=100 CAPYBARA_SPLIT=tristan:60,bastian:40 node capybara/cli/capybara.js
```

Параметры:

| Параметр | Значение | Обязательный |
|----------|----------|--------------|
| `CAPYBARA_ACTION=3` | номер действия (списание в пул) | да |
| `CAPYBARA_WALLET` | `tristan`, `bastian` или `all` | да |
| `CAPYBARA_AMOUNT` | сумма $CAPY; для `all` — **общая** сумма на всех | да |
| `CAPYBARA_SPLIT` | доли для `all`, напр. `tristan:60,bastian:40` (сумма = 100). Пропусти — поровну | нет |

Важно про `all`: это **несколько транзакций** (по одной с каждого ребёнка). Сначала идёт
**предпроверка** — если у кого-то не хватает его доли, ничего не списывается и покажет, у кого мало.
Если во время отправки одна транзакция не прошла — остальные продолжатся, а в конце будет отчёт
«успешно N из M».

---

### 🎓 Действие 4 — Выплаты за активность (метрики + опц. $CAPY)

Зачёт учебной активности: запись `activity_validated` в журнал и опциональная выплата $CAPY
родитель→ребёнок (`payout` с тем же `submission_id`). Только `tristan`|`bastian` (не `all`).
Не путать с CAPY-10 Pay Entrega.

**Mock (рекомендуется для проверки):**
```bash
CAPY_MODE=mock \
CAPYBARA_ACTION=4 \
CAPYBARA_WALLET=tristan \
CAPYBARA_SYSTEM=cidead \
CAPYBARA_LEVEL=primaria-3 \
CAPYBARA_PERIOD=T1 \
CAPYBARA_SUBJECT=matematicas \
CAPYBARA_ACTIVITY_TYPE=control \
CAPYBARA_SUBTYPE=controlnaya \
CAPYBARA_METRIC_VALUE=8.5 \
node capybara/cli/capybara.js
```
CIDEAD auto: score `8.5` → amount по `score_digit_scale` (`85`); score `0` → только метрики, без `payout`.

**RU (custom amount обязателен, если нужна выплата):**
```bash
CAPYBARA_ACTION=4 CAPYBARA_WALLET=bastian \
CAPYBARA_SYSTEM=ru CAPYBARA_LEVEL=grade-8 CAPYBARA_SUBJECT=russkiy \
CAPYBARA_ACTIVITY_TYPE=control CAPYBARA_SUBTYPE=dictant \
CAPYBARA_METRIC_VALUE=2 CAPYBARA_AMOUNT=50 \
node capybara/cli/capybara.js
```
Без `CAPYBARA_AMOUNT` при `ru` → понятная ошибка `custom_only`. Только метрики: `CAPYBARA_AMOUNT=0` или `CAPYBARA_SKIP_PAYOUT=1`.

Параметры:

| Параметр | Значение | Обязательный |
|----------|----------|--------------|
| `CAPYBARA_ACTION=4` | выплаты за активность | да |
| `CAPYBARA_WALLET` | `tristan` или `bastian` | да |
| `CAPYBARA_SYSTEM` | `cidead` \| `ru` | да |
| `CAPYBARA_LEVEL` | код уровня (напр. `primaria-3`) | да |
| `CAPYBARA_PERIOD` | период (напр. `T1`) | нет |
| `CAPYBARA_SUBJECT` | предмет | да |
| `CAPYBARA_ACTIVITY_TYPE` | `control` \| `exam` | да |
| `CAPYBARA_SUBTYPE` | subtype control | нет |
| `CAPYBARA_TEMPLATE_ID` | id шаблона каталога | нет |
| `CAPYBARA_METRIC_VALUE` | оценка / метрика (строка) | да |
| `CAPYBARA_AMOUNT` | custom сумма; `auto`/omit для CIDEAD; `0` = без payout | см. выше |
| `CAPYBARA_SKIP_PAYOUT` | `1` — только метрики | нет |

В `gfl_reality` при amount>0 спросит подтверждение в TTY (как действия 2/3). При ошибке transfer журнал не пишется (rollback).

Если задан непустой `CAPYBARA_ADVANCE_ID` и выплата нужна, action 4 до confirm и до журнала активности проверяет открытый аванс того же ребёнка: `баланс_сейчас + сумма_payout ≥ остаток_аванса`. Не проходит — не пишутся ни payout, ни settle. Проходит — в бою один вопрос показывает выплату и возврат в пул, затем payout, затем закрытие аванса. Без id action 4 аванс не трогает. `settle` как операция action 7 — отдельный ручной возврат, не этот хук.

---

### 📒 Действие 6 — Журнал долга ребёнка

Отдельный журнал обязательств. Это не действие 2 и не действие 3: выплата и списание в пул сами по себе долг не закрывают. Кошелёк только `tristan` или `bastian`. Мутации спрашивают подтверждение в живом терминале. `summary` и `show` подтверждения не требуют.

`CAPY_MODE=mock` не отправляет живой transfer: `CapyToken` пишет `[MOCK] would transfer` и возвращает синтетический hash. Запись долга в mock лежит под `logs/capybara/debt/mock/` и не меняет боевой файл.

`CAPYBARA_DEBT_AMOUNT` — человеческая сумма (`5` или `5.555`) с числом знаков не больше decimals токена. Журнал хранит целое raw и `amount_unit: token_raw`. Старый журнал без этой метки один раз умножается на `10^decimals`.

Канон проверки остатка — `summary` или `show`. После успеха CLI пишет в stdout один JSON: raw `outstanding` / `card.remainder` и поля `*_human`. Ручной разбор NDJSON для вердикта не нужен. Эталон метода: [`analysis-tristan-debt-remainder-method-2026-11-09.md`](../analysis/analysis-tristan-debt-remainder-method-2026-11-09.md).

Карточка также отдаёт `original_human`, `settled_human`, `fines_human`, `forgiven_human` (плюс существующий `remainder_human`).

Оператор читает human-блок на **stderr**: `outstanding_human` (или `remainder_human` у `show`), таблица `debt_id | comment | original | settled | remainder` и строка `read-only` / `confirmed: false` — перевод не создаётся. Скрипты читают **одну** JSON-строку на stdout (`op` = `summary` или `show`). UX-эталон таблицы: [`analysis-tristan-debt-summary-cli-2026-11-09.md`](../analysis/analysis-tristan-debt-summary-cli-2026-11-09.md). Строки Logger по-прежнему могут идти в stdout рядом с JSON.

Пример из корня DOGEstonia (`gfl_reality`, кошелёк `tristan`):

```bash
CAPY_MODE=gfl_reality CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=summary \
node capybara/cli/capybara.js
```

```bash
CAPY_MODE=gfl_reality CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=show CAPYBARA_DEBT_ID=debt-001-260901 \
node capybara/cli/capybara.js
```

**Частичное погашение** (перевод в пул только на указанную сумму; остаток долга уменьшается после подтверждённого receipt):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=repay CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_AMOUNT=5.555 \
node capybara/cli/capybara.js
```

**Частичное прощение** (баланс токена не меняется, причина обязательна):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=forgive CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_AMOUNT=10 \
CAPYBARA_DEBT_REASON=family \
node capybara/cli/capybara.js
```

**Санкция** (строка журнала, устройство не управляется). Для `gadget` нужен список дат:

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=sanction-add CAPYBARA_DEBT_ID=debt-1 \
CAPYBARA_DEBT_SANCTION_TYPE=gadget CAPYBARA_DEBT_DATES=2026-11-01 \
CAPYBARA_DEBT_REASON=late \
node capybara/cli/capybara.js
```

**Сверка** уже отправленного погашения. Новый transfer не создаётся. Нужен `CAPYBARA_DEBT_OPERATION_ID` исходной операции:

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=reconcile CAPYBARA_DEBT_OPERATION_ID=op-1 \
node capybara/cli/capybara.js
```

**Создать долг** (только журнал, баланс токена не меняется):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=create CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_AMOUNT=20 \
CAPYBARA_DEBT_REASON=loan \
node capybara/cli/capybara.js
```

**Поставить срок:**

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=set-due CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_DUE=2026-11-01 \
CAPYBARA_DEBT_REASON=agreed \
node capybara/cli/capybara.js
```

**Штраф** (человеческая сумма, например `5` или `5.555`; причина обязательна):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=fine CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_AMOUNT=5 \
CAPYBARA_DEBT_REASON=late \
node capybara/cli/capybara.js
```

**Отмена штрафа** (`CAPYBARA_DEBT_FINE_ID` — `event_id` строки `fine`):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=cancel-fine CAPYBARA_DEBT_ID=debt-1 CAPYBARA_DEBT_FINE_ID=fine-1 \
CAPYBARA_DEBT_REASON=mistake \
node capybara/cli/capybara.js
```

**Снять санкцию:**

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=sanction-cancel CAPYBARA_DEBT_SANCTION_ID=san-1 \
CAPYBARA_DEBT_REASON=done \
node capybara/cli/capybara.js
```

**Решения по санкциям закрытого долга** (`leave` оставляет, `cancel` снимает; штраф не входит в список):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=resolve-closure CAPYBARA_DEBT_ID=debt-1 \
CAPYBARA_DEBT_DECISIONS=san-1:leave \
node capybara/cli/capybara.js
```

**Сводка и карточка** (без подтверждения):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=summary \
node capybara/cli/capybara.js
```

```bash
CAPY_MODE=mock CAPYBARA_ACTION=6 CAPYBARA_WALLET=tristan \
CAPYBARA_DEBT_OP=show CAPYBARA_DEBT_ID=debt-1 \
node capybara/cli/capybara.js
```

Сумма, процент и `CAPYBARA_DEBT_ALL=true` взаимоисключающие. Закрытие долга с активными санкциями без TTY требует `CAPYBARA_DEBT_DECISIONS` до перевода. Полный список подопераций — в `capybara/.env.example`.

---

### 🏦 Действие 7 — Аванс ребёнку

Отдельный журнал обязательств до выплаты за активность. Это не действие 6 и не `charge`. Кошелёк только `tristan` или `bastian`. Операции: `issue`, `forgive`, `settle`, `summary`, `show` (`CAPYBARA_ADVANCE_OP`). `issue`, `forgive` и `settle` в `gfl_reality` ждут TTY. `summary` и `show` подтверждения не требуют: один JSON в stdout и человеческий блок в stderr.

`CAPYBARA_ADVANCE_AMOUNT` — человеческая сумма. Журнал хранит raw. Mock не шлёт живой transfer: hash `mock:<advance_id>`, файл под `logs/capybara/advance/mock/`. Бой пишет в `logs/capybara/advance/`.

**Выдать 400 в mock:**

```bash
CAPY_MODE=mock CAPYBARA_ACTION=7 CAPYBARA_WALLET=tristan \
CAPYBARA_ADVANCE_OP=issue CAPYBARA_ADVANCE_AMOUNT=400 \
CAPYBARA_ADVANCE_REASON=activity\ float CAPYBARA_ADVANCE_ID=adv-400 \
node capybara/cli/capybara.js
```

**Закрыть вручную** (остаток целиком, ребёнок → пул; в mock перевода нет):

```bash
CAPY_MODE=mock CAPYBARA_ACTION=7 CAPYBARA_WALLET=tristan \
CAPYBARA_ADVANCE_OP=settle CAPYBARA_ADVANCE_ID=adv-400 \
node capybara/cli/capybara.js
```

**Простить** без transfer, причина обязательна:

```bash
CAPY_MODE=mock CAPYBARA_ACTION=7 CAPYBARA_WALLET=tristan \
CAPYBARA_ADVANCE_OP=forgive CAPYBARA_ADVANCE_ID=adv-400 \
CAPYBARA_ADVANCE_REASON=waived \
node capybara/cli/capybara.js
```

Повторный `settle` или `forgive` уже закрытого аванса — ошибка. Второй открытый аванс при лимите `max_open` отказывается, пока нет `CAPYBARA_ADVANCE_OVERRIDE_REASON`.

---

### 🚀 Действие 51 — Задеплоить контракт $CAPY

Деплой `CapybaraToken` с кошелька deployer. `CAPY_TOKEN_ADDRESS` для этого действия **не** нужен: адреса ещё нет. Нужны `DEPLOYER_ADDRESS` и `DEPLOYER_PRIVATE_KEY`.

**Mock (транзакции нет, в журнале `token_deployed` с `wouldDeploy`):**
```bash
CAPY_MODE=mock CAPYBARA_ACTION=51 node capybara/cli/capybara.js
```

**Бой (`gfl_reality`):** тот же вызов при `CAPY_MODE=gfl_reality`. Терминал спросит подтверждение. В логе будет адрес и строка, которую нужно скопировать в `capybara/.env`:

`CAPY_TOKEN_ADDRESS=0x…`

Файл `.env` сам не переписывается — адрес копирует оператор, затем перезапускает остальные действия.

### 🪙 Действие 52 — Доэмиссия на уже задеплоенном контракте

Нужен `CAPY_TOKEN_ADDRESS` (из шага 51), `CAPYBARA_AMOUNT` (человеческое число, 8 знаков) и deployer. `CAPYBARA_TO` необязателен: без него токены уходят на `DEPLOYER_ADDRESS`.

**Mock:**
```bash
CAPY_MODE=mock CAPYBARA_ACTION=52 CAPYBARA_AMOUNT=1 node capybara/cli/capybara.js
```

**Бой, явный получатель:**
```bash
CAPY_MODE=gfl_reality CAPYBARA_ACTION=52 CAPYBARA_AMOUNT=1 CAPYBARA_TO=0x… node capybara/cli/capybara.js
```

В mock журнал получает `token_minted` и перевод не уходит. В бою — TTY, затем `mint`, в логе hash транзакции.

Браузерная доэмиссия $CAPY — **параллельный** путь и этими командами **не заменяется**. Инструкция страницы: [README-mint.md](../../scripts/README-mint.md).

---

## 4. Где логи операций

`capybara/logs/capybara/<кошелёк>.ndjson` (например `capybara/logs/capybara/tristan.ndjson`) — боевой
журнал; тестовые (mock) записи лежат отдельно в `capybara/logs/capybara/mock/<кошелёк>.ndjson`. Папки
создаются сами. Одна строка — одна запись; поле `type` показывает вид: `day`/`payment` (действие 2),
`sweep` (действие 1), `charge` (действие 3), `activity_validated`/`payout` (действие 4),
`token_deployed` (действие 51), `token_minted` (действие 52). Файл 51/52 назван адресом deployer. Журнал долга (действие 6) лежит отдельно: `capybara/logs/capybara/debt/<scope>/<ребёнок>.ndjson`, mock — в `capybara/logs/capybara/debt/mock/`. Журнал аванса (действие 7) — `capybara/logs/capybara/advance/…`, mock — `capybara/logs/capybara/advance/mock/`. Из боевого журнала выплат берётся «последняя выплата», когда в
действии 2 не задан `CAPYBARA_FROM` (учитываются только строки `day`).

Посмотреть:
```bash
cat capybara/logs/capybara/tristan.ndjson
```

📖 Полное описание журнала (все поля, примеры, как читать, тех-детали) — в [LOGGING.md](LOGGING.md).

---

## 5. Частые сообщения и что они значат

| Сообщение | Что делать |
|-----------|-----------|
| `❌ Capybara configuration validation failed: … is required` | В `capybara/.env` пропущена обязательная переменная — впиши её |
| `CAPY_MODE must be one of: mock, gfl_reality` | Опечатка в `CAPY_MODE` — только `mock` или `gfl_reality` |
| `[MOCK] would transfer …` | Ты в тестовом режиме, перевод не ушёл. Для реального — `CAPY_MODE=gfl_reality` |
| `⚠️ БОЕВОЙ РЕЖИМ: … реальные переводы включены!` | Предохранитель снят — деньги реально уйдут |
| `🚫 Сумма … больше баланса…` | Не хватает средств (на кошельке ребёнка для sweep, или у родителя для выплаты) |
| `Подтверждение выплаты требует интерактивный TTY` | Действия 2/3 нельзя запускать не в терминале — запусти вручную в терминале |
| `🛑 Отменено — ничего не отправлено` | Ты ответил «нет» на подтверждение |
| `🎉 Всё выплачено за период` | Долга нет, доплачивать нечего |
| `сверка по журналу (цепь не сканировалась; риск ручных tx на операторе)` | Действие 2 не сканировало цепь: actual взят из журнала. Перевод вне CLI в сверке не виден. Для indexer задай `SCANNER_API_KEY` |
| `⚠️ Индексатор не ответил (ключ задан) — сверка через полный скан RPC (медленно)` | Ключ задан, indexer не ответил, дальше полный скан блоков. Это допустимо |
| `⚠️ Нехватка баланса — спишу доступное …` (действие 3) | У ребёнка меньше запрошенного — спишется доступное, недобор пометится в журнале |
| `🚫 Предпроверка не пройдена — недостаточно средств` (действие 3 `all`) | У кого-то не хватает его доли — списание не начато; показано, у кого мало |
| `📊 Итог all: успешно N/M` (действие 3 `all`) | Отчёт по батчу: сколько списаний прошло из общего числа |

---

## 6. Чеклист боевого запуска (перед реальными деньгами)

1. `CAPYBARA_ACTION=0 node capybara/cli/capybara.js` — проверь, что режим и сеть верные.
2. Прогони нужное действие в **mock** (`CAPY_MODE=mock` или без строки) — посмотри суммы в логах.
3. Убедись, что на кошельке есть средства (у ребёнка — для sweep и списания в пул; у родителя `PARENT_ADDRESS` — для выплаты).
4. Поставь `CAPY_MODE=gfl_reality` в `capybara/.env`.
5. Запусти команду; для действий 2 и 3 внимательно прочитай сумму(ы) и ответь `да`.
6. Верни `CAPY_MODE=mock` после боевого запуска, чтобы случайно не отправить снова.

---

## 7. Подробный отладочный лог (если что-то не так)

Добавь `LOG_LEVEL=debug` в начало команды:
```bash
LOG_LEVEL=debug CAPYBARA_ACTION=0 node capybara/cli/capybara.js
```

---

## Related

- Identity HTTP edge (Phase 2 operator): [IDENTITY-HTTP-EDGE-MANUAL.md](./IDENTITY-HTTP-EDGE-MANUAL.md)
- Wallet address-proof Channel A (desktop MetaMask extension): [WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md)
- Эпик сети: [EPIC-SCR-CAPY-EVM](../tasks/epics/EPIC-SCR-CAPY-EVM/EPIC-SCR-CAPY-EVM.md)
- Зафиксированные ответы: [INTERVIEW-CAPY-EVM-NETWORK-2026-10-14](../tasks/backlog-stories/capybara-evm/INTERVIEW-CAPY-EVM-NETWORK-2026-10-14.md)
- Техника: [ARCHITECTURE.md](ARCHITECTURE.md)
