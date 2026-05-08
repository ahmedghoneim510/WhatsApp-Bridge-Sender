/**
 * Database Integration Patch for index.js
 * 
 * This file contains the enhanced functions that integrate database storage.
 * Import and use these instead of the original functions.
 */

import * as db from './database.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const DB_ENABLED = process.env.DB_ENABLED === 'true';

/**
 * Enhanced postWebhook with database logging
 */
export async function postWebhookWithDB(session, payload, eventId, postWebhookOriginal) {
    const webhook = session?.webhook || null;
    if (!webhook?.url) return;

    // Log to database if enabled
    if (DB_ENABLED) {
        try {
            await db.logWebhookEvent(session.id, eventId, payload.type, payload, webhook.url, 'pending');
        } catch (error) {
            logger.warn({ error: error.message, sessionId: session.id }, 'failed to log webhook to database');
        }
    }

    // Call original webhook function
    try {
        await postWebhookOriginal(session, payload, eventId);

        // Update status as sent
        if (DB_ENABLED) {
            try {
                await db.updateWebhookStatus(eventId, 'sent');
            } catch (error) {
                logger.warn({ error: error.message }, 'failed to update webhook status');
            }
        }
    } catch (error) {
        // Update status as failed
        if (DB_ENABLED) {
            try {
                await db.updateWebhookStatus(eventId, 'failed', error.message);
            } catch (err) {
                logger.warn({ error: err.message }, 'failed to update webhook status');
            }
        }
        throw error;
    }
}

/**
 * Save inbound message to database
 */
export async function saveInboundMessage(session, messageData) {
    if (!DB_ENABLED) return;

    try {
        await db.saveMessage(session.id, {
            messageId: messageData.messageId,
            direction: 'inbound',
            from: messageData.from || messageData.sender,
            to: session.identity?.userJid,
            messageType: messageData.messageType,
            text: messageData.text,
            status: 'received',
            timestamp: messageData.timestamp,
            raw: messageData.raw
        });
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to save inbound message');
    }
}

/**
 * Save outbound message to database
 */
export async function saveOutboundMessage(session, to, message, messageId) {
    if (!DB_ENABLED) return;

    try {
        await db.saveMessage(session.id, {
            messageId,
            direction: 'outbound',
            from: session.identity?.userJid,
            to,
            messageType: 'text',
            text: message,
            status: 'sent',
            timestamp: Date.now(),
            raw: { to, message }
        });
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to save outbound message');
    }
}

/**
 * Save poll to database
 */
export async function savePollToDB(session, pollData) {
    if (!DB_ENABLED) return;

    try {
        await db.savePoll(session.id, {
            key: pollData.key,
            pollName: pollData.pollName,
            options: pollData.options,
            selectableCount: pollData.selectableCount,
            creatorJids: pollData.creatorJids,
            pollEncKey: pollData.pollEncKey,
            messageId: pollData.key?.split(':')[1]
        });
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to save poll');
    }
}

/**
 * Save poll vote to database
 */
export async function savePollVoteToDB(session, voteData) {
    if (!DB_ENABLED) return;

    try {
        await db.savePollVote(session.id, {
            pollMessageId: voteData.pollMessageId,
            voteMessageId: voteData.pollVoteMessageId,
            voter: voteData.voter,
            selectedOptions: voteData.selectedOptions
        });
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to save poll vote');
    }
}

/**
 * Save session to database
 */
export async function saveSessionToDB(session) {
    if (!DB_ENABLED) return;

    try {
        await db.saveSession({
            id: session.id,
            status: session.status,
            identity: session.identity,
            webhook: session.webhook
        });
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to save session');
    }
}

/**
 * Update message status in database
 */
export async function updateMessageStatusInDB(session, messageId, status) {
    if (!DB_ENABLED) return;

    try {
        const statusMap = {
            1: 'sent',
            2: 'delivered',
            3: 'read',
            4: 'failed'
        };

        const mappedStatus = statusMap[status] || 'pending';
        await db.updateMessageStatus(session.id, messageId, mappedStatus);
    } catch (error) {
        logger.warn({ error: error.message, sessionId: session.id }, 'failed to update message status');
    }
}
