@echo off
rem Starts MedOS on this computer and opens it in your browser.
rem Keep this window open while you use MedOS; close it (or press Ctrl+C) to stop MedOS.
title MedOS
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on the PATH. Install Node.js 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First start: installing MedOS's packages. This takes a few minutes...
  call npm install
)

rem Brings the database up to date with this version of MedOS. Already-applied
rem updates are skipped, so this is quick when there is nothing new.
echo Checking the database is up to date...
call npm run db:migrate --silent
if errorlevel 1 (
  echo.
  echo The database could not be updated, so MedOS was not started.
  echo If MedOS is already running in another window, close that window and try again.
  pause
  exit /b 1
)

echo.
echo Starting MedOS. Your browser opens at http://localhost:3000 in a few seconds.
echo Keep this window open while you use MedOS. Close it to stop MedOS.
echo.
start "" /min cmd /c "timeout /t 12 /nobreak >nul && start http://localhost:3000"
call npm run dev
echo.
echo MedOS has stopped.
pause
