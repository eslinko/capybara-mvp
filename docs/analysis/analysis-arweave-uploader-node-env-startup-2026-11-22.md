# Анализ: запуск Node-сервера amanita/arweave-uploader без shell `source .env`

**Дата:** 2026-11-22  
**Правила:** analysis.mdc — только факты из кода / package.json / docs uploader; без реализации в capybara host  
**Скоуп:** как uploader поднимает env при `npm start`; contrast с capybara host/CLI; вывод для локального identity edge  
**Триггер:** локальный `POST /auth/challenge` → `EAUTH_ENV_MISSING` / `supabaseUrl`, пока `.env` не экспортирован в shell

---

## 1. Зачем смотрели uploader

**As-of analysis date:** Capybara host (`npm start` → `host/start.js`) читал только `process.env` и **не** подхватывал `capybara/.env` (обход: `set -a; source .env; set +a`).  
**Follow-up:** EDGE-05 Present — `host/loadHostDotenv.js`; operator surface EDGE-06 (see §6).  
Цель анализа — зафиксировать, как соседнее Node-приложение в монорепо делает локальный старт **без** shell dance.

---

## 2. Entry и скрипт старта (verified)

Пакет: `amanita/arweave-uploader/`.

[`package.json`](../../../amanita/arweave-uploader/package.json):

- `"type": "module"`
- `"start": "node dist/server.js"`
- dependencies: `arweave`, `fastify` — пакета **`dotenv` нет**

Исходников `src/` / `.ts` в дереве пакета **нет**; runtime entry = [`dist/server.js`](../../../amanita/arweave-uploader/dist/server.js).

Операторский текст ([`docs/local-run-and-smoke.md`](../../../amanita/arweave-uploader/docs/local-run-and-smoke.md)):

> Из корня **arweave-uploader**: `npm start`  
> Сервер подхватывает `.env` из текущей директории (если файл есть). Порт по умолчанию — 3000.

---

## 3. Цепочка старта

```text
npm start
  → node dist/server.js
    → (module top-level) loadEnvFromFile()
    → if entrypoint: startServer()
         → loadConfig() / diagnostics / buildApp
         → app.listen({ host: "0.0.0.0", port: config.port })
```

Entrypoint-guard (ESM):

```207:213:amanita/arweave-uploader/dist/server.js
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    startServer().catch((error) => {
        logError("server.start.failed", { error: errorToMessage(error) });
        process.exit(1);
    });
}
```

`loadEnvFromFile()` вызывается **сразу при загрузке модуля** (до `startServer`), строки 19–55 + вызов на L55.

---

## 4. `loadEnvFromFile` — поведение

Файл: [`dist/server.js`](../../../amanita/arweave-uploader/dist/server.js) L19–55.

| Правило | Факт из кода |
|---------|----------------|
| Путь | `join(process.cwd(), ".env")` |
| Нет файла | `existsSync` → silent `return` |
| Уже заданный ключ | `process.env[key] !== undefined` → **не** перезаписывать (в т.ч. пустая строка) |
| Комментарии / пустые | trim; skip пустых и строк с `#` в начале |
| Парсер | свой на `fs`/`path`; **не** dotenv |
| Кавычки | `'` / `"`; многострочные значения; `\n` → перевод строки только внутри кавычек |
| Inline `#` после value | **не** отрезается (значение берётся целиком после `=`) |

После загрузки env `startServer()` читает уже `process.env` через `loadConfig()` ([`dist/config.js`](../../../amanita/arweave-uploader/dist/config.js)): `PORT` default **3000**, JWK из `ARWEAVE_PRIVATE_KEY` или `ARWEAVE_PRIVATE_KEY_FILE`, и т.д.

---

## 5. Contrast с Capybara (verified)

| Entry | Загрузка `.env` | Пакет dotenv |
|-------|-----------------|--------------|
| arweave-uploader `dist/server.js` | Да — `loadEnvFromFile()` при load модуля, `cwd/.env` | Нет |
| capybara CLI / [`packages/core/src/config/index.js`](../../packages/core/src/config/index.js) | Да — `dotenv.config({ path: CAPYBARA_DOTENV_PATH })` (если не `CAPYBARA_LAZY_CONFIG=1`) | Да (`dotenv`) |
| capybara host [`host/start.js`](../../host/start.js) | **Да (EDGE-05)** — `loadHostDotenv` → `CAPYBARA_DOTENV_PATH` before `main()` | Да (`dotenv` via host helper) |

Следствие для identity edge (после EDGE-05): package `.env` при `cd capybara && npm start` **загружается** в `process.env` (без overwrite platform keys). Missing file → silent continue. Operator surface: EDGE-06 · [`../manuals/IDENTITY-HTTP-EDGE-MANUAL.md`](../manuals/IDENTITY-HTTP-EDGE-MANUAL.md) §2.1.

---

## 6. Вывод для Capybara host (analysis only)

Чтобы локальный host стартовал как uploader (`npm start` из корня пакета с `.env` рядом), нужен **код** в host entry (или shared helper), который до `resolveListenPort` / `createHostServer`:

- читает файл env (путь: либо `cwd/.env`, либо существующий `CAPYBARA_DOTENV_PATH` из CLI),
- не перезаписывает уже заданные `process.env` (как uploader),
- не логирует секреты.

**Follow-up (EDGE-05/06):** host auto-load gap **closed** — [`../../host/loadHostDotenv.js`](../../host/loadHostDotenv.js) + wire in [`../../host/start.js`](../../host/start.js) (EDGE-05 Done). Operator manual §2.1 + `.env.example` PORT/auth placeholders = EDGE-06. This note remains analysis-only; docs alone ≠ Phase 2 Done / remote edge PASS (AC-I06).

---

## 7. Источники

| Артефакт | Путь |
|----------|------|
| Entry + `loadEnvFromFile` | `amanita/arweave-uploader/dist/server.js` |
| Config / PORT default | `amanita/arweave-uploader/dist/config.js` |
| npm start | `amanita/arweave-uploader/package.json` |
| Операторский текст | `amanita/arweave-uploader/docs/local-run-and-smoke.md` |
| Capybara host entry | `capybara/host/start.js` |
| Capybara host dotenv | `capybara/host/loadHostDotenv.js` |
| Capybara CLI dotenv | `capybara/packages/core/src/config/index.js` |
