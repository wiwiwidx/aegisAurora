#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Создан файл .env. Он открыт в TextEdit — вставь туда read-only ключ и секрет Bybit, сохрани файл и запусти этот файл ещё раз."
  open -e .env
  read "?Нажми Enter, чтобы закрыть это окно..."
  exit 0
fi

echo "Запускаю Bybit Sizer. Открой: http://127.0.0.1:8787"
echo "Чтобы остановить, нажми Control+C."
node server.mjs
