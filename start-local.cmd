@echo off
setlocal

set "ROOT=%~dp0"
set "NODE_DIR=%ROOT%.tools\node-v22.16.0-win-x64"

if not exist "%NODE_DIR%\npm.cmd" (
  echo Portable Node.js was not found.
  echo Ask Codex to finish local npm setup, or install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
cd /d "%ROOT%"

if not exist "node_modules" (
  echo Installing dependencies...
  "%NODE_DIR%\npm.cmd" install --cache ".npm-cache"
)

echo Starting local valuation app at http://127.0.0.1:3000
"%NODE_DIR%\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3000
