# 🎯 Smart Start Command - Complete Guide

## What is `npm run start:db`?

A single command that does **everything** for you:

```bash
npm run start:db
```

---

## ✨ What It Does

### Step 1: Checks MySQL Connection
```
[1/5] Checking MySQL connection...
✅ Connected to MySQL at localhost:3306
```

- Verifies MySQL is running
- Tests credentials
- Shows helpful error messages if fails

### Step 2: Checks Database Exists
```
[2/5] Checking if database exists...
✅ Database 'whatsapp_bridge' exists
```

- Looks for your database
- If not found, proceeds to create it

### Step 3: Creates Database (if needed)
```
[3/5] Creating database 'whatsapp_bridge'...
✅ Database 'whatsapp_bridge' created successfully
```

- Only runs if database doesn't exist
- Uses UTF8MB4 for full emoji support
- Skips if already exists

### Step 4: Creates Tables (if needed)
```
[4/5] Running database migrations...
✅ Database migrations completed
Created 7 tables:
  ✓ sessions
  ✓ messages
  ✓ polls
  ✓ poll_votes
  ✓ webhook_events
  ✓ contacts
  ✓ message_status_updates
```

- Checks if tables exist
- Creates them if missing
- Skips if already exist
- Shows what was created

### Step 5: Starts WhatsApp Bridge
```
[5/5] Starting WhatsApp Bridge...
{"level":30,"time":1234567890,"msg":"server listening","port":3000}
```

- Starts the main application
- Connects to WhatsApp
- Ready to send/receive messages

---

## 🎬 Usage Examples

### First Time Setup

```bash
# Clone and setup
git clone https://github.com/your-repo/whatsapp-bridge.git
cd whatsapp-bridge
npm install

# Configure
cp env.example .env
# Edit .env with your MySQL credentials

# Start everything!
npm run start:db
```

**Output:**
```
╔════════════════════════════════════════════════════════╗
║     WhatsApp Bridge - Smart Startup Script            ║
╚════════════════════════════════════════════════════════╝

ℹ️  Database: whatsapp_bridge
ℹ️  Host: localhost:3306
ℹ️  User: whatsapp

[1/5] Checking MySQL connection...
✅ Connected to MySQL at localhost:3306

[2/5] Checking if database exists...
⚠️  Database 'whatsapp_bridge' does not exist

[3/5] Creating database 'whatsapp_bridge'...
✅ Database 'whatsapp_bridge' created successfully

[4/5] Running database migrations...
✅ Database migrations completed
Created 7 tables:
  ✓ sessions
  ✓ messages
  ✓ polls
  ✓ poll_votes
  ✓ webhook_events
  ✓ contacts
  ✓ message_status_updates

════════════════════════════════════════════════════════
✅ Database setup complete!
════════════════════════════════════════════════════════

[5/5] Starting WhatsApp Bridge...
{"level":30,"time":1234567890,"msg":"database pool initialized"}
{"level":30,"time":1234567890,"msg":"server listening","port":3000}
```

---

### After Git Pull

```bash
git pull
npm install
npm run start:db  # Handles any new migrations automatically
```

---

### Production Deployment

```bash
# Deploy script
npm run start:db
```

It will:
- ✅ Check everything is ready
- ✅ Create missing tables
- ✅ Start the service

---

## 🔧 Configuration

The command uses these `.env` variables:

```env
# Database Configuration
DB_ENABLED=true              # Set to false to skip database
DB_HOST=localhost            # MySQL host
DB_PORT=3306                 # MySQL port
DB_USER=whatsapp             # MySQL username
DB_PASSWORD=your_password    # MySQL password
DB_NAME=whatsapp_bridge      # Database name
```

---

## 🚫 When Database is Disabled

If `DB_ENABLED=false`:

```bash
npm run start:db
```

**Output:**
```
╔════════════════════════════════════════════════════════╗
║     WhatsApp Bridge - Smart Startup Script            ║
╚════════════════════════════════════════════════════════╝

⚠️  Database is disabled (DB_ENABLED=false)
ℹ️  Starting bridge without database...

{"level":30,"time":1234567890,"msg":"server listening","port":3000}
```

Bridge starts normally without database checks.

---

## ❌ Error Handling

### MySQL Not Running

```
[1/5] Checking MySQL connection...
❌ Cannot connect to MySQL at localhost:3306
ℹ️  Make sure MySQL is running:
  - Ubuntu/Debian: sudo systemctl start mysql
  - macOS: brew services start mysql
  - Docker: docker-compose up -d mysql

❌ Cannot proceed without MySQL connection
```

**Fix:**
```bash
# Start MySQL
sudo systemctl start mysql

# Or with Docker
docker-compose up -d mysql

# Then try again
npm run start:db
```

---

### Wrong Credentials

```
[1/5] Checking MySQL connection...
❌ Access denied. Check DB_USER and DB_PASSWORD in .env
```

**Fix:**
```bash
# Edit .env
nano .env

# Update credentials
DB_USER=whatsapp
DB_PASSWORD=correct_password

# Try again
npm run start:db
```

---

### Migration Fails

```
[4/5] Running database migrations...
❌ Migration failed: Table 'messages' already exists
```

**Fix:**
```bash
# Reset database
npm run db:fresh

# Or manually
mysql -u whatsapp -p whatsapp_bridge -e "DROP DATABASE whatsapp_bridge;"

# Try again
npm run start:db
```

---

## 🆚 vs Other Commands

### `npm run start:db` vs `npm start`

| Feature | `npm run start:db` | `npm start` |
|---------|-------------------|-------------|
| Check MySQL | ✅ | ❌ |
| Create DB | ✅ | ❌ |
| Create Tables | ✅ | ❌ |
| Start Bridge | ✅ | ✅ |
| Error Messages | ✅ Helpful | ❌ Generic |
| **Use When** | First time, production | DB already setup |

### `npm run start:db` vs `docker-compose up`

| Feature | `npm run start:db` | `docker-compose up` |
|---------|-------------------|---------------------|
| Install MySQL | ❌ Manual | ✅ Automatic |
| Setup DB | ✅ | ✅ |
| Isolation | ❌ | ✅ Containers |
| **Use When** | Have MySQL | Want everything |

---

## 💡 Best Practices

### ✅ DO

- Use `npm run start:db` for production deployments
- Use it after pulling code updates
- Use it when unsure about database state
- Check output for errors

### ❌ DON'T

- Don't use if you want faster startup (use `npm start`)
- Don't use if database is disabled
- Don't ignore error messages

---

## 🔄 Graceful Shutdown

Press `Ctrl+C` to stop:

```
^C
Shutting down gracefully...
```

The script:
- Stops the bridge cleanly
- Closes database connections
- Exits properly

---

## 📊 Behind the Scenes

The script (`scripts/start-with-db.js`):

1. **Loads environment** - Reads `.env` file
2. **Checks DB_ENABLED** - Skips if disabled
3. **Tests connection** - Pings MySQL
4. **Checks database** - Queries information_schema
5. **Creates if needed** - Runs CREATE DATABASE
6. **Checks tables** - Runs SHOW TABLES
7. **Migrates if needed** - Executes schema.sql
8. **Spawns bridge** - Runs `node src/index.js`
9. **Handles signals** - Graceful shutdown on Ctrl+C

---

## 🎯 Quick Reference

```bash
# Smart start (recommended)
npm run start:db

# Check what it will do
npm run db:status

# Reset everything
npm run db:fresh
npm run start:db

# Skip database checks
npm start

# Development mode
npm run dev
```

---

## 📚 Related Commands

- `npm run db:status` - Check database health
- `npm run db:setup` - Just setup database (don't start)
- `npm run db:fresh` - Reset database
- `npm start` - Start without checks
- `npm run dev` - Development mode

Full command reference: [COMMANDS.md](COMMANDS.md)

---

## 🎉 Summary

**One command to rule them all:**

```bash
npm run start:db
```

✅ Checks everything  
✅ Creates what's missing  
✅ Starts the bridge  
✅ Handles errors gracefully  
✅ Perfect for production  

**Just works!** 🚀

---

**Created:** 2026-05-08  
**Version:** 1.0.0
