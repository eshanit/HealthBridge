#!/bin/bash
# =============================================================================
# HealthBridge Core - Docker Entrypoint Script
# Handles initialization, migrations, and service startup
# =============================================================================

set -e

echo "🚀 Starting HealthBridge Core..."

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL..."
until nc -z ${DB_HOST:-mysql} ${DB_PORT:-3306}; do
  sleep 1
done
echo "✅ MySQL is ready!"

# Wait for CouchDB to be ready
echo "⏳ Waiting for CouchDB..."
until curl -s http://${COUCHDB_HOST:-couchdb}:5984/_up > /dev/null 2>&1; do
  sleep 1
done
echo "✅ CouchDB is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis..."
until nc -z ${REDIS_HOST:-redis} ${REDIS_PORT:-6379}; do
  sleep 1
done
echo "✅ Redis is ready!"

# Create storage directories if they don't exist
mkdir -p /var/www/html/storage/logs
mkdir -p /var/www/html/storage/framework/sessions
mkdir -p /var/www/html/storage/framework/views
mkdir -p /var/www/html/storage/framework/cache
mkdir -p /var/www/html/bootstrap/cache

# Set permissions
chown -R www-data:www-data /var/www/html/storage
chown -R www-data:www-data /var/www/html/bootstrap/cache
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

# Generate application key if not set
if [ -z "$APP_KEY" ]; then
    echo "🔑 Generating application key..."
    php artisan key:generate --force
fi

# Run migrations
echo "📦 Running database migrations..."
php artisan migrate --force --no-interaction

# Cache configuration and routes
echo "⚡ Caching configuration..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Setup CouchDB databases
echo "🗄️ Setting up CouchDB..."
php artisan couchdb:setup --force || echo "⚠️ CouchDB setup had warnings, continuing..."

# Create storage link
php artisan storage:link 2>/dev/null || true

echo "✅ Initialization complete!"

# Execute the main command
exec "$@"
