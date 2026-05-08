#!/usr/bin/env node

/**
 * Fresh Migration Script
 * 
 * This script drops all tables and recreates them.
 * WARNING: This will delete all data!
 */

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'whatsapp_bridge';

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function askConfirmation() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(
            `${colors.red}⚠️  WARNING: This will DELETE ALL DATA in database '${DB_NAME}'!\n` +
            `${colors.yellow}Are you sure you want to continue? (yes/no): ${colors.reset}`,
            (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'yes');
            }
        );
    });
}

async function dropAllTables(connection) {
    log('\n🗑️  Dropping all tables...', 'yellow');

    // Disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Get all tables
    const [tables] = await connection.query('SHOW TABLES');

    // Drop each table
    for (const table of tables) {
        const tableName = Object.values(table)[0];
        await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
        log(`  ✓ Dropped ${tableName}`);
    }

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    log('✅ All tables dropped', 'green');
}

async function runMigrations(connection) {
    log('\n🔨 Creating tables...', 'yellow');

    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    await connection.query(schema);

    // Verify tables
    const [tables] = await connection.query('SHOW TABLES');

    log('✅ Tables created successfully:', 'green');
    tables.forEach(table => {
        const tableName = Object.values(table)[0];
        log(`  ✓ ${tableName}`);
    });
}

async function main() {
    log('\n╔════════════════════════════════════════════════════════╗', 'yellow');
    log('║          Fresh Database Migration                      ║', 'yellow');
    log('╚════════════════════════════════════════════════════════╝\n', 'yellow');

    // Ask for confirmation
    const confirmed = await askConfirmation();

    if (!confirmed) {
        log('\n❌ Migration cancelled', 'red');
        process.exit(0);
    }

    let connection;

    try {
        log('\n📡 Connecting to MySQL...', 'yellow');
        connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            multipleStatements: true
        });
        log('✅ Connected', 'green');

        // Drop all tables
        await dropAllTables(connection);

        // Run migrations
        await runMigrations(connection);

        log('\n✨ Fresh migration completed successfully!', 'green');

    } catch (error) {
        log(`\n❌ Migration failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main();
