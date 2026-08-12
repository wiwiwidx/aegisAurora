$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env'

function Set-EnvValue([string]$key, [string]$value) {
  $lines = if (Test-Path $envFile) { Get-Content $envFile } else { @() }
  $pattern = '^{0}=' -f [regex]::Escape($key)
  $found = $false
  $newLines = foreach ($line in $lines) {
    if ($line -match $pattern) { $found = $true; "$key=$value" } else { $line }
  }
  if (-not $found) { $newLines += "$key=$value" }
  [System.IO.File]::WriteAllLines($envFile, [string[]]$newLines)
}

Write-Host 'Telegram Mini App — локальная настройка Windows' -ForegroundColor Cyan
Write-Host 'Токен не будет показан и никуда не отправится.'
$secureToken = Read-Host 'Вставь токен от BotFather' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ([string]::IsNullOrWhiteSpace($token) -or $token -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'Токен выглядит неверно. Ничего не сохранено.' }

$telegramId = Read-Host 'Введи свой числовой Telegram ID (его показывает @userinfobot)'
if ($telegramId -notmatch '^\d+$') { throw 'Нужен только числовой Telegram ID. Ничего не сохранено.' }

Set-EnvValue 'TELEGRAM_BOT_TOKEN' $token
Set-EnvValue 'TELEGRAM_ALLOWED_USER_ID' $telegramId
Set-EnvValue 'TELEGRAM_REQUIRE_AUTH' '1'
Write-Host 'Готово. Токен сохранён только в .env. Теперь запусти Restart.bat, затем enable-telegram-tunnel.bat.' -ForegroundColor Green
