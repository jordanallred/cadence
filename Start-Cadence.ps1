$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 from https://nodejs.org first.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Dependency setup failed.' } }
if (-not (Test-Path -LiteralPath 'public/models/pose.task')) { & npm.cmd run prepare:models; if ($LASTEXITCODE -ne 0) { throw 'Model setup failed.' } }
Write-Host 'Open http://127.0.0.1:5173 in your browser. Keep this window running; Ctrl+C stops the app.'
& npm.cmd run dev
