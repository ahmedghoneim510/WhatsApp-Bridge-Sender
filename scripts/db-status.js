#!/usr/bin/env node

/**
 * Database Status Script
 * 
 * Shows the current status of the database:
 * - Connection status
 * - Tables and row counts
 * - Database size
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'whatsapp_bridge';
const DB_ENABLED = process.env.DB_ENABLED === 'true';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkConnection() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD
        });
        await connection.ping();
        await connection.end();
        return true;
    } catch (error) {
        return false;
    }
}

async function getDatabaseInfo() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    // Get table information
    const [tables] = await connection.query(`
    SELECT 
      table_name,
      table_rows,
      ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
    FROM information_schema.TABLES
    WHERE table_schema = ?
    ORDER BY table_rows DESC
  `, [DB_NAME]);

    // Get total database size
    const [dbSize] = await connection.query(`
    SELECT 
      ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS total_size_mb
    FROM information_schema.TABLES
    WHERE table_schema = ?
  `, [DB_NAME]);

    await connection.end();

    return {
        tables,
        totalSize: dbSize[0].total_size_mb
    };
}

async function getSessionStats() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    try {
        const [sessions] = await connection.query(`
      SELECT id, status, phone_number, last_connected_at
      FROM sessions
      ORDER BY last_connected_at DESC
    `);

        await connection.end();
        return sessions;
    } catch (error) {
        await connection.end();
        return [];
    }
}

async function main() {
    log('\n╔════════════════════════════════════════════════════════╗', 'bright');
    log('║          WhatsApp Bridge - Database Status            ║', 'bright');
    log('╚════════════════════════════════════════════════════════╝\n', 'bright');

    // Check if database is enabled
    if (!DB_ENABLED) {
        log('⚠️  Database is DISABLED (DB_ENABLED=false)', 'yellow');
        log('   Set DB_ENABLED=true in .env to enable database\n');
        return;
    }

    log('📊 Configuration:', 'cyan');
    log(`   Host: ${DB_HOST}:${DB_PORT}`);
    log(`   Database: ${DB_NAME}`);
    log(`   User: ${DB_USER}\n`);

    // Check connection
    log('🔌 Connection Status:', 'cyan');
    const isConnected = await checkConnection();
    if (!isConnected) {
        log('   ❌ Cannot connect to MySQL', 'red');
        log('   Make sure MySQL is running and credentials are correct\n');
        return;
    }
    log('   ✅ Connected successfully\n', 'green');

    try {
        // Get database info
        const { tables, totalSize } = await getDatabaseInfo();

        log('📁 Database Size:', 'cyan');
        log(`   Total: ${totalSize} MB\n`);

        log('📋 Tables:', 'cyan');
        if (tables.length === 0) {
            log('   ⚠️  No tables found', 'yellow');
            log('   Run: npm run migrate to create tables\n');
        } else {
            console.log('   ┌─────────────────────────┬──────────┬──────────┐');
            console.log('   │ Table                   │ Rows     │ Size (MB)│');
            console.log('   ├─────────────────────────┼──────────┼──────────┤');

            tables.forEach(table => {
                const name = table.table_name.padEnd(23);
                const rows = String(table.table_rows || 0).padStart(8);
                const size = String(table.size_mb || 0).padStart(8);
                console.log(`   │ ${name} │ ${rows} │ ${size} │`);
            });

            console.log('   └─────────────────────────┴──────────┴──────────┘\n');
        }

        // Get session stats
        const sessions = await getSessionStats();
        if (sessions.length > 0) {
            log('📱 Active Sessions:', 'cyan');
            sessions.forEach(session => {
                const status = session.status === 'open' ? '🟢' : '🔴';
                const phone = session.phone_number || 'N/A';
                const lastConnected = session.last_connected_at
                    ? new Date(session.last_connected_at).toLocaleString()
                    : 'Never';
                log(`   ${status} ${session.id} (${phone}) - Last: ${lastConnected}`);
            });
            log('');
        }

        log('✅ Database is healthy and operational\n', 'green');

    } catch (error) {
        if (error.code === 'ER_BAD_DB_ERROR') {
            log(`   ❌ Database '${DB_NAME}' does not exist`, 'red');
            log('   Run: npm run start:db to create it\n');
        } else {
            log(`   ❌ Error: ${error.message}`, 'red');
        }
    }
}

main();
