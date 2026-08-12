# Bybit Sizer Mini App

Первая локальная версия: показывает три входа, их value/ratio, стоп, тейк и сценарии заполнения 1 / 1+2 / 1+2+3. По умолчанию открывается в демо-режиме и не совершает сделок.

## Запуск

1. Скопируй `.env.example` в `.env`.
2. Вставь только read-only API key и secret Bybit в `.env`.
3. Запусти `npm start`.
4. Открой `http://127.0.0.1:8787`.

Для Telegram Mini App нужно открыть этот локальный адрес наружу через HTTPS-туннель и указать получившийся адрес в настройках кнопки бота.

## Важно

- API ключ остаётся только на твоём компьютере; браузеру и Telegram он не передаётся.
- Приложение использует только чтение ордеров и позиций, а не создание/изменение сделок.
- Bybit API видит сетку после её создания как набор обычных лимитных ордеров. Поля формы до нажатия Create API не отдаёт.
- Если Bybit ругается на `timestamp` или `recv_window`, синхронизируй время компьютера: Windows `Date & Time` → `Sync now`, затем перезапусти `Start Server`.
# Bybit Sizer

## Windows server workflow

Keep `.env` only on your own computers. It is deliberately excluded from Git.

- Start the server: `start.bat`
- After an update is sent from the Mac: double-click `update-sizer.bat`
- Make this laptop the always-on server once: double-click `install-windows-server.bat`

`update-sizer.bat` downloads the newest code from the private repository, leaves
your `.env` untouched, and restarts the local server on port 8787.

`install-windows-server.bat` adds a small hidden server watcher to Windows
startup. It launches the server after sign-in and restarts it if Node exits.

## Open the Windows server from a Mac

Keep the Sizer running only on Windows. Install Tailscale on both computers and
sign in to the same Tailscale account. Then run `enable-mac-access.bat` on
Windows once. It creates a private HTTPS link to the Windows-only server; the
app is not exposed to the public internet.
# Manual control on Windows

By default, use `start.bat` to start the Sizer and keep its window open. Use `stop-sizer.bat` to stop it, or `restart-sizer.bat` to restart it.

If an older setup enabled background start after Windows sign-in, run `disable-autostart.bat` once. It removes that startup shortcut; the Sizer will then run only when you start it manually.
