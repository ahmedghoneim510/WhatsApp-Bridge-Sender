#!/usr/bin/env node

/**
 * Smart Startup Script
 * 
 * This script:
 * 1. Checks if MySQL is accessible
 * 2. Creates database if it doesn't exist
 * 3. Creates/migrates tables
 * 4. Starts the WhatsApp Bridge
 */

import { spawn } from 'child_process';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_ENABLED = process.env.DB_ENABLED === 'true';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'whatsapp_bridge';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

/**
 * Check if MySQL is accessible
 */
async function checkMySQLConnection() {
    logStep('1/5', 'Checking MySQL connection...');

    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD
        });

        await connection.ping();
        await connection.end();

        logSuccess(`Connected to MySQL at ${DB_HOST}:${DB_PORT}`);
        return true;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            logError(`Cannot connect to MySQL at ${DB_HOST}:${DB_PORT}`);
            logInfo('Make sure MySQL is running:');
            console.log('  - Ubuntu/Debian: sudo systemctl start mysql');
            console.log('  - macOS: brew services start mysql');
            console.log('  - Docker: docker-compose up -d mysql');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            logError('Access denied. Check DB_USER and DB_PASSWORD in .env');
        } else {
            logError(`MySQL connection failed: ${error.message}`);
        }
        return false;
    }
}

/**
 * Check if database exists
 */
async function checkDatabaseExists() {
    logStep('2/5', 'Checking if database exists...');

    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD
        });

        const [databases] = await connection.query(
            'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
            [DB_NAME]
        );

        await connection.end();

        if (databases.length > 0) {
            logSuccess(`Database '${DB_NAME}' exists`);
            return true;
        } else {
            logWarning(`Database '${DB_NAME}' does not exist`);
            return false;
        }
    } catch (error) {
        logError(`Failed to check database: ${error.message}`);
        throw error;
    }
}

/**
 * Create database if it doesn't exist
 */
async function createDatabase() {
    logStep('3/5', `Creating database '${DB_NAME}'...`);

    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD
        });

        await connection.query(
            `CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        await connection.end();

        logSuccess(`Database '${DB_NAME}' created successfully`);
        return true;
    } catch (error) {
        logError(`Failed to create database: ${error.message}`);
        throw error;
    }
}

/**
 * Check if tables exist
 */
async function checkTablesExist() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME
        });

        const [tables] = await connection.query('SHOW TABLES');
        await connection.end();

        return tables.length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * Run database migrations (create tables)
 */
async function runMigrations() {
    logStep('4/5', 'Running database migrations...');

    try {
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');

        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            multipleStatements: true
        });

        // Execute schema
        await connection.query(schema);

        // Verify tables
        const [tables] = await connection.query('SHOW TABLES');

        await connection.end();

        logSuccess('Database migrations completed');
        logInfo(`Created ${tables.length} tables:`);
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`  ✓ ${tableName}`);
        });

        return true;
    } catch (error) {
        logError(`Migration failed: ${error.message}`);
        throw error;
    }
}

/**
 * Start the WhatsApp Bridge
 */
async function startBridge() {
    logStep('5/5', 'Starting WhatsApp Bridge...');

    return new Promise((resolve, reject) => {
        const bridge = spawn('node', ['src/index.js'], {
            stdio: 'inherit',
            env: process.env
        });

        bridge.on('error', (error) => {
            logError(`Failed to start bridge: ${error.message}`);
            reject(error);
        });

        bridge.on('exit', (code) => {
            if (code !== 0) {
                logError(`Bridge exited with code ${code}`);
                process.exit(code);
            }
        });

        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
            log('\n\nShutting down gracefully...', 'yellow');
            bridge.kill('SIGINT');
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        process.on('SIGTERM', () => {
            bridge.kill('SIGTERM');
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });
    });
}

/**
 * Main startup flow
 */
async function main() {
    log('\n╔════════════════════════════════════════════════════════╗', 'bright');
    log('║     WhatsApp Bridge - Smart Startup Script            ║', 'bright');
    log('╚════════════════════════════════════════════════════════╝', 'bright');

    try {
        // Check if database is enabled
        if (!DB_ENABLED) {
            logWarning('Database is disabled (DB_ENABLED=false)');
            logInfo('Starting bridge without database...\n');
            await startBridge();
            return;
        }

        logInfo(`Database: ${DB_NAME}`);
        logInfo(`Host: ${DB_HOST}:${DB_PORT}`);
        logInfo(`User: ${DB_USER}\n`);

        // Step 1: Check MySQL connection
        const isConnected = await checkMySQLConnection();
        if (!isConnected) {
            logError('Cannot proceed without MySQL connection');
            process.exit(1);
        }

        // Step 2: Check if database exists
        const dbExists = await checkDatabaseExists();

        // Step 3: Create database if needed
        if (!dbExists) {
            await createDatabase();
        }

        // Step 4: Check if tables exist and run migrations if needed
        const tablesExist = await checkTablesExist();
        if (!tablesExist) {
            logInfo('No tables found, running migrations...');
            await runMigrations();
        } else {
            logSuccess('Database tables already exist');
            logInfo('Skipping migrations (use npm run migrate:fresh to recreate)');
        }

        // Step 5: Start the bridge
        log('\n' + '═'.repeat(60), 'bright');
        logSuccess('Database setup complete!');
        log('═'.repeat(60) + '\n', 'bright');

        await startBridge();

    } catch (error) {
        logError(`Startup failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run the startup script
main();
