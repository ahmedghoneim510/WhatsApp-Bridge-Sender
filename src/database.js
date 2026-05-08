import mysql from 'mysql2/promise';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let pool = null;

/**
 * Initialize MySQL connection pool
 */
export function initDatabase() {
    if (pool) return pool;

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'whatsapp_bridge',
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        charset: 'utf8mb4'
    };

    pool = mysql.createPool(config);

    logger.info({ host: config.host, database: config.database }, 'database pool initialized');

    return pool;
}

/**
 * Get database connection pool
 */
export function getDatabase() {
    if (!pool) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return pool;
}

/**
 * Test database connection
 */
export async function testConnection() {
    try {
        const db = getDatabase();
        await db.query('SELECT 1');
        logger.info('database connection test successful');
        return true;
    } catch (error) {
        logger.error({ error: error.message }, 'database connection test failed');
        return false;
    }
}

/**
 * Close database connection pool
 */
export async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('database pool closed');
    }
}

/**
 * Extract phone number from JID
 */
function extractPhone(jid) {
    if (!jid) return null;
    const match = jid.match(/^(\d+)@/);
    return match ? match[1] : null;
}

/**
 * Save or update session in database
 */
export async function saveSession(sessionData) {
    const db = getDatabase();
    const { id, status, identity, webhook } = sessionData;

    try {
        await db.query(
            `INSERT INTO sessions (id, status, phone_number, user_jid, name, webhook_url, webhook_secret, last_connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         phone_number = VALUES(phone_number),
         user_jid = VALUES(user_jid),
         name = VALUES(name),
         webhook_url = VALUES(webhook_url),
         webhook_secret = VALUES(webhook_secret),
         last_connected_at = VALUES(last_connected_at)`,
            [
                id,
                status,
                identity?.phoneNumber || null,
                identity?.userJid || null,
                identity?.name || null,
                webhook?.url || null,
                webhook?.secret || null,
                status === 'open' ? new Date() : null
            ]
        );
        logger.debug({ sessionId: id }, 'session saved to database');
    } catch (error) {
        logger.error({ error: error.message, sessionId: id }, 'failed to save session');
    }
}

/**
 * Update session status
 */
export async function updateSessionStatus(sessionId, status) {
    const db = getDatabase();
    try {
        const updateField = status === 'closed' ? 'last_disconnected_at' : 'last_connected_at';
        await db.query(
            `UPDATE sessions SET status = ?, ${updateField} = ? WHERE id = ?`,
            [status, new Date(), sessionId]
        );
    } catch (error) {
        logger.error({ error: error.message, sessionId }, 'failed to update session status');
    }
}

/**
 * Save message to database
 */
export async function saveMessage(sessionId, messageData) {
    const db = getDatabase();
    const {
        messageId,
        direction,
        from,
        to,
        messageType,
        text,
        mediaUrl,
        caption,
        status,
        timestamp,
        raw
    } = messageData;

    try {
        const [result] = await db.query(
            `INSERT INTO messages (
        session_id, message_id, direction, from_jid, from_phone, 
        to_jid, to_phone, message_type, text_content, media_url, 
        caption, status, timestamp, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        raw_data = VALUES(raw_data)`,
            [
                sessionId,
                messageId,
                direction,
                from,
                extractPhone(from),
                to,
                extractPhone(to),
                messageType,
                text || null,
                mediaUrl || null,
                caption || null,
                status || 'pending',
                timestamp,
                JSON.stringify(raw)
            ]
        );
        logger.debug({ sessionId, messageId }, 'message saved to database');
        return result.insertId;
    } catch (error) {
        logger.error({ error: error.message, sessionId, messageId }, 'failed to save message');
        return null;
    }
}

/**
 * Update message status
 */
export async function updateMessageStatus(sessionId, messageId, status) {
    const db = getDatabase();
    try {
        await db.query(
            `UPDATE messages SET status = ? WHERE session_id = ? AND message_id = ?`,
            [status, sessionId, messageId]
        );

        // Also log in status updates table
        await db.query(
            `INSERT INTO message_status_updates (message_id, session_id, status)
       SELECT id, session_id, ? FROM messages WHERE session_id = ? AND message_id = ?`,
            [status, sessionId, messageId]
        );
    } catch (error) {
        logger.error({ error: error.message, sessionId, messageId }, 'failed to update message status');
    }
}

/**
 * Save poll to database
 */
export async function savePoll(sessionId, pollData) {
    const db = getDatabase();
    const {
        key,
        pollName,
        options,
        selectableCount,
        creatorJids,
        pollEncKey,
        messageId
    } = pollData;

    try {
        const creatorJid = creatorJids?.[0] || null;
        const [result] = await db.query(
            `INSERT INTO polls (
        session_id, poll_key, message_id, poll_name, options, 
        selectable_count, creator_jid, creator_phone, poll_enc_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        poll_name = VALUES(poll_name),
        options = VALUES(options)`,
            [
                sessionId,
                key,
                messageId || null,
                pollName,
                JSON.stringify(options),
                selectableCount,
                creatorJid,
                extractPhone(creatorJid),
                pollEncKey
            ]
        );
        logger.debug({ sessionId, pollKey: key }, 'poll saved to database');
        return result.insertId;
    } catch (error) {
        logger.error({ error: error.message, sessionId }, 'failed to save poll');
        return null;
    }
}

/**
 * Save poll vote to database
 */
export async function savePollVote(sessionId, voteData) {
    const db = getDatabase();
    const {
        pollMessageId,
        voteMessageId,
        voter,
        selectedOptions
    } = voteData;

    try {
        // Get poll ID from poll_key
        const [polls] = await db.query(
            `SELECT id FROM polls WHERE session_id = ? AND message_id = ? LIMIT 1`,
            [sessionId, pollMessageId]
        );

        if (polls.length === 0) {
            logger.warn({ sessionId, pollMessageId }, 'poll not found for vote');
            return null;
        }

        const pollId = polls[0].id;

        await db.query(
            `INSERT INTO poll_votes (
        poll_id, session_id, poll_message_id, vote_message_id, 
        voter_jid, voter_phone, selected_options
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                pollId,
                sessionId,
                pollMessageId,
                voteMessageId,
                voter,
                extractPhone(voter),
                JSON.stringify(selectedOptions)
            ]
        );
        logger.debug({ sessionId, voter }, 'poll vote saved to database');
    } catch (error) {
        logger.error({ error: error.message, sessionId }, 'failed to save poll vote');
    }
}

/**
 * Log webhook event
 */
export async function logWebhookEvent(sessionId, eventId, eventType, payload, webhookUrl, status = 'pending') {
    const db = getDatabase();
    try {
        await db.query(
            `INSERT INTO webhook_events (session_id, event_id, event_type, payload, webhook_url, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         attempts = attempts + 1,
         sent_at = CASE WHEN VALUES(status) = 'sent' THEN NOW() ELSE sent_at END`,
            [sessionId, eventId, eventType, JSON.stringify(payload), webhookUrl, status]
        );
    } catch (error) {
        logger.error({ error: error.message, sessionId, eventId }, 'failed to log webhook event');
    }
}

/**
 * Update webhook event status
 */
export async function updateWebhookStatus(eventId, status, error = null) {
    const db = getDatabase();
    try {
        await db.query(
            `UPDATE webhook_events 
       SET status = ?, last_error = ?, sent_at = CASE WHEN ? = 'sent' THEN NOW() ELSE sent_at END
       WHERE event_id = ?`,
            [status, error, status, eventId]
        );
    } catch (err) {
        logger.error({ error: err.message, eventId }, 'failed to update webhook status');
    }
}

/**
 * Save or update contact
 */
export async function saveContact(sessionId, contactData) {
    const db = getDatabase();
    const { jid, name, notifyName, isBusiness } = contactData;

    try {
        await db.query(
            `INSERT INTO contacts (session_id, jid, phone, name, notify_name, is_business, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         notify_name = VALUES(notify_name),
         is_business = VALUES(is_business),
         last_seen_at = VALUES(last_seen_at)`,
            [
                sessionId,
                jid,
                extractPhone(jid),
                name || null,
                notifyName || null,
                isBusiness || false,
                new Date()
            ]
        );
    } catch (error) {
        logger.error({ error: error.message, sessionId, jid }, 'failed to save contact');
    }
}

/**
 * Get message statistics for a session
 */
export async function getMessageStats(sessionId) {
    const db = getDatabase();
    try {
        const [rows] = await db.query(
            `SELECT * FROM message_stats WHERE session_id = ?`,
            [sessionId]
        );
        return rows[0] || null;
    } catch (error) {
        logger.error({ error: error.message, sessionId }, 'failed to get message stats');
        return null;
    }
}

/**
 * Get recent messages for a session
 */
export async function getRecentMessages(sessionId, limit = 50) {
    const db = getDatabase();
    try {
        const [rows] = await db.query(
            `SELECT * FROM messages 
       WHERE session_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
            [sessionId, limit]
        );
        return rows;
    } catch (error) {
        logger.error({ error: error.message, sessionId }, 'failed to get recent messages');
        return [];
    }
}

/**
 * Get conversation history between session and a phone number
 */
export async function getConversation(sessionId, phoneNumber, limit = 100) {
    const db = getDatabase();
    try {
        const [rows] = await db.query(
            `SELECT * FROM messages 
       WHERE session_id = ? 
       AND (from_phone = ? OR to_phone = ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
            [sessionId, phoneNumber, phoneNumber, limit]
        );
        return rows.reverse(); // Return in chronological order
    } catch (error) {
        logger.error({ error: error.message, sessionId, phoneNumber }, 'failed to get conversation');
        return [];
    }
}
