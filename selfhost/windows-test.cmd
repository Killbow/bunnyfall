@echo off
rem BUNNYFALL local test on Windows. Needs Node.js 22 or newer.
rem Opens the game at http://localhost:5173/play/ with its own relay and account service.
cd /d "%~dp0.."
if not exist node_modules call npm ci
if not exist server\node_modules call npm ci --prefix server
start "Bunnyfall servers" cmd /k node selfhost\start.mjs
start "Bunnyfall game" cmd /k npx vite --port 5173 --strictPort
timeout /t 10 >nul
start "" http://localhost:5173/play/
