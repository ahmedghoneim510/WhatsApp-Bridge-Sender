# 🚀 START HERE - Complete Setup Guide

Welcome! This guide will get you up and running in **5 minutes**.

---

## ⚡ Quick Start (Fastest Way)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp env.example .env

# 3. Edit .env with your MySQL credentials
nano .env

# 4. Run the magic command!
npm run start:db
```

**That's it!** The command will:
- ✅ Check MySQL connection
- ✅ Create database if needed
- ✅ Create tables if needed
- ✅ Start WhatsApp Bridge

---

## 📋 Prerequisites

- ✅ Node.js 18+ installed
- ✅ MySQL 8.0+ installed (or Docker)
- ✅ npm or yarn

### Install MySQL (if needed)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
```

**macOS:**
```bash
brew install mysql
brew services start mysql
```

**Or use Docker:**
```bash
docker-compose up -d mysql
```

---

## 🔧 Configuration

Edit `.env` file:

```env
# Server
PORT=3000

# Database (REQUIRED)
DB_ENABLED=true
DB_HOST=localhost
DB_PORT=3306
DB_USER=whatsapp
DB_PASSWORD=your_password_here
DB_NAME=whatsapp_bridge

# Security (Optional for development)
API_KEY=
WHATSAPP_WEBHOOK_SECRET=
```

---

## 🎯 Your Main Command

```bash
npm run start:db
```

This **ONE command** does everything:

1. Checks if MySQL is accessible
2. Creates database if it doesn't exist
3. Creates all tables if they don't exist
4. Starts the WhatsApp Bridge

**Use this command every time you start the project!**

---

## 📱 Create Your First Session

### Option 1: Using Dashboard (Easiest)

1. Open browser: `http://localhost:3000/dashboard`
2. Click "Create New Session"
3. Enter session ID: `ghoneim` (or any name)
4. Enter webhook URL (optional): `http://your-app.com/webhooks/whatsapp`
5. Click "Create"
6. Scan QR code with WhatsApp on your phone
7. Wait for "Connected" status

### Option 2: Using API

```bash
# Create session
curl -X POST http://localhost:3000/sessions/ghoneim/connect \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "qr",
    "webhookUrl": "http://your-app.com/webhooks/whatsapp"
  }'

# Get QR code
curl http://localhost:3000/sessions/ghoneim/qr
```

---

## 📤 Send Your First Message

```bash
curl -X POST http://localhost:3000/sessions/ghoneim/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "201234567890",
    "message": "Hello from WhatsApp Bridge!"
  }'
```

**Phone number format:** Use international format without `+`
- ✅ Good: `201234567890`
- ❌ Bad: `+201234567890`

---

## ✅ Verify Everything Works

### 1. Check API Health

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok","uptime":123.45}`

### 2. Check Database Status

```bash
npm run db:status
```

Should show:
- ✅ Connected to MySQL
- ✅ 7 tables created
- ✅ Database size

### 3. Check Sessions

```bash
curl http://localhost:3000/sessions
```

Should show your session with status "open"

### 4. Check Message Was Saved

```bash
# Connect to MySQL
mysql -u whatsapp -p whatsapp_bridge

# Check messages
SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
```

---

## 📚 Available Commands

```bash
# 🚀 Start everything (RECOMMENDED)
npm run start:db

# 📊 Check database status
npm run db:status

# 🔄 Development mode (auto-reload)
npm run dev

# ⚠️ Reset database (deletes all data!)
npm run db:fresh

# 🧪 Run tests
npm test

# 🐳 Docker
docker-compose up -d
docker-compose logs -f
docker-compose down
```

**Full command reference:** [COMMANDS.md](COMMANDS.md)

---

## 🗄️ Database Tables

Your database has 7 tables:

| Table | Purpose |
|-------|---------|
| `sessions` | WhatsApp session tracking |
| `messages` | All sent/received messages |
| `polls` | Poll creations |
| `poll_votes` | Individual poll votes |
| `webhook_events` | Webhook delivery logs |
| `contacts` | Contact information |
| `message_status_updates` | Delivery/read receipts |

---

## 🔍 Query Your Data

```sql
-- Get recent messages
SELECT * FROM messages 
WHERE session_id = 'ghoneim' 
ORDER BY created_at DESC 
LIMIT 10;

-- Get conversation with a customer
SELECT direction, text_content, created_at
FROM messages
WHERE session_id = 'ghoneim'
  AND (from_phone = '201234567890' OR to_phone = '201234567890')
ORDER BY created_at ASC;

-- Get message statistics
SELECT * FROM message_stats 
WHERE session_id = 'ghoneim';

-- Get poll results
SELECT p.poll_name, COUNT(pv.id) as votes
FROM polls p
LEFT JOIN poll_votes pv ON p.id = pv.poll_id
WHERE p.session_id = 'ghoneim'
GROUP BY p.id;
```

---

## 🐛 Troubleshooting

### "Cannot connect to MySQL"

```bash
# Check if MySQL is running
sudo systemctl status mysql

# Start MySQL
sudo systemctl start mysql

# Or with Docker
docker-compose up -d mysql
```

### "Access denied"

```bash
# Check your .env credentials
cat .env | grep DB_

# Test MySQL connection
mysql -u whatsapp -p -h localhost
```

### "Database doesn't exist"

```bash
# Just run the smart start command
npm run start:db
# It will create the database automatically
```

### "Tables don't exist"

```bash
# Run migrations
npm run db:migrate

# Or fresh install
npm run db:fresh
```

### "Session not connected"

1. Open dashboard: `http://localhost:3000/dashboard`
2. Check session status
3. If "closed", delete and recreate
4. Scan QR code again

---

## 📖 Documentation

| File | Purpose |
|------|---------|
| **`START_HERE.md`** | ⭐ This file - start here! |
| `SMART_START_GUIDE.md` | Complete guide for `npm run start:db` |
| `COMMANDS.md` | All available commands |
| `QUICK_COMMANDS.md` | Quick reference card |
| `DATABASE_SETUP.md` | Complete database documentation |
| `MYSQL_QUICK_START.md` | MySQL setup guide |
| `ARCHITECTURE.md` | System architecture |
| `README.md` | Main project documentation |

---

## 🎯 Common Workflows

### Daily Development

```bash
# Start with auto-reload
npm run dev

# In another terminal, check status
npm run db:status
```

### After Git Pull

```bash
git pull
npm install
npm run start:db  # Handles any new migrations
```

### Production Deployment

```bash
# 1. Pull code
git pull

# 2. Install dependencies
npm install

# 3. Start (handles migrations)
npm run start:db

# Or with Docker
docker-compose up -d
```

### Reset Everything

```bash
# 1. Stop bridge (Ctrl+C)

# 2. Reset database
npm run db:fresh

# 3. Start again
npm run start:db
```

---

## 🔒 Security (Production)

Before going to production:

1. **Set API Key:**
   ```env
   API_KEY=your_secure_random_key_here
   ```

2. **Set Webhook Secret:**
   ```env
   WHATSAPP_WEBHOOK_SECRET=your_webhook_secret_here
   ```

3. **Use Strong MySQL Password:**
   ```env
   DB_PASSWORD=strong_random_password_here
   ```

4. **Enable HTTPS** for webhooks

5. **Restrict MySQL Access:**
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_bridge.* TO 'whatsapp'@'localhost';
   ```

---

## 💡 Pro Tips

1. **Always use `npm run start:db`** - It's smart and handles everything

2. **Check status regularly:**
   ```bash
   npm run db:status
   ```

3. **Backup your database:**
   ```bash
   mysqldump -u whatsapp -p whatsapp_bridge > backup.sql
   ```

4. **Use Docker for easiest setup:**
   ```bash
   docker-compose up -d
   ```

5. **Monitor logs:**
   ```bash
   docker-compose logs -f whatsapp-bridge
   ```

---

## 🎉 You're Ready!

You now have:

✅ WhatsApp Bridge running  
✅ MySQL database storing messages  
✅ Sessions connected  
✅ API ready to use  
✅ Complete documentation  

**Next steps:**

1. Create a session and scan QR code
2. Send a test message
3. Check it's saved in database
4. Integrate with your Laravel app
5. Build amazing features!

---

## 🆘 Need Help?

1. **Check logs:**
   ```bash
   docker-compose logs -f whatsapp-bridge
   ```

2. **Check database status:**
   ```bash
   npm run db:status
   ```

3. **Read documentation:**
   - [SMART_START_GUIDE.md](SMART_START_GUIDE.md)
   - [COMMANDS.md](COMMANDS.md)
   - [DATABASE_SETUP.md](DATABASE_SETUP.md)

4. **Check examples:**
   - `examples/laravel/` - Laravel integration
   - `examples/OTP_AND_NOTIFICATIONS.md` - Use cases

---

## 🚀 Quick Reference

```bash
# Start everything
npm run start:db

# Check status
npm run db:status

# Development mode
npm run dev

# Reset database
npm run db:fresh

# With Docker
docker-compose up -d
```

---

**Welcome to WhatsApp Bridge!** 🎉

**Your magic command:** `npm run start:db`

**Dashboard:** http://localhost:3000/dashboard

**API:** http://localhost:3000

**Have fun building!** 🚀
