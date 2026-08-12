$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"

function Set-EnvValue {
  param([string]$Name, [string]$Value)
  $lines = @()
  if (Test-Path $envFile) { $lines = @(Get-Content $envFile) }
  $replacement = $Name + "=" + $Value
  $updated = @()
  $found = $false
  foreach ($line in $lines) {
    if ($line.StartsWith($Name + "=")) {
      $updated += $replacement
      $found = $true
    } else {
      $updated += $line
    }
  }
  if (-not $found) { $updated += $replacement }
  [System.IO.File]::WriteAllLines($envFile, [string[]]$updated)
}

Write-Host "Telegram Mini App - Windows setup" -ForegroundColor Cyan
Write-Host "The bot token will not be displayed."
$secureToken = Read-Host "Paste BotFather token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
if ([string]::IsNullOrWhiteSpace($token) -or $token -notmatch "^\d+:[A-Za-z0-9_-]+$") { throw "Token looks invalid. Nothing was saved." }

$telegramId = Read-Host "Enter your numeric Telegram ID from @userinfobot"
if ($telegramId -notmatch "^\d+$") { throw "Numeric Telegram ID is required. Nothing was saved." }

Set-EnvValue -Name "TELEGRAM_BOT_TOKEN" -Value $token
Set-EnvValue -Name "TELEGRAM_ALLOWED_USER_ID" -Value $telegramId
Set-EnvValue -Name "TELEGRAM_REQUIRE_AUTH" -Value "1"
Write-Host "Done. Token is local in .env only. Run Restart.bat, then enable-telegram-tunnel.bat." -ForegroundColor Green
