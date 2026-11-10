# Capybara — журнал операций ($CAPY ledger)

Единый источник правды по логированию денежных действий Capybara. Всё подтверждено по коду
(ссылки `file:line` кликабельны). Архитектура инструмента — [ARCHITECTURE.md](ARCHITECTURE.md),
запуск команд — [USER-MANUAL.md](USER-MANUAL.md).

> Введён в STORY-SCR-CAPY-04 (журнал выплат) и обобщён в STORY-SCR-CAPY-05 (единый типизированный
> журнал: charge + ретрофит sweep). Аудиты — в [`../analysis/`](../analysis/).

---

# ЧАСТЬ 1 — Как пользоваться (для оператора)

## 1.1 Зачем нужен журнал

Каждое денежное действие Capybara дописывает строку в локальный **журнал операций** — чтобы в любой
момент видеть: кому/сколько/когда/каким переводом (`txHash`) и в каком режиме. Отсюда же действие 2
(дневные выплаты) берёт «дату последней выплаты», когда период не задан вручную.

## 1.2 Где лежат файлы

| Режим | Папка | Пример файла |
|-------|-------|--------------|
| 🔴 боевой (`CAPY_MODE=gfl_reality`) | `capybara/logs/capybara/` | `capybara/logs/capybara/tristan.ndjson` |
| 🧪 тест (`mock`, по умолчанию) | `capybara/logs/capybara/mock/` | `capybara/logs/capybara/mock/tristan.ndjson` |

- Файл **на каждый кошелёк-ребёнок** отдельно: `tristan.ndjson`, `bastian.ndjson`.
- Папки создаются автоматически при первой записи ([ndjsonLogWriter.js:15-17](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L15)).
- **Боевые и тестовые записи разделены** — mock-прогоны не пачкают боевой журнал
  ([ndjsonLogReader.js:30-32](../../packages/core/src/daily-payments/ndjsonLogReader.js#L30)).

Журнал долга (действие 6) — другой каталог, не `<кошелёк>.ndjson` выплат:

| Режим | Папка | Пример файла |
|-------|-------|--------------|
| 🔴 боевой (`CAPY_MODE=gfl_reality`) | `capybara/logs/capybara/debt/<scope>/` | `capybara/logs/capybara/debt/gfl_reality--<chain>--<token>--<pool>/tristan.ndjson` |
| 🧪 тест (`mock` и любой режим кроме `gfl_reality`) | `capybara/logs/capybara/debt/mock/<scope>/` | `capybara/logs/capybara/debt/mock/mock--<chain>--<token>--<pool>/tristan.ndjson` |

`<scope>` — `mode--chainId--token--pool` ([debtPath.js](../packages/core/src/debt/debtPath.js)). Смена сети, токена, пула или кошелька открывает другой файл. Строка `charge` / `payment` в журнале выплат долг не уменьшает.

Журнал аванса (действие 7) — третий каталог. Бой только при `gfl_reality`. Любой другой режим пишет в `mock/` и боевой файл не меняет ([advancePath.js](../packages/core/src/advance/advancePath.js)).

| Режим | Папка | Пример файла |
|-------|-------|--------------|
| 🔴 боевой (`CAPY_MODE=gfl_reality`) | `capybara/logs/capybara/advance/<scope>/` | `capybara/logs/capybara/advance/gfl_reality--<chain>--<token>--<pool>/tristan.ndjson` |
| 🧪 тест (`mock` и любой режим кроме `gfl_reality`) | `capybara/logs/capybara/advance/mock/<scope>/` | `capybara/logs/capybara/advance/mock/mock--<chain>--<token>--<pool>/tristan.ndjson` |

## 1.3 Формат: NDJSON

**NDJSON** = «одна строка — один JSON-объект». Файл читается построчно; каждая строка —
самостоятельная запись. Денежные суммы для `day` / `payment` / `sweep` / `charge` хранятся в
**сырых единицах токена** (raw, целое число без точки) — для $CAPY у токена 8 знаков после запятой
(`decimals = 8`), т.е. `22200000000` = `222.00000000 $CAPY`.

**Исключение (действие 4):** поле `payout.amount` — **human** digit-scale / custom CAPY-строка
(например `"85"`), не raw token units. On-chain transfer всё равно идёт через `parseAmountHuman`
→ raw; в журнал пишется human (см. §1.5 `payout`).

У каждой строки есть поле **`type`** — оно определяет, что это за запись.

## 1.4 Типы записей и когда они пишутся

| `type` | Кто пишет | Когда |
|--------|-----------|-------|
| `day` | Действие 2 (дневные выплаты) | при каждом прогоне — по строке на каждый день периода (дедуп по дате) |
| `payment` | Действие 2 | когда выплата родитель→ребёнок реально сделана (или mock) |
| `sweep` | Действие 1 (вывод ребёнок→родитель) | после успешного перевода |
| `charge` | Действие 3 (списание в пул) | после каждого успешного списания (для `all` — по строке на ребёнка) |
| `activity_validated` | Действие 4 (зачёт активности) | всегда при успешном commit (метрики) |
| `payout` | Действие 4 | если amount>0 и transfer ok; тот же `submission_id`, что у `activity_validated` |
| `token_deployed` | Действие 51 (деплой контракта) | mock (`wouldDeploy`) и `gfl_reality` (адрес + txHash) |
| `token_minted` | Действие 52 (доэмиссия) | mock и `gfl_reality` после успешного mint |

> ⚠️ Направление денег зависит от типа: `payment` / `payout` — родитель→ребёнок (`from`=родитель, `to`=ребёнок);
> `sweep`/`charge` — ребёнок→родитель (`from`=ребёнок, `to`=родитель).
> Пара `activity_validated`+`payout` пишется одним atomic append (ACT-02); fail transfer → rollback (0 строк).
> `token_deployed` / `token_minted` пишутся в `<deployer>.ndjson` (mock → `logs/capybara/mock/`). Отмена TTY строку не создаёт.

### `token_deployed` — деплой (действие 51)
Поля: `type`, `ts`, `mode`, `deployer`, `address` или `wouldDeploy`, `txHash` (может быть null), `chainId`, `mock`.

### `token_minted` — доэмиссия (действие 52)
Поля: `type`, `ts`, `mode`, `token`, `to`, `amountHuman`, `amountWei`, `txHash` (может быть null), `mock`.

Пропуски (баланс 0, долг 0, отмена «нет», ошибка до перевода) записи о переводе **не создают**
(для действия 2 строки `day` при этом всё равно пишутся).

## 1.5 Поля по типам (с примерами)

### `day` — сверка одного дня (действие 2)
Поля: `date`, `expected` (ставка/день, raw), `actual` (реально пришло за день, raw), `match`, `owed` (недоплата, raw).
```json
{"type":"day","date":"2026-06-17","expected":"22200000000","actual":"0","match":false,"owed":"22200000000"}
```

### `payment` — выплата ребёнку (действие 2)
```json
{"type":"payment","paid_total":"333000000000","date":"2026-07-01","txHash":"0xfaf6…8cbb","confirmed":true,"mock":false,"period":{"from":"2026-06-17","to":"2026-07-01"},"days":["2026-06-17","…"],"from":"0x12Dc…A8F4","to":"0x9dD2…34E3","block":89481653,"timestamp":"2026-07-01T17:37:54.152Z","launched_by":"eslinko","mode":"gfl_reality"}
```
> `date` здесь = конец периода (`period.to`), а фактическое время запуска — в `timestamp` ([DailyPaymentsAction.js:117,123](../../packages/core/src/actions/DailyPaymentsAction.js#L117)).

### `sweep` — вывод с ребёнка родителю (действие 1)
```json
{"type":"sweep","amount":"1412416500000","from":"0x9dD2…34E3","to":"0x12Dc…A8F4","txHash":"0xfaf6…8cbb","block":89481653,"timestamp":"2026-07-01T17:37:54.152Z","launched_by":"eslinko","mode":"gfl_reality","mock":false}
```

### `charge` — списание в пул (действие 3)
Одиночный ребёнок (при нехватке добавляется `shortfall`):
```json
{"type":"charge","amount":"1000000000","requested":"1000000000","from":"0x9dD2…34E3","to":"0x12Dc…A8F4","txHash":"0x…","block":89500000,"timestamp":"2026-07-02T09:00:00.000Z","launched_by":"eslinko","mode":"gfl_reality","mock":false}
```
Режим `all` — по строке на ребёнка, с общими `split` и `batch_id`:
```json
{"type":"charge","amount":"5000000000","requested":"5000000000","from":"0x9dD2…34E3","to":"0x12Dc…A8F4","txHash":"0x…","block":89500001,"timestamp":"2026-07-02T09:00:01.000Z","launched_by":"eslinko","mode":"gfl_reality","mock":false,"split":{"mode":"equal","children":["tristan","bastian"]},"batch_id":"3f2a…"}
```
При процентном сплите `split` = `{"mode":"percent","children":[{"wallet":"tristan","percent":60},{"wallet":"bastian","percent":40}]}`.

### `activity_validated` — зачёт активности (действие 4)
Метрики без денежной суммы. Пара с `payout` (если amount>0) делит один `submission_id`.
```json
{"type":"activity_validated","submission_id":"a1b2c3d4-…","wallet":"tristan","system":"CIDEAD","level":"1","subject":"math","activityType":"homework","metricDef":{"id":"score_digit_scale","kind":"score"},"value":"8.5","direction":"child_to_parent","validatedBy":"parent","ts":"2026-09-28T14:00:00.000Z","mode":"mock"}
```
Опционально: `period`, `subtype`, `templateId`.

### `payout` — выплата за активность (действие 4)
> ⚠️ **`amount` = human** (digit-scale / custom), **не** raw. Пример: score `8.5` → `"85"`.
```json
{"type":"payout","submission_id":"a1b2c3d4-…","amount":"85","from":"0x12Dc…A8F4","to":"0x9dD2…34E3","txHash":null,"mock":true,"ts":"2026-09-28T14:00:00.000Z","mode":"mock"}
```

## 1.6 Как смотреть

```bash
# весь журнал ребёнка (боевой)
cat capybara/logs/capybara/tristan.ndjson

# только реальные списания в пул, покрасивее (нужен jq)
grep '"type":"charge"' capybara/logs/capybara/tristan.ndjson | jq .

# все записи одного all-прогона по batch_id
grep '"batch_id":"3f2a' capybara/logs/capybara/*.ndjson
```

## 1.7 Как журнал влияет на действие 2

Если в действии 2 не задан `CAPYBARA_FROM`, период начинается со дня **после последней даты**
`type:"day"` в **боевом** журнале ([ndjsonLogReader.js:49-74](../../packages/core/src/daily-payments/ndjsonLogReader.js#L49)).
`sweep`/`charge`-строки на это не влияют — учитываются только `day`. В `mock`-режиме читается
тоже боевой журнал (dry-run сверяется против реальной истории).

---

# ЧАСТЬ 2 — Техническая реализация и узкие места

## 2.1 Модули

| Файл | Роль |
|------|------|
| [ndjsonLogReader.js](../../packages/core/src/daily-payments/ndjsonLogReader.js) | пути и чтение: `DEFAULT_LOG_DIR`, `MOCK_LOG_SUBDIR`, `getProdLogDir`/`getMockLogDir`/`resolveLogDirForMode`, `getWalletLogPath`, `readLastLogDate`, `readExistingDayDates` |
| [ndjsonLogWriter.js](../../packages/core/src/daily-payments/ndjsonLogWriter.js) | запись: `ensureLogDir`, `appendDailyPaymentsLog` (day+payment), `appendTypedLedgerEntry` / `appendTypedLedgerEntries` (charge/sweep/activity batch) |
| [activityJournal.js](../../packages/core/src/daily-payments/activityJournal.js) | действие 4: `buildActivityValidatedEntry` / `buildPayoutEntry` / `stageAndCommitActivityJournal` → `appendTypedLedgerEntries` (atomic) |
| [runtimeContext.js](../../packages/core/src/runtimeContext.js) | `resolveLaunchedBy()` — `process.env.USER \|\| os.userInfo().username \|\| 'unknown'` |

## 2.2 Кто что пишет

| Действие | Вызов | Тип строк |
|----------|-------|-----------|
| 1 sweep | [SweepToParentAction._writeSweepJournal → appendTypedLedgerEntry](../../packages/core/src/actions/SweepToParentAction.js#L311); вызовы на mock- и боевом путях ([:185](../../packages/core/src/actions/SweepToParentAction.js#L185), [:245](../../packages/core/src/actions/SweepToParentAction.js#L245)) | `sweep` |
| 2 daily | [DailyPaymentsAction → appendDailyPaymentsLog](../../packages/core/src/actions/DailyPaymentsAction.js#L218) (+ [:270](../../packages/core/src/actions/DailyPaymentsAction.js#L270), [:317](../../packages/core/src/actions/DailyPaymentsAction.js#L317)) | `day` + `payment` |
| 3 charge | [ChargeToPoolAction._writeChargeJournal → appendTypedLedgerEntry](../../packages/core/src/actions/ChargeToPoolAction.js#L404) (single [:175](../../packages/core/src/actions/ChargeToPoolAction.js#L175), all [:297](../../packages/core/src/actions/ChargeToPoolAction.js#L297)) | `charge` |
| 4 activity | [ActivityPayoutAction → stageAndCommitActivityJournal](../../packages/core/src/actions/ActivityPayoutAction.js) → [appendTypedLedgerEntries](../../packages/core/src/daily-payments/ndjsonLogWriter.js) | `activity_validated` (+ `payout` если amount>0) |
| 51 deploy | [DeployCapybaraTokenAction._writeJournal → appendTypedLedgerEntry](../../packages/core/src/actions/DeployCapybaraTokenAction.js) | `token_deployed` |
| 52 mint | [MintCapybaraTokenAction._writeJournal → appendTypedLedgerEntry](../../packages/core/src/actions/MintCapybaraTokenAction.js) | `token_minted` |

## 2.3 Сериализация и целостность записи

- Суммы — `bigint`, при записи каждое поле-bigint приводится к строке ([ndjsonLogWriter.js:128-137](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L128)); в `appendDailyPaymentsLog` — явными `.toString()`.
- Одна запись пишется **одним** `fs.appendFile` ([:139](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L139)); `appendDailyPaymentsLog` за один вызов дописывает пачку `day`-строк + `payment` одной операцией ([:108](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L108)).
- Директория гарантируется `ensureLogDir` (`mkdir recursive`) перед каждой записью.

## 2.4 Дедупликация

- `day`-строки: перед записью читаются уже записанные даты (`readExistingDayDates`, фильтр `type==='day'`), дубли по дате пропускаются ([ndjsonLogWriter.js:55-58](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L55)).
- `payment`/`sweep`/`charge`: **дедупа нет** — `appendTypedLedgerEntry` дописывает всегда (append-only).

## 2.5 Разделение mock/бой и «последняя дата»

- `resolveLogDirForMode(logDir, mode)`: `gfl_reality` → prod-папка, иначе → подпапка `mock/` ([ndjsonLogReader.js:30-32](../../packages/core/src/daily-payments/ndjsonLogReader.js#L30)).
- `readLastLogDate` **жёстко** читает prod-папку (`getProdLogDir`), независимо от режима ([:49-50](../../packages/core/src/daily-payments/ndjsonLogReader.js#L49)).

## 2.6 Узкие места (verified)

| # | Узкое место | Где / следствие |
|---|-------------|-----------------|
| B1 | **Typed-записи без дедупа** | `sweep`/`charge` дописываются всегда ([appendTypedLedgerEntry](../../packages/core/src/daily-payments/ndjsonLogWriter.js#L122)) → повторный прогон действия 1/3 создаёт дубликаты строк; для «журнала-отчёта» дубли надо отсеивать по `txHash` вручную |
| B2 | **Нет файловых локов / атомарности между процессами** | конкурентные запуски (`all` пишет N раз подряд, [ChargeToPoolAction.js:282-335](../../packages/core/src/actions/ChargeToPoolAction.js#L282)) на разные файлы безопасны, но параллельные процессы в один и тот же `<wallet>.ndjson` могут переплести строки — сериализации на уровне ОС нет |
| B3 | **Чтение всего файла в память** | `readLastLogDate`/`readExistingDayDates` делают `readFile` + `split('\n')` целиком ([ndjsonLogReader.js:61,95](../../packages/core/src/daily-payments/ndjsonLogReader.js#L61)) → линейный рост стоимости при длинной истории, ротации/архивации нет |
| B4 | **`mock` не ведёт свою «последнюю дату»** | mock-прогон действия 2 читает prod-журнал, а пишет в `mock/` → mock-история не влияет на резолв периода (осознанно, L3), но mock-повторы не «двигаются» по датам |
| B5 | **`timestamp` — локальное время процесса** | `new Date().toISOString()` в действиях ([DailyPaymentsAction.js:123](../../packages/core/src/actions/DailyPaymentsAction.js#L123), charge/sweep аналогично) — не on-chain-время; `block` даёт привязку к цепочке, но в mock `block=null` |
| B6 | **Битые строки молча пропускаются при чтении** | `JSON.parse` в try/catch, невалидная строка игнорируется ([ndjsonLogReader.js:64-68](../../packages/core/src/daily-payments/ndjsonLogReader.js#L64)) — повреждение файла не заметно программно |
| B7 | **Нет валидации схемы записи** | `appendTypedLedgerEntry` пишет любой объект `entry` как есть — единообразие полей держится соглашением в коде действий, не проверяется |
| B8 | **`launched_by` может быть `'unknown'`** | если нет `$USER` и `os.userInfo()` без имени ([runtimeContext.js](../../packages/core/src/runtimeContext.js)) — атрибуция запуска не гарантирована |

## 2.7 Совместимость и инварианты

- `readLastLogDate`/`readExistingDayDates` фильтруют строго `type==='day'` → добавление `sweep`/`charge` в тот же `<wallet>.ndjson` **не влияет** на резолв периода действия 2 (покрыто тестом «readLastLogDate still reads day rows when sweep rows present», [charge-to-pool.test.js](../../tests/unit/capybara/charge-to-pool.test.js)).
- `appendDailyPaymentsLog` сохранён без изменений; `appendTypedLedgerEntry` добавлен рядом (обратная совместимость action 2).

## 2.8 Тесты

Логирование покрыто офлайн-тестами: `appendTypedLedgerEntry` + совместимость `readLastLogDate`,
mock/prod-разделение, sweep-ретрофит, `charge` single/all/`batch_id`
([tests/unit/capybara/charge-to-pool.test.js](../../tests/unit/capybara/charge-to-pool.test.js),
[daily-payments.test.js](../../tests/unit/capybara/daily-payments.test.js)). Полный набор capybara — **113 passing**.
