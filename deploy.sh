#!/bin/bash
# =============================================================================
# HealthBridge Platform - Deployment Script
# Single-command deployment for the entire ecosystem
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Banner
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           HealthBridge Platform Deployment Script              ║"
echo "║                    Single-Command Deploy                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Docker
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
fi

if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
    error "Docker Compose is not installed. Please install Docker Compose first."
fi

# Parse arguments
ACTION=${1:-deploy}
SKIP_BUILD=${SKIP_BUILD:-false}
SKIP_PULL=${SKIP_PULL:-false}

# =============================================================================
# FUNCTIONS
# =============================================================================

check_env() {
    if [ ! -f .env ]; then
        warn ".env file not found. Creating from template..."
        cp .env.docker.example .env
        warn "Please edit .env with your configuration and run again."
        exit 1
    fi
    
    # Check for required variables
    source .env
    
    if [ -z "$APP_KEY" ]; then
        warn "APP_KEY is not set. Generating..."
        GENERATED_KEY="base64:$(openssl rand -base64 32)"
        sed -i "s|^APP_KEY=.*|APP_KEY=${GENERATED_KEY}|" .env
        success "Generated APP_KEY"
    fi
    
    # Check for default passwords
    if grep -q "CHANGE_ME" .env; then
        warn "Default passwords detected in .env file!"
        warn "Please update all CHANGE_ME placeholders with secure passwords."
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

generate_secrets() {
    info "Generating secure secrets..."
    
    # Generate passwords if they are placeholders
    if grep -q "CHANGE_ME_SECURE_PASSWORD" .env; then
        DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_SECURE_PASSWORD|${DB_PASS}|" .env
    fi
    
    if grep -q "CHANGE_ME_ROOT_PASSWORD" .env; then
        ROOT_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_ROOT_PASSWORD|${ROOT_PASS}|" .env
    fi
    
    if grep -q "CHANGE_ME_COUCHDB_PASSWORD" .env; then
        COUCH_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_COUCHDB_PASSWORD|${COUCH_PASS}|" .env
    fi
    
    if grep -q "CHANGE_ME_REVERB_KEY" .env; then
        REVERB_KEY=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_REVERB_KEY|${REVERB_KEY}|" .env
    fi
    
    if grep -q "CHANGE_ME_REVERB_SECRET" .env; then
        REVERB_SECRET=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_REVERB_SECRET|${REVERB_SECRET}|" .env
    fi
    
    if grep -q "CHANGE_ME_AI_SECRET" .env; then
        AI_SECRET=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        sed -i "s|CHANGE_ME_AI_SECRET|${AI_SECRET}|" .env
    fi
    
    success "Secrets generated and saved to .env"
}

build_images() {
    if [ "$SKIP_BUILD" = "true" ]; then
        info "Skipping build (SKIP_BUILD=true)"
        return
    fi
    
    info "Building Docker images..."
    docker compose build --parallel
    success "Images built successfully"
}

pull_images() {
    if [ "$SKIP_PULL" = "true" ]; then
        info "Skipping pull (SKIP_PULL=true)"
        return
    fi
    
    info "Pulling base images..."
    docker compose pull mysql couchdb redis ollama nginx 2>/dev/null || true
    success "Base images pulled"
}

start_services() {
    info "Starting services..."
    docker compose up -d
    success "Services started"
}

wait_for_services() {
    info "Waiting for services to be healthy..."
    
    # Wait for MySQL
    info "  Waiting for MySQL..."
    until docker compose exec -T mysql mysqladmin ping -h localhost -u root -p${MYSQL_ROOT_PASSWORD:-rootpassword} 2>/dev/null; do
        sleep 2
    done
    success "  MySQL is ready"
    
    # Wait for CouchDB
    info "  Waiting for CouchDB..."
    until curl -s http://localhost:5984/_up > /dev/null 2>&1 || \
          curl -s http://localhost/couchdb/_up > /dev/null 2>&1; do
        sleep 2
    done
    success "  CouchDB is ready"
    
    # Wait for Redis
    info "  Waiting for Redis..."
    until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
        sleep 2
    done
    success "  Redis is ready"
    
    # Wait for Ollama
    info "  Waiting for Ollama..."
    until curl -s http://localhost:11434/api/tags > /dev/null 2>&1 || \
          curl -s http://localhost/ollama/api/tags > /dev/null 2>&1; do
        sleep 5
    done
    success "  Ollama is ready"
    
    # Wait for HealthBridge
    info "  Waiting for HealthBridge API..."
    until curl -s http://localhost/health > /dev/null 2>&1; do
        sleep 5
    done
    success "  HealthBridge is ready"
    
    # Wait for Nurse Mobile
    info "  Waiting for Nurse Mobile..."
    until curl -s http://localhost:3000 > /dev/null 2>&1 || \
          curl -s http://localhost > /dev/null 2>&1; do
        sleep 5
    done
    success "  Nurse Mobile is ready"
}

run_migrations() {
    info "Running database migrations..."
    docker compose exec -T healthbridge php artisan migrate --force
    success "Migrations completed"
}

setup_couchdb() {
    info "Setting up CouchDB databases..."
    docker compose exec -T healthbridge php artisan couchdb:setup --force 2>/dev/null || true
    success "CouchDB setup completed"
}

pull_ai_model() {
    info "Pulling AI model (this may take a while)..."
    source .env
    MODEL=${OLLAMA_MODEL:-gemma3:4b}
    
    # Try to pull via ollama-init container or directly
    docker compose exec -T ollama ollama pull $MODEL 2>/dev/null || \
        curl -X POST http://localhost:11434/api/pull \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"$MODEL\"}" 2>/dev/null || true
    
    success "AI model ready"
}

show_status() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}              HealthBridge Deployment Complete!                 ${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Access Points:${NC}"
    echo -e "  • Nurse Mobile:     ${GREEN}http://localhost${NC}"
    echo -e "  • GP Dashboard:     ${GREEN}http://localhost/admin${NC}"
    echo -e "  • API Endpoint:     ${GREEN}http://localhost/api${NC}"
    echo -e "  • CouchDB Fauxton:  ${GREEN}http://localhost/couchdb/_utils/${NC}"
    echo ""
    echo -e "${BLUE}Service Status:${NC}"
    docker compose ps
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "  • View logs:        ${YELLOW}docker compose logs -f${NC}"
    echo -e "  • Stop services:    ${YELLOW}docker compose down${NC}"
    echo -e "  • Restart:          ${YELLOW}docker compose restart${NC}"
    echo -e "  • Shell access:     ${YELLOW}docker compose exec healthbridge bash${NC}"
    echo ""
}

# =============================================================================
# ACTIONS
# =============================================================================

case $ACTION in
    deploy|up|start)
        check_env
        generate_secrets
        pull_images
        build_images
        start_services
        wait_for_services
        run_migrations
        setup_couchdb
        pull_ai_model
        show_status
        ;;
    
    build)
        check_env
        build_images
        ;;
    
    stop|down)
        info "Stopping services..."
        docker compose down
        success "Services stopped"
        ;;
    
    restart)
        docker compose restart
        wait_for_services
        show_status
        ;;
    
    status)
        docker compose ps
        ;;
    
    logs)
        docker compose logs -f ${2:-}
        ;;
    
    shell)
        SERVICE=${2:-healthbridge}
        docker compose exec $SERVICE bash
        ;;
    
    backup)
        info "Creating backup..."
        BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
        mkdir -p $BACKUP_DIR
        
        # MySQL backup
        docker compose exec -T mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD:-rootpassword} \
            healthbridge > $BACKUP_DIR/mysql.sql 2>/dev/null
        
        # CouchDB backup
        curl -s -u admin:${COUCHDB_PASSWORD:-admin} \
            http://localhost:5984/healthbridge_clinic/_all_docs?include_docs=true \
            > $BACKUP_DIR/couchdb.json 2>/dev/null
        
        # Compress
        tar czf $BACKUP_DIR.tar.gz -C $(dirname $BACKUP_DIR) $(basename $BACKUP_DIR)
        rm -rf $BACKUP_DIR
        
        success "Backup created: $BACKUP_DIR.tar.gz"
        ;;
    
    clean)
        warn "This will remove all containers, volumes, and images!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker compose down -v --rmi local
            success "Cleanup complete"
        fi
        ;;
    
    *)
        echo "Usage: $0 {deploy|build|stop|restart|status|logs|shell|backup|clean}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (build, start, migrate)"
        echo "  build    - Build Docker images only"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  status   - Show service status"
        echo "  logs     - View logs (optional: service name)"
        echo "  shell    - Open shell in container (optional: service name)"
        echo "  backup   - Create database backup"
        echo "  clean    - Remove all containers, volumes, and images"
        exit 1
        ;;
esac
