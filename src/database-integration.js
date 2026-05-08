/**
 * Database Integration Module
 * 
 * This module provides wrapper functions that integrate database storage
 * with the existing WhatsApp Bridge functionality.
 * 
 * Import this module in index.js and use these wrappers instead of direct calls.
 */

import * as db from './database.js';

const DB_ENABLED = process.env.DB_ENABLED === 'true';

/**
 * Wrapper for emitWebhookEvent that also logs to database
 */
export async function emitWebhookEventWithDB(session, type, data, originalEmitFn) {
    // Call original function
    await originalEmitFn(session, type, data);

    // Log to database if enabled
    if (DB_ENABLED && session?.webhook?.url) {
        const eventId = buildEventId(session, type, data);
        await db.logWebhookEvent(
            session.id,
            eventId,
            type,
            { type, sessionId: session.id, ...data },
            session.webhook.url,
            'sent'
        );
    }
}

/**
 * Wrapper for saving inbound messages to database
 */
export async function saveInboundMessage(session, messageData) {
    if (!DB_ENABLED) return;

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
}

/**
 * Wrapper for saving outbound messages to database
 */
export async function saveOutboundMessage(session, to, messageData, messageId) {
    if (!DB_ENABLED) return;

    await db.saveMessage(session.id, {
        messageId,
        direction: 'outbound',
        from: session.identity?.userJid,
        to,
        messageType: messageData.type || 'text',
        text: messageData.message || messageData.text,
        mediaUrl: messageData.imageUrl || messageData.url,
        caption: messageData.caption,
        status: 'sent',
        timestamp: Date.now(),
        raw: messageData
    });
}

/**
 * Wrapper for updating message status
 */
export async function updateMessageStatusInDB(session, messageId, status) {
    if (!DB_ENABLED) return;

    const statusMap = {
        1: 'sent',
        2: 'delivered',
        3: 'read',
        4: 'failed'
    };

    const mappedStatus = statusMap[status] || 'pending';
    await db.updateMessageStatus(session.id, messageId, mappedStatus);
}

/**
 * Wrapper for saving poll creation to database
 */
export async function savePollToDB(session, pollData) {
    if (!DB_ENABLED) return;

    await db.savePoll(session.id, {
        key: pollData.key,
        pollName: pollData.pollName,
        options: pollData.options,
        selectableCount: pollData.selectableCount,
        creatorJids: pollData.creatorJids,
        pollEncKey: pollData.pollEncKey,
        messageId: pollData.key?.split(':')[1] // Extract message ID from poll key
    });
}

/**
 * Wrapper for saving poll votes to database
 */
export async function savePollVoteToDB(session, voteData) {
    if (!DB_ENABLED) return;

    await db.savePollVote(session.id, {
        pollMessageId: voteData.pollMessageId,
        voteMessageId: voteData.pollVoteMessageId,
        voter: voteData.voter,
        selectedOptions: voteData.selectedOptions
    });
}

/**
 * Wrapper for saving/updating session data
 */
export async function saveSessionToDB(session) {
    if (!DB_ENABLED) return;

    await db.saveSession({
        id: session.id,
        status: session.status,
        identity: session.identity,
        webhook: session.webhook
    });
}

/**
 * Wrapper for updating session status
 */
export async function updateSessionStatusInDB(sessionId, status) {
    if (!DB_ENABLED) return;

    await db.updateSessionStatus(sessionId, status);
}

/**
 * Helper to build event ID (copy from index.js if needed)
 */
function buildEventId(session, type, data) {
    // This should match the implementation in index.js
    // For now, return a simple hash
    const crypto = await import('crypto');
    const payload = JSON.stringify({ sessionId: session.id, type, ...data });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

export { db };
