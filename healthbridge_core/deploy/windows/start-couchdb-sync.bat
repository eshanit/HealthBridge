@echo off
REM UtanoBridge CouchDB Sync Worker - Windows Service Wrapper
REM This script runs the CouchDB sync worker in a loop for Windows environments

echo Starting UtanoBridge CouchDB Sync Worker...
echo Press Ctrl+C to stop

:loop
php %~dp0..\..\artisan couchdb:sync --daemon --poll=4 --batch=100
echo [%date% %time%] Worker stopped, restarting in 5 seconds...
timeout /t 5 /nobreak > nul
goto loop
