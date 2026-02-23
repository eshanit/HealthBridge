-- =============================================================================
-- HealthBridge Platform - MySQL Initialization Script
-- Creates databases and sets up initial permissions
-- =============================================================================

-- Set character set
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Create healthbridge database (if not exists)
CREATE DATABASE IF NOT EXISTS healthbridge 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Grant permissions to healthbridge user
-- Note: User is created by MySQL docker image via MYSQL_USER/MYSQL_PASSWORD
GRANT ALL PRIVILEGES ON healthbridge.* TO 'healthbridge'@'%';
GRANT ALL PRIVILEGES ON healthbridge.* TO 'healthbridge'@'localhost';

-- Flush privileges
FLUSH PRIVILEGES;

-- Use the healthbridge database
USE healthbridge;

-- Create a simple health check table
CREATE TABLE IF NOT EXISTS system_health (
    id INT AUTO_INCREMENT PRIMARY KEY,
    check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'healthy',
    version VARCHAR(50) DEFAULT '1.0.0'
);

-- Insert initial health record
INSERT INTO system_health (status, version) VALUES ('initialized', '1.0.0');
