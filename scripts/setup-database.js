#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * This script initializes the MySQL database and creates all required tables.
 * Run this before starting the WhatsApp Bridge for the first time.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
};

async function setupDatabase() {
    console.log('🔧 Setting up WhatsApp Bridge database...\n');

    let connection;

    try {
        // Connect to MySQL
        console.log(`📡 Connecting to MySQL at ${config.host}:${config.port}...`);
        connection = await mysql.createConnection(config);
        console.log('✅ Connected to MySQL\n');

        // Read schema file
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        console.log(`📄 Reading schema from ${schemaPath}...`);
        const schema = await fs.readFile(schemaPath, 'utf8');
        console.log('✅ Schema file loaded\n');

        // Execute schema
        console.log('🔨 Creating database and tables...');
        await connection.query(schema);
        console.log('✅ Database and tables created successfully\n');

        // Verify tables
        const dbName = process.env.DB_NAME || 'whatsapp_bridge';
        await connection.query(`USE ${dbName}`);
        const [tables] = await connection.query('SHOW TABLES');

        console.log('📊 Created tables:');
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`   ✓ ${tableName}`);
        });

        console.log('\n✨ Database setup completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Update your .env file with database credentials');
        console.log('   2. Set DB_ENABLED=true in .env');
        console.log('   3. Start the WhatsApp Bridge: npm start');

    } catch (error) {
        console.error('\n❌ Error setting up database:');
        console.error(error.message);

        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Tip: Make sure MySQL is running');
            console.error('   - Check if MySQL service is started');
            console.error('   - Verify DB_HOST and DB_PORT in .env');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n💡 Tip: Check your database credentials');
            console.error('   - Verify DB_USER and DB_PASSWORD in .env');
        }

        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run setup
setupDatabase();
