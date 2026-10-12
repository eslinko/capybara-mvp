# Mint UI — доэммиссия $CAPY

Канонический путь этой инструкции: **этот файл**. В [USER-MANUAL.md](../docs/manuals/USER-MANUAL.md) только ссылка сюда (мануал про CLI).

Назначение: доэмитить $CAPY на **уже задеплоенном** контракте вызовом `CapybaraToken.mint`. Это не деплой нового токена.

## Файлы

| Файл | Роль |
|------|------|
| `capybara/scripts/capybara-mint-v2.html` | страница формы (приватный ключ, кому, сколько, gas) |
| `capybara/scripts/capybara-mint-config.js` | константы: адрес, RPC, explorer, decimals, ABI |
| `capybara/scripts/capybara-mint.js` | валидация, provider/wallet, `Contract.mint` |

## Константы

Править только в `capybara-mint-config.js` (`window.CapyMintConfig`):

- `CAPY_TOKEN_ADDRESS` — адрес задеплоенного $CAPY
- `POLYGON_RPC_URL` — RPC Polygon (сейчас placeholder `YOUR_ANKR_API_KEY`; публичный `https://polygon-rpc.com/` отвечает 401)
- рядом: `POLYGON_TX_EXPLORER_BASE`, `TOKEN_DECIMALS` (8)

Адрес в info-box страницы берётся из config, не из HTML.

## Как открыть

Из каталога `capybara/scripts/`:

```bash
python3 -m http.server 8765
```

Затем в браузере: `http://127.0.0.1:8765/capybara-mint-v2.html`.

Либо открыть файл напрямую: `file://` на `capybara/scripts/capybara-mint-v2.html` (скрипты рядом, пути относительные).

Нужны owner-ключ и рабочий RPC. Без ключа форма всё равно показывает ошибки валидации.

## Безопасность

Приватный ключ вводится только в textarea страницы и остаётся в браузере. Не коммитить ключи и не коммитить RPC URL с настоящим API key.

## Debug terminal

Под кнопками Mint и «Очистить» виден краткий `#status`.
Ниже него — чёрный терминал `#mintDebugTerminal`: зелёный моноширинный текст, прокрутка.
Каждый Mint дописывает шаги: проверка, адрес контракта, hostname RPC, адрес кошелька, сумма.
При успехе в терминале появляются hash и receipt; при ошибке — строка `err`.
Приватный ключ в текст терминала не пишется.
Полный RPC URL с API key не пишется, только hostname.
Кнопка «Очистить» сбрасывает и форму, и терминал.
Красный `#status` вместе со строкой `err` — это ошибка сети или gas, а не пустая страница.

## Не путать

| Артефакт | Роль |
|----------|------|
| mint UI (`capybara-mint-v2.html` + config + `capybara-mint.js`) | доэммиссия на уже задеплоенном $CAPY |
| `capybara/scripts/deploy.js` | деплой нового CAPY |
| `capybara/scripts/delpoy-family-token.js` | FamilyToken (имя файла с опечаткой `delpoy`) |

Разбор дыр фронта: [gap-capy-mint-frontend-vs-target-2026-10-12.md](../docs/analysis/gap-capy-mint-frontend-vs-target-2026-10-12.md).
