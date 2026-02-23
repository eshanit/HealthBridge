# =============================================================================
# UtanoBridge Platform - Makefile
# Convenient commands for Docker deployment
# =============================================================================

.PHONY: help deploy build stop restart status logs shell backup clean init

# Default target
help:
	@echo "UtanoBridge Platform - Deployment Commands"
	@echo ""
	@echo "Usage: make [command]"
	@echo ""
	@echo "Commands:"
	@echo "  init      Initialize environment from template"
	@echo "  deploy    Full deployment (build, start, migrate)"
	@echo "  build     Build Docker images"
	@echo "  stop      Stop all services"
	@echo "  restart   Restart all services"
	@echo "  status    Show service status"
	@echo "  logs      View logs (use: make logs SERVICE=name)"
	@echo "  shell     Open shell in container (use: make shell SERVICE=name)"
	@echo "  backup    Create database backup"
	@echo "  clean     Remove all containers and volumes"
	@echo "  test      Run deployment tests"
	@echo ""

# Initialize environment
init:
	@if [ ! -f .env ]; then \
		cp .env.docker.example .env && \
		echo "Created .env file. Please edit with your configuration."; \
	else \
		echo ".env file already exists."; \
	fi

# Full deployment
deploy:
	@./deploy.sh deploy

# Build images
build:
	@docker compose build --parallel

# Stop services
stop:
	@docker compose down

# Restart services
restart:
	@docker compose restart

# Show status
status:
	@docker compose ps

# View logs
logs:
	@docker compose logs -f $(SERVICE)

# Open shell
shell:
	@docker compose exec $(or $(SERVICE),healthbridge) bash || \
	 docker compose exec $(or $(SERVICE),healthbridge) sh

# Create backup
backup:
	@./deploy.sh backup

# Clean up
clean:
	@./deploy.sh clean

# Run tests
test:
	@echo "Running deployment tests..."
	@curl -sf http://localhost/health || (echo "Health check failed!"; exit 1)
	@curl -sf http://localhost/couchdb/_up || (echo "CouchDB check failed!"; exit 1)
	@echo "All tests passed!"

# Pull AI model
pull-model:
	@docker compose exec ollama ollama pull $(or $(MODEL),gemma3:4b)

# Run migrations
migrate:
	@docker compose exec healthbridge php artisan migrate --force

# Setup CouchDB
setup-couchdb:
	@docker compose exec healthbridge php artisan couchdb:setup --force

# Clear cache
clear-cache:
	@docker compose exec healthbridge php artisan cache:clear
	@docker compose exec healthbridge php artisan config:clear
	@docker compose exec healthbridge php artisan view:clear
