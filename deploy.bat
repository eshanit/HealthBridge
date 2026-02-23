@echo off
REM =============================================================================
REM UtanoBridge Platform - Windows Deployment Script
REM Single-command deployment for the entire ecosystem
REM =============================================================================

setlocal enabledelayedexpansion

REM Colors (Windows 10+)
for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED=!ESC![0;31m"
set "GREEN=!ESC![0;32m"
set "YELLOW=!ESC![1;33m"
set "BLUE=!ESC![0;34m"
set "NC=!ESC![0m"

REM Banner
echo.
echo !BLUE!======================================================================!NC!
echo !BLUE!          UtanoBridge Platform Deployment Script                   !NC!
echo !BLUE!               Single-Command Deploy (Windows)                       !NC!
echo !BLUE!======================================================================!NC!
echo.

REM Check for Docker
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo !RED![ERROR] Docker is not installed. Please install Docker Desktop first.!NC!
    exit /b 1
)

docker compose version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo !RED![ERROR] Docker Compose is not available. Please update Docker Desktop.!NC!
    exit /b 1
)

REM Parse arguments
set ACTION=%1
if "%ACTION%"=="" set ACTION=deploy

REM =============================================================================
REM ACTIONS
REM =============================================================================

if "%ACTION%"=="deploy" goto deploy
if "%ACTION%"=="up" goto deploy
if "%ACTION%"=="start" goto deploy
if "%ACTION%"=="build" goto build
if "%ACTION%"=="stop" goto stop
if "%ACTION%"=="down" goto stop
if "%ACTION%"=="restart" goto restart
if "%ACTION%"=="status" goto status
if "%ACTION%"=="logs" goto logs
if "%ACTION%"=="shell" goto shell
if "%ACTION%"=="backup" goto backup
if "%ACTION%"=="clean" goto clean
if "%ACTION%"=="help" goto help
if "%ACTION%"=="--help" goto help

:help
echo Usage: deploy.bat [command]
echo.
echo Commands:
echo   deploy   - Full deployment (build, start, migrate)
echo   build    - Build Docker images only
echo   stop     - Stop all services
echo   restart  - Restart all services
echo   status   - Show service status
echo   logs     - View logs
echo   shell    - Open shell in healthbridge container
echo   backup   - Create database backup
echo   clean    - Remove all containers and volumes
echo   help     - Show this help message
exit /b 0

:deploy
echo !BLUE![INFO]!NC! Starting deployment...

REM Check for .env file
if not exist .env (
    echo !YELLOW![WARNING]!NC! .env file not found. Creating from template...
    copy .env.docker.example .env >nul
    echo !YELLOW![WARNING]!NC! Please edit .env with your configuration and run again.
    exit /b 1
)

REM Build images
echo !BLUE![INFO]!NC! Building Docker images...
docker compose build --parallel
if %ERRORLEVEL% neq 0 (
    echo !RED![ERROR]!NC! Failed to build images.
    exit /b 1
)

REM Start services
echo !BLUE![INFO]!NC! Starting services...
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo !RED![ERROR]!NC! Failed to start services.
    exit /b 1
)

REM Wait for services
echo !BLUE![INFO]!NC! Waiting for services to be healthy...
timeout /t 30 /nobreak >nul

REM Run migrations
echo !BLUE![INFO]!NC! Running database migrations...
docker compose exec -T healthbridge php artisan migrate --force

REM Setup CouchDB
echo !BLUE![INFO]!NC! Setting up CouchDB...
docker compose exec -T healthbridge php artisan couchdb:setup --force 2>nul

echo.
echo !GREEN!======================================================================!NC!
echo !GREEN!              UtanoBridge Deployment Complete!                      !NC!
echo !GREEN!======================================================================!NC!
echo.
echo !BLUE!Access Points:!NC!
echo   * Nurse Mobile:     http://localhost
echo   * GP Dashboard:     http://localhost/admin
echo   * API Endpoint:     http://localhost/api
echo   * CouchDB Fauxton:  http://localhost/couchdb/_utils/
echo.
echo !BLUE!Useful Commands:!NC!
echo   * View logs:        docker compose logs -f
echo   * Stop services:    docker compose down
echo   * Restart:          docker compose restart
echo.
goto end

:build
echo !BLUE![INFO]!NC! Building Docker images...
docker compose build --parallel
echo !GREEN![SUCCESS]!NC! Images built successfully.
goto end

:stop
echo !BLUE![INFO]!NC! Stopping services...
docker compose down
echo !GREEN![SUCCESS]!NC! Services stopped.
goto end

:restart
echo !BLUE![INFO]!NC! Restarting services...
docker compose restart
timeout /t 10 /nobreak >nul
docker compose ps
goto end

:status
docker compose ps
goto end

:logs
docker compose logs -f %2
goto end

:shell
docker compose exec %2 bash
if %ERRORLEVEL% neq 0 docker compose exec %2 sh
goto end

:backup
echo !BLUE![INFO]!NC! Creating backup...
set BACKUP_DIR=backups\%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir %BACKUP_DIR% 2>nul

docker compose exec -T mysql mysqldump -u root -prootpassword healthbridge > %BACKUP_DIR%\mysql.sql 2>nul

echo !GREEN![SUCCESS]!NC! Backup created in %BACKUP_DIR%
goto end

:clean
echo !YELLOW![WARNING]!NC! This will remove all containers, volumes, and images!
set /p CONFIRM="Are you sure? (y/N): "
if /i "%CONFIRM%"=="y" (
    docker compose down -v --rmi local
    echo !GREEN![SUCCESS]!NC! Cleanup complete.
) else (
    echo Cancelled.
)
goto end

:end
endlocal
