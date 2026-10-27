@echo off
rem BUNNYFALL: pull the latest version from GitHub for the Windows test. Close the test windows first.
cd /d "%~dp0.."
git pull --ff-only origin main || (echo. & echo Update failed: local edits? Run "git status". & pause & exit /b 1)
call npm ci
call npm ci --prefix server
echo.
echo Updated. Run windows-test.cmd to start.
pause
