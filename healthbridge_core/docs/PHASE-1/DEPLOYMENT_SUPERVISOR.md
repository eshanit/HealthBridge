# Supervisor Deployment Guide for HealthBridge

This guide covers setting up Supervisor to manage the CouchDB sync worker process on production servers.

## Overview

Supervisor is a process control system that ensures the CouchDB sync worker runs continuously and restarts automatically on failure. This is critical for maintaining near real-time data synchronization between CouchDB (mobile app) and MySQL (web app).

## Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- PHP 8.2+ installed
- Laravel application deployed
- CouchDB accessible from the server

## CouchDB Configuration

### Environment Variables

Add the following CouchDB configuration to your `.env` file:

```env
# CouchDB Configuration
COUCHDB_HOST=http://127.0.0.1:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_password
```

### Creating the CouchDB Database

HealthBridge includes an artisan command to set up the CouchDB database:

```bash
# Create database and design documents
php artisan couchdb:setup --create-db --design-docs

# Reset and recreate everything (WARNING: deletes all data)
php artisan couchdb:setup --reset

# Check status only
php artisan couchdb:setup
```

The setup command will:
1. Test connection to CouchDB server
2. Create the database if it doesn't exist
3. Create design documents with views for querying documents by type, patient, session, etc.
4. Create validation rules for document structure

### Manual CouchDB Setup

If you prefer to set up CouchDB manually:

1. **Create the database**:
   ```bash
   curl -X PUT http://admin:password@127.0.0.1:5984/healthbridge_clinic
   ```

2. **Verify the database was created**:
   ```bash
   curl http://admin:password@127.0.0.1:5984/healthbridge_clinic
   ```

3. **Create a test document**:
   ```bash
   curl -X POST http://admin:password@127.0.0.1:5984/healthbridge_clinic \
     -H "Content-Type: application/json" \
     -d '{"type": "test", "message": "Hello CouchDB"}'
   ```

## Installation

### 1. Install Supervisor

```bash
sudo apt update
sudo apt install supervisor
```

### 2. Verify Installation

```bash
sudo systemctl status supervisor
```

Expected output:
```
● supervisor.service - Supervisor process control system for UNIX
     Loaded: loaded (/lib/systemd/system/supervisor.service; enabled; vendor preset: enabled)
     Active: active (running) since ...
```

## Configuration

### 1. Copy Configuration File

Copy the Supervisor configuration from the deployment directory:

```bash
# Copy to Supervisor's conf.d directory
sudo cp /var/www/healthbridge/deploy/supervisor/healthbridge-couchdb-sync.conf /etc/supervisor/conf.d/

# Or create manually
sudo nano /etc/supervisor/conf.d/healthbridge-couchdb-sync.conf
```

### 2. Configuration Template

```ini
[program:healthbridge-couchdb-sync]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/healthbridge/artisan couchdb:sync --daemon --poll=4 --batch=100

; Run as the web server user
user=www-data
group=www-data

; Auto-start and auto-restart
autostart=true
autorestart=true

; Restart settings
startsecs=1
stopwaitsecs=10

; Logging
stdout_logfile=/var/www/healthbridge/storage/logs/couchdb-sync.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
stderr_logfile=/var/www/healthbridge/storage/logs/couchdb-sync-error.log
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=5

; Environment
environment=APP_ENV="production"

; Single instance (avoid sync conflicts)
numprocs=1
priority=999
stopsignal=SIGTERM
redirect_stderr=false
```

### 3. Customize for Your Environment

Update these values based on your server setup:

| Setting | Description | Example |
|---------|-------------|---------|
| `command` | Path to artisan | `/var/www/healthbridge/artisan` |
| `user` | Web server user | `www-data`, `nginx`, `apache` |
| `group` | Web server group | `www-data`, `nginx`, `apache` |
| `stdout_logfile` | Standard output log | `/var/www/healthbridge/storage/logs/couchdb-sync.log` |
| `stderr_logfile` | Error log | `/var/www/healthbridge/storage/logs/couchdb-sync-error.log` |

### 4. Command Options

The sync worker accepts these options:

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon` | false | Run continuously (required for Supervisor) |
| `--poll` | 4 | Polling interval in seconds |
| `--batch` | 100 | Maximum documents per poll |

Example with custom settings:
```bash
php artisan couchdb:sync --daemon --poll=2 --batch=50
```

## Managing the Worker

### Reload Configuration

After making changes to the configuration file:

```bash
# Reread configuration files
sudo supervisorctl reread

# Apply changes
sudo supervisorctl update
```

### Start the Worker

```bash
sudo supervisorctl start healthbridge-couchdb-sync:*
```

### Stop the Worker

```bash
sudo supervisorctl stop healthbridge-couchdb-sync:*
```

### Restart the Worker

```bash
sudo supervisorctl restart healthbridge-couchdb-sync:*
```

### Check Status

```bash
sudo supervisorctl status healthbridge-couchdb-sync:*
```

Expected output:
```
healthbridge-couchdb-sync:healthbridge-couchdb-sync_00   RUNNING   pid 12345, uptime 1:23:45
```

### View All Managed Processes

```bash
sudo supervisorctl status
```

## Monitoring

### Log Files

Monitor the sync worker logs:

```bash
# Standard output
tail -f /var/www/healthbridge/storage/logs/couchdb-sync.log

# Errors
tail -f /var/www/healthbridge/storage/logs/couchdb-sync-error.log

# Laravel application log
tail -f /var/www/healthbridge/storage/logs/laravel.log
```

### Log Rotation

Supervisor automatically rotates logs based on these settings:
- `stdout_logfile_maxbytes=10MB` - Max size before rotation
- `stdout_logfile_backups=5` - Number of backup files to keep

### Health Check Script

Create a simple health check script:

```bash
#!/bin/bash
# /usr/local/bin/check-couchdb-sync

STATUS=$(sudo supervisorctl status healthbridge-couchdb-sync:* | grep -o "RUNNING\|STOPPED\|FATAL")

if [ "$STATUS" != "RUNNING" ]; then
    echo "WARNING: CouchDB sync worker is not running!"
    exit 1
fi

echo "OK: CouchDB sync worker is running"
exit 0
```

Make it executable:
```bash
sudo chmod +x /usr/local/bin/check-couchdb-sync
```

### Cron Job for Auto-Restart

Add a cron job to ensure the worker is running:

```bash
# Edit crontab
sudo crontab -e

# Add this line (checks every 5 minutes)
*/5 * * * * /usr/local/bin/check-couchdb-sync || /usr/bin/supervisorctl start healthbridge-couchdb-sync:*
```

## Troubleshooting

### Worker Won't Start

1. Check the error log:
   ```bash
   tail -f /var/www/healthbridge/storage/logs/couchdb-sync-error.log
   ```

2. Verify CouchDB connectivity:
   ```bash
   php artisan tinker
   >>> app(App\Services\CouchDbService::class)->databaseExists()
   ```

3. Check file permissions:
   ```bash
   sudo chown -R www-data:www-data /var/www/healthbridge/storage
   sudo chmod -R 775 /var/www/healthbridge/storage
   ```

### Worker Keeps Restarting

1. Check for PHP errors:
   ```bash
   tail -f /var/www/healthbridge/storage/logs/laravel.log
   ```

2. Verify database connections:
   ```bash
   php artisan migrate:status
   ```

3. Test the worker manually:
   ```bash
   sudo -u www-data php artisan couchdb:sync --poll=4 --batch=10
   ```

### Memory Issues

If the worker consumes too much memory:

1. Reduce batch size:
   ```ini
   command=php /var/www/healthbridge/artisan couchdb:sync --daemon --poll=4 --batch=50
   ```

2. Add a restart schedule (restarts at midnight):
   ```bash
   # Add to crontab
   0 0 * * * /usr/bin/supervisorctl restart healthbridge-couchdb-sync:*
   ```

### Connection Timeouts

If CouchDB connection times out:

1. Increase timeout in `.env`:
   ```env
   COUCHDB_TIMEOUT=60
   ```

2. Check network connectivity:
   ```bash
   curl -v http://your-couchdb-host:5984/
   ```

## Production Checklist

Before going live, verify:

- [ ] Supervisor is installed and running
- [ ] Configuration file is in `/etc/supervisor/conf.d/`
- [ ] Worker starts automatically on server boot (`autostart=true`)
- [ ] Worker restarts on failure (`autorestart=true`)
- [ ] Log files are being written
- [ ] File permissions are correct for `storage/` directory
- [ ] CouchDB is accessible from the server
- [ ] MySQL database is accessible
- [ ] Test sync works with a sample document

## Multiple Environments

For staging/production on the same server:

```ini
; Staging
[program:healthbridge-staging-couchdb-sync]
command=php /var/www/healthbridge-staging/artisan couchdb:sync --daemon
user=www-data
; ... other settings

; Production
[program:healthbridge-production-couchdb-sync]
command=php /var/www/healthbridge-production/artisan couchdb:sync --daemon
user=www-data
; ... other settings
```

## Security Considerations

1. **File Permissions**: Ensure log files are not world-readable:
   ```bash
   chmod 640 /var/www/healthbridge/storage/logs/*.log
   ```

2. **Environment Variables**: Sensitive credentials should be in `.env`, not in the Supervisor config

3. **User Isolation**: Run as `www-data` or a dedicated user, never as `root`

## Windows/XAMPP Deployment

> **Note**: Supervisor is Linux-only software. For Windows servers, use one of the alternative approaches documented in this section. The recommended production approach is NSSM (Non-Sucking Service Manager).

### Overview of Windows Deployment Options

| Method | Use Case | Auto-Restart | Runs at Boot | Complexity |
|--------|----------|--------------|--------------|------------|
| Manual Batch Script | Development/Testing | No (manual) | No | Low |
| Batch Script with Loop | Development/Staging | Yes | No | Low |
| Windows Task Scheduler | Small Production | Yes | Yes | Medium |
| NSSM Service Wrapper | Production | Yes | Yes | Medium |

---

### Prerequisites for Windows

- Windows 10/11 or Windows Server 2016+
- XAMPP with PHP 8.2+ installed
- Laravel application deployed
- CouchDB accessible from the server
- Administrator access for service configuration

---

### CouchDB Configuration for Windows

#### Environment Variables

Add the following to your `.env` file:

```env
# CouchDB Configuration
COUCHDB_HOST=http://127.0.0.1:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=1234
```

#### Creating the CouchDB Database on Windows

Run the setup command to create the database and design documents:

```cmd
cd C:\xampp\htdocs\healthbridge
php artisan couchdb:setup --create-db --design-docs
```

Expected output:
```
Setting up CouchDB for HealthBridge...
Host: http://127.0.0.1:5984
Database: healthbridge_clinic
✓ Connected to CouchDB server
Creating database: healthbridge_clinic
✓ Database created successfully
Creating design documents...
✓ Design document created/updated
✓ Validation document created/updated

=== CouchDB Status ===
Database: healthbridge_clinic
Document Count: 0
Data Size: 0 B
Update Sequence: 0

Design Documents:
  - _design/main (8 views)
```

#### Manual CouchDB Setup on Windows

If you prefer to use curl or the CouchDB web interface (Fauxton):

1. **Open CouchDB Fauxton** in your browser:
   ```
   http://127.0.0.1:5984/_utils/
   ```

2. **Login** with your credentials (admin/1234)

3. **Create Database**:
   - Click "Create Database"
   - Enter name: `healthbridge_clinic`
   - Click "Create"

4. **Verify via command line**:
   ```cmd
   curl http://admin:1234@127.0.0.1:5984/healthbridge_clinic
   ```

---

### XAMPP-Specific Configuration

#### 1. PHP Path Configuration

Ensure PHP is in your system PATH or configure the full path in scripts:

**Option A: Add PHP to System PATH**
```cmd
# Check if PHP is in PATH
where php

# If not found, add to PATH via System Properties:
# 1. Right-click "This PC" → Properties → Advanced system settings
# 2. Environment Variables → System variables → Path → Edit
# 3. Add: C:\xampp\php
# 4. Restart command prompt/terminal
```

**Option B: Use Full PHP Path in Scripts**
```cmd
# Replace 'php' with full path in batch scripts
C:\xampp\php\php.exe artisan couchdb:sync --daemon
```

#### 2. XAMPP Apache/PHP Configuration

Ensure `php.ini` has required extensions enabled:

```ini
; C:\xampp\php\php.ini
extension=curl
extension=mbstring
extension=openssl
extension=pdo_mysql
extension=json
```

Restart Apache after changes:
```cmd
C:\xampp\apache\bin\httpd.exe -k restart
```

#### 3. Artisan Command Path

All artisan commands should be run from the Laravel project root:

```cmd
cd C:\xampp\htdocs\healthbridge
php artisan couchdb:sync --daemon
```

---

### Method 1: Manual Batch Script (Development)

**Best for**: Local development, quick testing, debugging

#### Setup

1. Open Command Prompt as Administrator
2. Navigate to project directory:
   ```cmd
   cd C:\xampp\htdocs\healthbridge
   ```

3. Run the sync worker directly:
   ```cmd
   php artisan couchdb:sync --poll=4 --batch=100
   ```

#### Manual Restart Script

Create a simple batch file for repeated testing:

```batch
@echo off
REM dev-sync.bat - Development sync worker
cd /d C:\xampp\htdocs\healthbridge
php artisan couchdb:sync --poll=4 --batch=10
pause
```

**Limitations**:
- No auto-restart on failure
- Does not run at system boot
- Requires manual intervention

---

### Method 2: Batch Script with Auto-Restart (Development/Staging)

**Best for**: Development environments where the worker needs to stay running

#### Using the Provided Script

The project includes a batch script with auto-restart capability:

```cmd
cd C:\xampp\htdocs\healthbridge
deploy\windows\start-couchdb-sync.bat
```

#### Script Contents

```batch
@echo off
REM HealthBridge CouchDB Sync Worker - Windows Service Wrapper
REM This script runs the CouchDB sync worker in a loop for Windows environments

echo Starting HealthBridge CouchDB Sync Worker...
echo Press Ctrl+C to stop

:loop
php %~dp0..\..\artisan couchdb:sync --daemon --poll=4 --batch=100
echo [%date% %time%] Worker stopped, restarting in 5 seconds...
timeout /t 5 /nobreak > nul
goto loop
```

#### Customizing the Script

For XAMPP installations, modify the PHP path if needed:

```batch
:loop
C:\xampp\php\php.exe %~dp0..\..\artisan couchdb:sync --daemon --poll=4 --batch=100
echo [%date% %time%] Worker stopped, restarting in 5 seconds...
timeout /t 5 /nobreak > nul
goto loop
```

**Limitations**:
- Requires a logged-in user session
- Does not survive user logout
- Command window remains visible

---

### Method 3: Windows Task Scheduler (Small Production)

**Best for**: Small production deployments, environments where NSSM cannot be installed

#### Option A: Import Pre-configured Task

1. **Open Task Scheduler**:
   - Press `Win + R`, type `taskschd.msc`, press Enter

2. **Import the Task**:
   - Right-click "Task Scheduler Library" → "Import Task"
   - Select `deploy\windows\healthbridge-couchdb-sync.xml`

3. **Update the Path**:
   - Edit the task properties
   - In the "Actions" tab, update paths to match your installation:
     - Program: `C:\xampp\htdocs\healthbridge\deploy\windows\start-couchdb-sync.bat`
     - Start in: `C:\xampp\htdocs\healthbridge`

4. **Set the User Account**:
   - In the "General" tab, select "Run whether user is logged on or not"
   - Click "Change User or Group" and select an appropriate service account
   - Check "Do not store password" if using a local account

#### Option B: Create Task Manually

1. **Create Basic Task**:
   - Right-click "Task Scheduler Library" → "Create Task"
   - Name: `HealthBridge CouchDB Sync`
   - Description: `Continuously syncs data from CouchDB to MySQL`

2. **Configure General Settings**:
   - Select "Run whether user is logged on or not"
   - Check "Run with highest privileges"
   - Configure for: Windows 10/Windows Server 2016

3. **Configure Triggers**:
   - Click "New" → "Begin the task: At startup"
   - Check "Enabled"
   - Advanced settings: "Delay task for: 30 seconds" (allows services to initialize)

4. **Configure Actions**:
   - Click "New" → "Start a program"
   - Program: `C:\xampp\htdocs\healthbridge\deploy\windows\start-couchdb-sync.bat`
   - Start in: `C:\xampp\htdocs\healthbridge`

5. **Configure Settings (Auto-Restart)**:
   - Check "Run task as soon as possible after a scheduled start is missed"
   - Check "If the task fails, restart every:" → Set to 1 minute
   - "Attempt to restart up to:" → Set to 3 times (or unlimited for critical systems)
   - "Stop the task if it runs longer than:" → Uncheck (continuous process)

6. **Configure Conditions**:
   - Power section:
     - Uncheck "Start the task only if the computer is on AC power"
     - Uncheck "Stop if the computer switches to battery power"
   - Network:
     - Check "Start only if the following network connection is available"
     - Select "Any connection" (or specific network if required)

#### Task Scheduler Management via PowerShell

```powershell
# Start the task
Start-ScheduledTask -TaskName "HealthBridge CouchDB Sync"

# Stop the task
Stop-ScheduledTask -TaskName "HealthBridge CouchDB Sync"

# Check status
Get-ScheduledTask -TaskName "HealthBridge CouchDB Sync"

# View detailed info
Get-ScheduledTaskInfo -TaskName "HealthBridge CouchDB Sync"

# Enable the task
Enable-ScheduledTask -TaskName "HealthBridge CouchDB Sync"

# Disable the task
Disable-ScheduledTask -TaskName "HealthBridge CouchDB Sync"

# View task history (requires admin)
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" |
    Where-Object { $_.Message -like "*HealthBridge*" } |
    Select-Object -First 10
```

**Limitations**:
- Task Scheduler may not detect process crashes immediately
- Limited control over process lifecycle
- Restart delays can be up to 1 minute minimum

---

### Method 4: NSSM Service Wrapper (Recommended for Production)

**Best for**: Production environments requiring robust process management

NSSM (Non-Sucking Service Manager) provides Supervisor-like functionality for Windows, including:
- Automatic service startup at boot
- Process monitoring and automatic restart
- Proper service lifecycle management
- Integration with Windows Services console

#### 1. Download and Install NSSM

```powershell
# Option A: Using Chocolatey (recommended)
choco install nssm

# Option B: Manual download
# 1. Download from https://nssm.cc/download
# 2. Extract to C:\nssm\
# 3. Add C:\nssm\win64\ to system PATH
```

#### 2. Install the Service

Open Command Prompt or PowerShell as Administrator:

```cmd
# Navigate to NSSM directory (if not in PATH)
cd C:\nssm\win64

# Install the service
nssm install HealthBridgeCouchDBSync
```

This opens a GUI configuration dialog.

#### 3. Configure via GUI

**Application Tab**:
- Path: `C:\xampp\php\php.exe`
- Startup directory: `C:\xampp\htdocs\healthbridge`
- Arguments: `artisan couchdb:sync --daemon --poll=4 --batch=100`

**Details Tab**:
- Display name: `HealthBridge CouchDB Sync`
- Description: `Continuously syncs data from CouchDB to MySQL for the HealthBridge clinical platform`
- Startup type: `Automatic`

**Log on Tab**:
- Select "This account" and enter service account credentials
- Or use "Local System account" for development (not recommended for production)

**I/O Tab**:
- Output (stdout): `C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync.log`
- Error (stderr): `C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync-error.log`

**Rotation Tab**:
- Check "Replace existing files" or configure rotation as needed

**Exit Actions Tab** (for auto-restart):
- Restart: `Restart application`
- Delay restart by: `5000` ms (5 seconds)

#### 4. Configure via Command Line (Alternative)

```cmd
# Install service with all settings in one command
nssm install HealthBridgeCouchDBSync "C:\xampp\php\php.exe" "artisan couchdb:sync --daemon --poll=4 --batch=100"

# Set working directory
nssm set HealthBridgeCouchDBSync AppDirectory "C:\xampp\htdocs\healthbridge"

# Set display name and description
nssm set HealthBridgeCouchDBSync DisplayName "HealthBridge CouchDB Sync"
nssm set HealthBridgeCouchDBSync Description "Continuously syncs data from CouchDB to MySQL for the HealthBridge clinical platform"

# Set startup type to automatic
nssm set HealthBridgeCouchDBSync Start SERVICE_AUTO_START

# Configure logging
nssm set HealthBridgeCouchDBSync AppStdout "C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync.log"
nssm set HealthBridgeCouchDBSync AppStderr "C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync-error.log"

# Configure log rotation
nssm set HealthBridgeCouchDBSync AppRotateFiles 1
nssm set HealthBridgeCouchDBSync AppRotateBytes 10485760

# Configure auto-restart on failure
nssm set HealthBridgeCouchDBSync AppExit Default Restart
nssm set HealthBridgeCouchDBSync AppRestartDelay 5000

# Set service to run as specific user (optional)
nssm set HealthBridgeCouchDBSync ObjectName ".\ServiceAccount" "Password123"
```

#### 5. Start and Manage the Service

```cmd
# Start the service
nssm start HealthBridgeCouchDBSync
# Or using Windows SC
sc start HealthBridgeCouchDBSync

# Stop the service
nssm stop HealthBridgeCouchDBSync
# Or using Windows SC
sc stop HealthBridgeCouchDBSync

# Restart the service
nssm restart HealthBridgeCouchDBSync

# Check service status
sc query HealthBridgeCouchDBSync

# View service configuration
nssm get HealthBridgeCouchDBSync

# Remove the service (if needed)
nssm remove HealthBridgeCouchDBSync confirm
```

#### 6. PowerShell Service Management

```powershell
# Start service
Start-Service -Name "HealthBridgeCouchDBSync"

# Stop service
Stop-Service -Name "HealthBridgeCouchDBSync"

# Restart service
Restart-Service -Name "HealthBridgeCouchDBSync"

# Check status
Get-Service -Name "HealthBridgeCouchDBSync"

# View service properties
Get-WmiObject -Class Win32_Service -Filter "Name='HealthBridgeCouchDBSync'"

# Set service to auto-start
Set-Service -Name "HealthBridgeCouchDBSync" -StartupType Automatic
```

---

### Logging Configuration for Windows

#### Log File Paths

Configure Windows-compatible log paths in your `.env` file:

```env
# .env - Windows paths
LOG_CHANNEL=stack
LOG_LEVEL=info
LOG_DEPRECATIONS_CHANNEL=null
LOG_EXCEPTIONS_CHANNEL=null

# For Windows, use absolute paths with forward or backslashes
# Laravel handles both formats on Windows
```

#### Logging Configuration

Update `config/logging.php` for Windows:

```php
'channels' => [
    'stack' => [
        'driver' => 'stack',
        'channels' => ['single', 'stderr'],
        'ignore_exceptions' => false,
    ],

    'single' => [
        'driver' => 'single',
        // Windows path - use storage_path() helper
        'path' => storage_path('logs/laravel.log'),
        'level' => env('LOG_LEVEL', 'debug'),
        'permission' => 0664,
    ],

    'couchdb-sync' => [
        'driver' => 'single',
        'path' => storage_path('logs/couchdb-sync.log'),
        'level' => 'info',
        'permission' => 0664,
    ],
],
```

#### Log Rotation on Windows

**Option A: Laravel Built-in (Daily Logs)**

```php
'daily' => [
    'driver' => 'daily',
    'path' => storage_path('logs/couchdb-sync.log'),
    'level' => 'info',
    'days' => 14, // Keep 14 days of logs
],
```

**Option B: Windows Task Scheduler for Log Cleanup**

Create a scheduled task to archive/delete old logs:

```batch
@echo off
REM archive-logs.bat
cd /d C:\xampp\htdocs\healthbridge\storage\logs

REM Delete logs older than 30 days
forfiles /p "." /m "*.log" /d -30 /c "cmd /c del @path"

REM Archive logs older than 7 days
forfiles /p "." /m "*.log" /d -7 /c "cmd /c move @path archived\@fname.@fext"
```

Schedule this task to run daily via Task Scheduler.

---

### Step-by-Step Setup Instructions

#### Development Environment Setup

1. **Prerequisites Check**:
   ```cmd
   php -v
   composer -V
   mysql --version
   ```

2. **Clone and Install Dependencies**:
   ```cmd
   cd C:\xampp\htdocs
   git clone <repository> healthbridge
   cd healthbridge
   composer install
   npm install
   npm run build
   ```

3. **Configure Environment**:
   ```cmd
   copy .env.example .env
   php artisan key:generate
   ```

4. **Edit `.env` for Windows**:
   ```env
   APP_URL=http://localhost/healthbridge
   DB_HOST=127.0.0.1
   DB_PORT=3306
   COUCHDB_HOST=127.0.0.1
   COUCHDB_PORT=5984
   ```

5. **Run Migrations**:
   ```cmd
   php artisan migrate
   ```

6. **Start Sync Worker (Manual)**:
   ```cmd
   php artisan couchdb:sync --poll=4 --batch=10
   ```

7. **Start Sync Worker (Auto-restart)**:
   ```cmd
   deploy\windows\start-couchdb-sync.bat
   ```

#### Production Environment Setup (NSSM)

1. **Install Prerequisites**:
   ```powershell
   # Install Chocolatey if not present
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

   # Install NSSM
   choco install nssm -y
   ```

2. **Deploy Application**:
   ```cmd
   cd C:\xampp\htdocs
   git clone <repository> healthbridge
   cd healthbridge
   composer install --no-dev --optimize-autoloader
   npm install
   npm run build
   ```

3. **Configure Environment**:
   ```cmd
   copy .env.example .env
   php artisan key:generate
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```

4. **Set Permissions**:
   ```cmd
   icacls storage /grant "IIS_IUSRS:(OI)(CI)F" /T
   icacls bootstrap\cache /grant "IIS_IUSRS:(OI)(CI)F" /T
   ```

5. **Install NSSM Service**:
   ```cmd
   nssm install HealthBridgeCouchDBSync "C:\xampp\php\php.exe" "artisan couchdb:sync --daemon --poll=4 --batch=100"
   nssm set HealthBridgeCouchDBSync AppDirectory "C:\xampp\htdocs\healthbridge"
   nssm set HealthBridgeCouchDBSync AppStdout "C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync.log"
   nssm set HealthBridgeCouchDBSync AppStderr "C:\xampp\htdocs\healthbridge\storage\logs\couchdb-sync-error.log"
   nssm set HealthBridgeCouchDBSync AppRotateFiles 1
   nssm set HealthBridgeCouchDBSync AppRotateBytes 10485760
   nssm set HealthBridgeCouchDBSync AppExit Default Restart
   nssm set HealthBridgeCouchDBSync AppRestartDelay 5000
   ```

6. **Start Service**:
   ```cmd
   nssm start HealthBridgeCouchDBSync
   ```

7. **Verify Service is Running**:
   ```cmd
   sc query HealthBridgeCouchDBSync
   ```

---

### Windows Troubleshooting

#### Path Separator Issues

**Problem**: Scripts fail with "The system cannot find the path specified"

**Solutions**:

1. Use backslashes in Windows paths:
   ```cmd
   REM Correct
   C:\xampp\php\php.exe artisan couchdb:sync

   REM Also works (Laravel handles forward slashes)
   C:/xampp/php/php.exe artisan couchdb:sync
   ```

2. Use the `/d` switch with `cd` for drive changes:
   ```batch
   cd /d C:\xampp\htdocs\healthbridge
   ```

3. Use `%~dp0` for script-relative paths:
   ```batch
   REM %~dp0 expands to the script's directory with trailing backslash
   php %~dp0..\..\artisan couchdb:sync
   ```

#### Permission Issues

**Problem**: "Access denied" or "Permission denied" errors

**Solutions**:

1. Run Command Prompt as Administrator
2. Check folder permissions:
   ```cmd
   icacls C:\xampp\htdocs\healthbridge\storage
   ```

3. Grant permissions to required users:
   ```cmd
   REM Grant full control to IIS_IUSRS (for IIS)
   icacls C:\xampp\htdocs\healthbridge\storage /grant "IIS_IUSRS:(OI)(CI)F" /T

   REM Grant full control to NETWORK SERVICE (for services)
   icacls C:\xampp\htdocs\healthbridge\storage /grant "NT AUTHORITY\NETWORK SERVICE:(OI)(CI)F" /T

   REM For XAMPP, grant to Users group
   icacls C:\xampp\htdocs\healthbridge\storage /grant "Users:(OI)(CI)F" /T
   ```

4. Check if files are locked by another process:
   ```powershell
   # Find processes locking a file
   Get-Process | Where-Object { $_.Modules.FileName -like "*healthbridge*" }
   ```

#### Process Management Issues

**Problem**: Worker process terminates unexpectedly

**Solutions**:

1. Check Windows Event Viewer:
   - Open Event Viewer (`eventvwr.msc`)
   - Navigate to Windows Logs → Application
   - Look for PHP or application errors

2. Check PHP error log:
   ```cmd
   type C:\xampp\php\logs\php_error_log
   ```

3. Enable verbose logging:
   ```env
   # .env
   APP_DEBUG=true
   LOG_LEVEL=debug
   ```

4. Test worker manually:
   ```cmd
   cd C:\xampp\htdocs\healthbridge
   php artisan couchdb:sync --poll=4 --batch=10
   ```

#### Service Won't Start (NSSM)

**Problem**: NSSM service fails to start

**Solutions**:

1. Check service logs:
   ```cmd
   nssm get HealthBridgeCouchDBSync AppStdout
   nssm get HealthBridgeCouchDBSync AppStderr
   ```

2. Verify PHP path:
   ```cmd
   where php
   nssm get HealthBridgeCouchDBSync Application
   ```

3. Test command manually:
   ```cmd
   cd C:\xampp\htdocs\healthbridge
   C:\xampp\php\php.exe artisan couchdb:sync --daemon --poll=4 --batch=100
   ```

4. Check service account permissions:
   ```cmd
   nssm get HealthBridgeCouchDBSync ObjectName
   ```

5. Reinstall service:
   ```cmd
   nssm remove HealthBridgeCouchDBSync confirm
   nssm install HealthBridgeCouchDBSync
   ```

#### Memory Issues

**Problem**: Worker consumes too much memory over time

**Solutions**:

1. Reduce batch size:
   ```cmd
   php artisan couchdb:sync --daemon --poll=4 --batch=50
   ```

2. Schedule periodic restarts (Task Scheduler):
   ```powershell
   # Create a task to restart the service daily at 3 AM
   $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c nssm restart HealthBridgeCouchDBSync"
   $trigger = New-ScheduledTaskTrigger -Daily -At 3am
   Register-ScheduledTask -TaskName "Restart HealthBridge Sync" -Action $action -Trigger $trigger -User "SYSTEM"
   ```

3. Monitor memory usage:
   ```powershell
   Get-Process -Name php | Select-Object Name, Id, WorkingSet, PM
   ```

#### CouchDB Connection Issues

**Problem**: Cannot connect to CouchDB

**Solutions**:

1. Verify CouchDB is running:
   ```cmd
   curl http://localhost:5984/_up
   ```

2. Check firewall rules:
   ```cmd
   netsh advfirewall firewall show rule name=all | findstr 5984
   ```

3. Add firewall rule if needed:
   ```cmd
   netsh advfirewall firewall add rule name="CouchDB" dir=in action=allow protocol=TCP localport=5984
   ```

4. Test connection from PHP:
   ```cmd
   php artisan tinker
   ```
   ```php
   >>> app(App\Services\CouchDbService::class)->databaseExists()
   ```

#### Task Scheduler Issues

**Problem**: Task runs but worker doesn't start

**Solutions**:

1. Check task history:
   - In Task Scheduler, click the task → History tab

2. Verify action path:
   - Ensure the path to the batch file is correct
   - Ensure the "Start in" directory is set

3. Check "Run whether user is logged on or not":
   - This is required for background execution

4. Test the batch file manually:
   ```cmd
   C:\xampp\htdocs\healthbridge\deploy\windows\start-couchdb-sync.bat
   ```

---

### Windows Production Checklist

Before going live on Windows, verify:

- [ ] PHP 8.2+ is installed and in PATH
- [ ] Laravel application is deployed and configured
- [ ] `.env` file has correct database credentials
- [ ] Storage directory has correct permissions
- [ ] CouchDB is accessible from the server
- [ ] MySQL database is accessible
- [ ] NSSM service is installed (or Task Scheduler task is configured)
- [ ] Service/task starts automatically on boot
- [ ] Service/task restarts on failure
- [ ] Log files are being written
- [ ] Log rotation is configured
- [ ] Test sync works with a sample document
- [ ] Firewall rules allow required connections
- [ ] Service account has appropriate permissions

---

## Additional Resources

- [Supervisor Documentation](http://supervisord.org/)
- [Laravel Queues Documentation](https://laravel.com/docs/11.x/queues)
- [CouchDB Changes Feed](https://docs.couchdb.org/en/stable/api/database/changes.html)
- [Windows Task Scheduler](https://docs.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page)
- [NSSM - Non-Sucking Service Manager](https://nssm.cc/)
- [NSSM Usage Guide](https://nssm.cc/usage)

---

*Last updated: February 2026*
*HealthBridge Clinical Platform*
