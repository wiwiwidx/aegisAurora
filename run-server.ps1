$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) {
  exit 1
}

# Keep the local server available after Windows starts. If Node ever exits,
# wait briefly and launch it again instead of leaving the dashboard offline.
while ($true) {
  & node server.mjs
  Start-Sleep -Seconds 5
}
