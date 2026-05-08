# WhatsApp Bridge

A lightweight HTTP service that connects your application to WhatsApp using the [Baileys](https://github.com/WhiskeySockets/Baileys) library. Send and receive messages, manage multiple sessions, and integrate with any backend via webhooks.

---

## Features

- **Text messages** — send plain text to any WhatsApp number
- **Image messages** — send images from a URL or base64 with an optional caption
- **Bulk messaging** — send to multiple recipients with configurable delay
- **Polls** — create interactive polls
- **Interactive buttons** — send messages with quick-reply buttons
- **Inbound webhooks** — receive messages, poll votes, button replies, and status updates
- **Multiple sessions** — run several WhatsApp accounts simultaneously
- **Web dashboard** — browser UI to manage sessions and send messages
- **MySQL persistence** — store messages, sessions, and events in a database
- **Docker support** — single `docker-compose up` to get started
- **Rate limiting** — built-in protection against abuse
- **API key auth** — optional key-based authentication

---

## Requirements

- Node.js 18+
- npm
- A WhatsApp account (personal or Business)
- MySQL 8+ *(optional — only needed if `DB_ENABLED=true`)*
- Docker & Docker Compose *(optional)*

---

## Quick Start

### Without Docker

```bash
git clone https://github.com/your-repo/whatsapp-bridge.git
cd whatsapp-bridge

npm install
cp env.example .env

# Start with automatic database setup
npm run start:db
```

Then open `http://localhost:3000/dashboard`.

### With Docker

```bash
docker-compose up -d
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run start:db` | Start the server + auto-create and migrate the database |
| `npm start` | Start the server without database setup |
| `npm run dev` | Start with file watching (auto-restart on changes) |
| `npm test` | Run API tests |
| `npm run db:setup` | Create database tables |
| `npm run db:fresh` | Drop and recreate all tables |
| `npm run db:status` | Check database connection and table status |
| `npm run docker:build` | Build the Docker image |

---

## Configuration

Copy `env.example` to `.env` and adjust as needed:

```env
# Server
PORT=3000
LOG_LEVEL=info

# API Authentication (leave empty to disable — development only)
API_KEY=

# Session files location
SESSION_DIR=data/sessions

# CORS (comma-separated origins)
CORS_ORIGIN=http://localhost:3000

# Bulk messaging
MAX_BULK_SIZE=100

# Database (set DB_ENABLED=true to activate)
DB_ENABLED=false
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=whatsapp_bridge
```

> **Note:** `data/sessions` stores WhatsApp authentication credentials. Do not delete this folder while sessions are active.

---

## Dashboard

Open `http://localhost:3000/dashboard` in your browser.

**Creating a session:**
1. Click **New Session**
2. Enter a session ID (e.g. `main`, `sales`, `support`)
3. Optionally add a webhook URL and secret
4. Click **Create** — a QR code will appear
5. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device**
6. Scan the QR code
7. The session status will change to **Connected**

---

## API Reference

All endpoints are prefixed with the server base URL (default `http://localhost:3000`).

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions` | List all sessions |
| `GET` | `/sessions/:id` | Get a single session |
| `POST` | `/sessions/:id/connect` | Create or reconnect a session |
| `GET` | `/sessions/:id/qr` | Get the current QR code |
| `DELETE` | `/sessions/:id` | Delete a session |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/:id/send` | Send a text message |
| `POST` | `/sessions/:id/send-image` | Send an image |
| `POST` | `/sessions/:id/send-poll` | Send a poll |
| `POST` | `/sessions/:id/send-buttons` | Send a message with buttons |
| `POST` | `/sessions/:id/send-bulk` | Send to multiple recipients |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/dashboard` | Web dashboard |

---

## Request Examples

**Create a session:**
```bash
curl -X POST http://localhost:3000/sessions/main/connect \
  -H "Content-Type: application/json" \
  -d '{"mode": "qr", "webhookUrl": "https://your-app.com/webhook"}'
```

**Send a text message:**
```bash
curl -X POST http://localhost:3000/sessions/main/send \
  -H "Content-Type: application/json" \
  -d '{"to": "201234567890", "message": "Hello from WhatsApp Bridge!"}'
```

**Send an image:**
```bash
curl -X POST http://localhost:3000/sessions/main/send-image \
  -H "Content-Type: application/json" \
  -d '{"to": "201234567890", "imageUrl": "https://example.com/photo.jpg", "caption": "Check this out"}'
```

**Send bulk messages:**
```bash
curl -X POST http://localhost:3000/sessions/main/send-bulk \
  -H "Content-Type: application/json" \
  -d '{"recipients": ["201234567890", "201098765432"], "message": "Hello!", "delay": 1000}'
```

**Phone number format:** use international format without `+` — e.g. `201234567890`. Egyptian local format (`01012345678`) is also accepted and normalized automatically.

---

## Webhooks

When a session has a `webhookUrl` configured, the bridge will POST events to that URL.

### Event Types

| Type | Trigger |
|------|---------|
| `connection_update` | Session connects, disconnects, or QR refreshes |
| `message` | Inbound text message |
| `button_reply` | User tapped a button |
| `list_reply` | User selected a list item |
| `poll` | A poll was created |
| `poll_vote` | A user voted in a poll |
| `message_update` | Message delivery status changed |

### Example Payload

```json
{
  "type": "message",
  "sessionId": "main",
  "eventId": "abc123",
  "messageId": "XYZ789",
  "from": "201234567890@s.whatsapp.net",
  "text": "Hello",
  "messageType": "conversation",
  "timestamp": 1700000000
}
```

### Webhook Security

Set a `webhookSecret` when creating a session. The bridge will include it in every request as the `x-webhook-secret` header. Verify it on your server to reject forged requests.

---

## Laravel Integration

See [`examples/laravel/`](examples/laravel/) for ready-to-use files:

- `WhatsAppService.php` — service class for sending messages
- `WhatsAppWebhookController.php` — controller for receiving events
- `CustomerController.php` — example usage in a controller
- `config.php` — configuration file
- `routes.php` — route definitions

**Quick example:**

```php
use App\Services\WhatsAppService;

$wa = app(WhatsAppService::class);

// Send text
$wa->sendMessage('main', '201234567890', 'Your order has been confirmed!');

// Send image
$wa->sendImage('main', '201234567890', 'https://example.com/receipt.jpg', 'Your receipt');

// Send poll
$wa->sendPoll('main', '201234567890', 'Rate our service', ['Excellent', 'Good', 'Needs improvement']);
```

Add to your Laravel `.env`:

```env
WHATSAPP_BRIDGE_URL=http://localhost:3000
WHATSAPP_DEFAULT_SESSION=main
WHATSAPP_WEBHOOK_SECRET=your-secret
WHATSAPP_API_KEY=   # only if API_KEY is set in the bridge
```

---

## Security

**API key** — set `API_KEY` in `.env`. All requests to `/sessions/*` must include the key:
```
X-API-Key: your-key
# or
Authorization: Bearer your-key
```

**Webhook secret** — set `webhookSecret` when creating a session. Validate the `x-webhook-secret` header on your server.

**Production checklist:**
- Set a strong `API_KEY`
- Use HTTPS for both the bridge and your webhook endpoint
- Set `CORS_ORIGIN` to your actual frontend domain
- Do not expose the bridge port publicly without a reverse proxy

---

## Troubleshooting

**"Session is not connected"**
- Open the dashboard and check the session status
- If it shows `closed`, delete the session and create a new one, then scan the QR again

**"QR code not available"**
- The session may still be initializing — wait a few seconds and try again
- If it persists, delete and recreate the session

**"Unauthorized" (401)**
- You have `API_KEY` set in `.env` — include it in your request headers

**"Recipient is invalid"**
- Use international format without `+`: `201234567890`
- Make sure the number is registered on WhatsApp

**Messages time out**
- Single message timeout: 30 seconds
- Bulk message timeout: 60 seconds
- Check that the session is connected and the number is valid

---

## Project Structure

```
whatsapp-bridge/
├── src/
│   ├── index.js              # Main application entry point
│   ├── database.js           # MySQL connection and queries
│   └── database-integration.js
├── scripts/
│   ├── start-with-db.js      # Smart startup script
│   ├── setup-database.js     # Create database tables
│   ├── migrate-fresh.js      # Drop and recreate tables
│   ├── db-status.js          # Check database status
│   └── test-api.js           # API test runner
├── public/
│   ├── index.html            # Dashboard HTML
│   ├── css/dashboard.css     # Dashboard styles
│   └── js/
│       ├── dashboard.js      # Dashboard logic
│       └── modals.js         # Modal components
├── database/
│   └── schema.sql            # Database schema
├── examples/
│   └── laravel/              # Laravel integration files
├── data/
│   └── sessions/             # WhatsApp auth files (auto-created)
├── docker-compose.yml
├── Dockerfile
└── .env
```

---

## License

MIT

---

## Contributing

1. Open an issue to discuss the change
2. Fork the repository
3. Submit a pull request

---

*Built with [Baileys](https://github.com/WhiskeySockets/Baileys) and [Express](https://expressjs.com/).*
