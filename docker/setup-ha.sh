#!/bin/bash

# High Availability Setup Script for Laundromat App
# Usage: ./setup-ha.sh [server1|server2|init-replica]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Laundromat App High Availability Setup ===${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cat > .env << 'EOF'
# Server Configuration
SERVER1_IP=YOUR_SERVER1_IP
SERVER2_IP=YOUR_SERVER2_IP

# MongoDB Credentials
MONGO_USER=admin
MONGO_PASSWORD=your_secure_password_here

# Application Secrets
JWT_SECRET=your_jwt_secret_here_at_least_32_chars

# Domain (optional, for SSL)
DOMAIN=yourdomain.com
EOF
    echo -e "${RED}Please edit .env file with your actual values, then run this script again.${NC}"
    exit 1
fi

# Load environment variables
source .env

# Generate MongoDB keyfile for replica set authentication
generate_keyfile() {
    if [ ! -f mongo-keyfile ]; then
        echo -e "${YELLOW}Generating MongoDB keyfile...${NC}"
        openssl rand -base64 756 > mongo-keyfile
        chmod 400 mongo-keyfile
        echo -e "${GREEN}MongoDB keyfile generated. Copy this file to both servers!${NC}"
    else
        echo -e "${GREEN}MongoDB keyfile already exists.${NC}"
    fi
}

# Setup Server 1 (Primary)
setup_server1() {
    echo -e "${GREEN}Setting up Server 1 (Primary)...${NC}"

    generate_keyfile

    # Build and start containers
    docker-compose -f docker-compose.server1.yml build
    docker-compose -f docker-compose.server1.yml up -d

    echo -e "${GREEN}Server 1 is running!${NC}"
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Copy mongo-keyfile to Server 2"
    echo "2. Run './setup-ha.sh server2' on Server 2"
    echo "3. Run './setup-ha.sh init-replica' on Server 1 to initialize replica set"
}

# Setup Server 2 (Secondary)
setup_server2() {
    echo -e "${GREEN}Setting up Server 2 (Secondary)...${NC}"

    if [ ! -f mongo-keyfile ]; then
        echo -e "${RED}Error: mongo-keyfile not found. Copy it from Server 1 first!${NC}"
        exit 1
    fi

    chmod 400 mongo-keyfile

    # Build and start containers
    docker-compose -f docker-compose.server2.yml build
    docker-compose -f docker-compose.server2.yml up -d

    echo -e "${GREEN}Server 2 is running!${NC}"
    echo -e "${YELLOW}Next: Run './setup-ha.sh init-replica' on Server 1${NC}"
}

# Initialize MongoDB Replica Set
init_replica() {
    echo -e "${GREEN}Initializing MongoDB Replica Set...${NC}"

    if [ -z "$SERVER1_IP" ] || [ -z "$SERVER2_IP" ]; then
        echo -e "${RED}Error: SERVER1_IP and SERVER2_IP must be set in .env${NC}"
        exit 1
    fi

    # Wait for MongoDB to be ready
    echo "Waiting for MongoDB to be ready..."
    sleep 10

    # Initialize replica set
    docker exec mongodb-primary mongosh --eval "
    rs.initiate({
      _id: 'rs0',
      members: [
        { _id: 0, host: '${SERVER1_IP}:27017', priority: 2 },
        { _id: 1, host: '${SERVER2_IP}:27017', priority: 1 }
      ]
    })
    " -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin

    echo -e "${GREEN}Replica set initialized!${NC}"

    # Check replica set status
    echo -e "${YELLOW}Replica Set Status:${NC}"
    docker exec mongodb-primary mongosh --eval "rs.status()" -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin
}

# Check status of all services
check_status() {
    echo -e "${GREEN}=== Service Status ===${NC}"

    echo -e "\n${YELLOW}Docker Containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo -e "\n${YELLOW}MongoDB Replica Set Status:${NC}"
    docker exec mongodb-primary mongosh --eval "rs.status().members.forEach(m => print(m.name + ' - ' + m.stateStr))" -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin 2>/dev/null || echo "MongoDB not accessible"

    echo -e "\n${YELLOW}App Health Checks:${NC}"
    curl -sf http://localhost/api/health && echo " - App OK" || echo " - App NOT OK"
}

# Show logs
show_logs() {
    echo -e "${GREEN}=== Recent Logs ===${NC}"
    docker-compose -f docker-compose.server1.yml logs --tail=50 2>/dev/null || \
    docker-compose -f docker-compose.server2.yml logs --tail=50
}

# Backup MongoDB
backup_mongodb() {
    echo -e "${GREEN}=== Backing up MongoDB ===${NC}"
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR

    docker exec mongodb-primary mongodump \
        -u $MONGO_USER -p $MONGO_PASSWORD \
        --authenticationDatabase admin \
        --out /data/backup

    docker cp mongodb-primary:/data/backup $BACKUP_DIR

    echo -e "${GREEN}Backup saved to $BACKUP_DIR${NC}"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  server1      Setup Server 1 (Primary)"
    echo "  server2      Setup Server 2 (Secondary)"
    echo "  init-replica Initialize MongoDB replica set"
    echo "  status       Check status of all services"
    echo "  logs         Show recent logs"
    echo "  backup       Backup MongoDB database"
    echo "  help         Show this help message"
}

# Main
case "$1" in
    server1)
        setup_server1
        ;;
    server2)
        setup_server2
        ;;
    init-replica)
        init_replica
        ;;
    status)
        check_status
        ;;
    logs)
        show_logs
        ;;
    backup)
        backup_mongodb
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        usage
        exit 1
        ;;
esac
