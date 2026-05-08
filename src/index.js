import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { hydratedTemplate, InteractiveValidationError, sendButtons } from 'baileys_helpers';
import {
  getAggregateVotesInPollMessage,
  updateMessageWithPollUpdate
} from '@whiskeysockets/baileys/lib/Utils/messages.js';
import { getKeyAuthor } from '@whiskeysockets/baileys/lib/Utils/generics.js';
import { jidDecode, jidNormalizedUser } from '@whiskeysockets/baileys/lib/WABinary/jid-utils.js';
import * as db from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_DIR = process.env.SESSION_DIR
  ? path.resolve(process.env.SESSION_DIR)
  : path.join(__dirname, '..', 'data', 'sessions');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SESSION_CONFIG_FILE = 'session.json';
const IDEMPOTENCY_TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS || 600000);
const IDEMPOTENCY_MAX_KEYS = Number(process.env.IDEMPOTENCY_MAX_KEYS || 20000);
const MESSAGE_STORE_TTL_MS = Number(process.env.MESSAGE_STORE_TTL_MS || 3600000);
const MESSAGE_STORE_MAX = Number(process.env.MESSAGE_STORE_MAX || 5000);
const API_KEY = process.env.API_KEY || null;
const MAX_BULK_SIZE = Number(process.env.MAX_BULK_SIZE || 100);
const WEBHOOK_RETRIES = Number(process.env.WEBHOOK_RETRIES || 3);
const DB_ENABLED = process.env.DB_ENABLED === 'true';

const logger = pino({ level: LOG_LEVEL });

const app = express();

// CORS configuration - دعم عدة مصادر
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // السماح بطلبات بدون origin (مثل Postman أو curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // السماح بالـ Dashboard نفسه (localhost:3000)
    const serverOrigin = `http://localhost:${PORT}`;
    if (origin === serverOrigin) {
      callback(null, true);
      return;
    }

    // السماح بالمصادر المسموحة
    if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Request ID middleware للـ tracing
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));

const sessions = new Map();
const sessionLocks = new Map();

function sanitizeSessionId(raw) {
  if (!raw || !/^[a-zA-Z0-9_-]+$/.test(raw)) {
    const error = new Error("Invalid session id. Use letters, numbers, '-' or '_'.");
    error.statusCode = 400;
    throw error;
  }
  return raw;
}

function parseWebhookUrl(raw) {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !raw.trim()) {
    const error = new Error('webhookUrl must be a non-empty string.');
    error.statusCode = 400;
    throw error;
  }
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    const err = new Error('webhookUrl must be a valid URL.');
    err.statusCode = 400;
    throw err;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const error = new Error('webhookUrl must start with http:// or https://');
    error.statusCode = 400;
    throw error;
  }
  return url.toString();
}

function buildWebhookConfig({ webhookUrl, webhookSecret }, existing) {
  let url = existing?.url || '';
  let secret = existing?.secret || '';

  if (webhookUrl !== undefined) {
    const parsed = parseWebhookUrl(webhookUrl);
    if (!parsed) {
      return null;
    }
    url = parsed;
  }

  if (webhookSecret !== undefined) {
    secret = webhookSecret ? String(webhookSecret) : '';
  }

  if (!url) return null;
  return { url, secret };
}

function normalizeJid(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed;

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // معالجة الأرقام المصرية - إذا بدأ بـ 0 أو 01، استبدله بـ 20
  if (digits.startsWith('0')) {
    digits = '20' + digits.substring(1);
  } else if (digits.startsWith('1') && digits.length === 10) {
    // رقم مصري بدون 0 في البداية
    digits = '20' + digits;
  }

  // التأكد من أن الرقم يبدأ بكود دولة (على الأقل 7 أرقام)
  if (digits.length < 7) return null;

  return `${digits}@s.whatsapp.net`;
}

function stringifyButtonParams(buttons) {
  if (!Array.isArray(buttons)) return buttons;
  return buttons.map((button) => {
    if (
      button &&
      typeof button === 'object' &&
      button.buttonParamsJson &&
      typeof button.buttonParamsJson !== 'string'
    ) {
      return {
        ...button,
        buttonParamsJson: JSON.stringify(button.buttonParamsJson)
      };
    }
    return button;
  });
}

function normalizeInteractiveContent(content) {
  if (!content || typeof content !== 'object') return content;
  const normalized = { ...content };

  if (Array.isArray(normalized.interactiveButtons)) {
    normalized.interactiveButtons = stringifyButtonParams(normalized.interactiveButtons);
  }

  const nativeButtons = normalized.interactiveMessage?.nativeFlowMessage?.buttons;
  if (Array.isArray(nativeButtons)) {
    normalized.interactiveMessage = {
      ...normalized.interactiveMessage,
      nativeFlowMessage: {
        ...normalized.interactiveMessage.nativeFlowMessage,
        buttons: stringifyButtonParams(nativeButtons)
      }
    };
  }

  return normalized;
}

function extractPhoneFromJid(jid) {
  const decoded = jidDecode(jid || '');
  return decoded?.user || null;
}

function getConnectedIdentity(sockUser) {
  if (!sockUser) return null;
  const userJid = sockUser.id || null;
  return {
    userJid,
    phoneNumber: userJid ? extractPhoneFromJid(userJid) : null,
    lid: sockUser.lid || null,
    name: sockUser.name || null
  };
}

function getMessageText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  );
}

function getPollCreation(message, depth = 0) {
  if (!message) return null;
  if (depth > 3) return null;

  const normalized = normalizeMessageContent(message) || message;
  const direct =
    normalized.pollCreationMessage ||
    normalized.pollCreationMessageV2 ||
    normalized.pollCreationMessageV3;
  if (direct) return direct;

  const v4 = normalized.pollCreationMessageV4?.message;
  if (v4) {
    const nested = getPollCreation(v4, depth + 1);
    if (nested) return nested;
  }

  const v5 = normalized.pollCreationMessageV5?.message;
  if (v5) {
    const nested = getPollCreation(v5, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function getMessageSecret(msg) {
  return (
    msg?.message?.messageContextInfo?.messageSecret ||
    msg?.messageContextInfo?.messageSecret ||
    msg?.message?.pollCreationMessage?.contextInfo?.messageSecret ||
    msg?.message?.pollCreationMessageV2?.contextInfo?.messageSecret ||
    msg?.message?.pollCreationMessageV3?.contextInfo?.messageSecret ||
    msg?.message?.pollCreationMessageV4?.message?.messageContextInfo?.messageSecret ||
    msg?.message?.pollCreationMessageV5?.message?.messageContextInfo?.messageSecret ||
    msg?.message?.pollCreationMessage?.encKey ||
    msg?.message?.pollCreationMessageV2?.encKey ||
    msg?.message?.pollCreationMessageV3?.encKey ||
    msg?.message?.pollCreationMessageV4?.message?.pollCreationMessage?.encKey ||
    msg?.message?.pollCreationMessageV5?.message?.pollCreationMessage?.encKey ||
    null
  );
}

function pollKeyFromMessageKey(key, fallbackRemoteJid) {
  const remoteJid = key?.remoteJid || fallbackRemoteJid || 'unknown';
  const id = key?.id || 'unknown';
  return `${remoteJid}:${id}`;
}

function collectJidCandidates(key, meIdNormalized) {
  const candidates = [];

  const primary = getKeyAuthor(key, meIdNormalized || 'me');
  if (primary) candidates.push(primary);
  if (key?.senderPn) candidates.push(key.senderPn);
  if (key?.participant) candidates.push(key.participant);
  if (key?.remoteJid) candidates.push(key.remoteJid);

  const normalized = [];
  for (const jid of candidates) {
    const normalizedJid = jidNormalizedUser(jid);
    if (normalizedJid && normalizedJid !== jid) {
      normalized.push(normalizedJid);
    }
  }

  const unique = new Set();
  for (const jid of [...candidates, ...normalized]) {
    if (!jid) continue;
    unique.add(jid);
  }

  return Array.from(unique);
}

function recordPollCreation(session, msg, meIdNormalized) {
  const poll = getPollCreation(msg.message);
  if (!poll) return null;

  const pollKey = pollKeyFromMessageKey(msg.key, msg.key?.remoteJid);
  if (session.polls.has(pollKey)) return session.polls.get(pollKey);

  const pollEncKey = getMessageSecret(msg) || null;
  if (!pollEncKey) {
    logger.warn({ sessionId: session.id, pollKey }, 'poll creation missing secret key');
  }

  const pollData = {
    key: pollKey,
    message: msg.message,
    pollUpdates: [],
    pollEncKey,
    pollName: poll.name || '',
    options: (poll.options || []).map((option) => option.optionName || ''),
    selectableCount: poll.selectableOptionsCount || null,
    createdAt: Date.now(),
    creatorJids: collectJidCandidates(msg.key, meIdNormalized)
  };

  session.polls.set(pollKey, pollData);
  if (msg.key?.id) {
    session.pollsById.set(msg.key.id, pollData);
  }
  logger.info({ sessionId: session.id, pollKey }, 'saved poll creation');
  return pollData;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeEventJid(value) {
  if (!value || typeof value !== 'string') return '';
  return jidNormalizedUser(value) || value;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    logger.warn({ error }, 'event payload not serializable');
    return '';
  }
}

function buildMessageStoreKeys(key) {
  if (!key?.remoteJid || !key?.id) return [];
  const raw = `${key.remoteJid}:${key.id}`;
  const normalized = jidNormalizedUser(key.remoteJid);
  if (normalized && normalized !== key.remoteJid) {
    return [raw, `${normalized}:${key.id}`];
  }
  return [raw];
}

function pruneMessageStore(store) {
  if (!store || store.size === 0) return;
  const now = Date.now();

  if (MESSAGE_STORE_TTL_MS > 0) {
    for (const [key, entry] of store) {
      if (now - entry.timestamp > MESSAGE_STORE_TTL_MS) {
        store.delete(key);
      }
    }
  }

  if (MESSAGE_STORE_MAX > 0 && store.size > MESSAGE_STORE_MAX) {
    for (const key of store.keys()) {
      store.delete(key);
      if (store.size <= MESSAGE_STORE_MAX) break;
    }
  }
}

function cacheMessage(session, msg) {
  if (!msg?.message) return;
  if (!session.messageStore) {
    session.messageStore = new Map();
  }
  const keys = buildMessageStoreKeys(msg.key);
  if (!keys.length) return;
  const entry = { message: msg.message, timestamp: Date.now() };
  for (const key of keys) {
    session.messageStore.set(key, entry);
  }
  pruneMessageStore(session.messageStore);
}

function getMessageFromStore(messageStore, key) {
  if (!messageStore) return undefined;
  const keys = buildMessageStoreKeys(key);
  if (!keys.length) return undefined;
  const now = Date.now();
  for (const storeKey of keys) {
    const entry = messageStore.get(storeKey);
    if (!entry) continue;
    if (MESSAGE_STORE_TTL_MS > 0 && now - entry.timestamp > MESSAGE_STORE_TTL_MS) {
      messageStore.delete(storeKey);
      continue;
    }
    return entry.message;
  }
  return undefined;
}

function buildEventFingerprint(type, data) {
  switch (type) {
    case 'connection_update':
      return {
        type,
        connection: data.connection || data.status || '',
        status: data.status || data.connection || '',
        qr: data.qr ? hashValue(data.qr) : '',
        disconnect: data.lastDisconnect?.statusCode || ''
      };
    case 'message':
      return {
        type,
        messageId: data.messageId || '',
        from: normalizeEventJid(data.from),
        timestamp: data.timestamp || ''
      };
    case 'button_reply':
      return {
        type,
        messageId: data.messageId || '',
        responseType: data.responseType || '',
        id: data.id || '',
        name: data.name || '',
        selectedRowId: data.selectedRowId || ''
      };
    case 'list_reply':
      return {
        type,
        messageId: data.messageId || '',
        selectedRowId: data.selectedRowId || ''
      };
    case 'poll':
      return {
        type,
        messageId: data.messageId || '',
        pollName: data.pollName || ''
      };
    case 'poll_vote':
      return {
        type,
        pollVoteMessageId: data.pollVoteMessageId || '',
        pollMessageId: data.pollMessageId || '',
        voter: normalizeEventJid(data.voter),
        selectedOptions: Array.isArray(data.selectedOptions)
          ? data.selectedOptions.join('|')
          : ''
      };
    case 'message_update':
      return {
        type,
        messageId: data.messageId || '',
        status: data.update?.update?.status ?? data.update?.status ?? '',
        from: normalizeEventJid(data.from),
        updateHash: data.update?.update
          ? hashValue(safeStringify(data.update.update))
          : ''
      };
    default:
      return { type, hash: data ? hashValue(safeStringify(data)) : '' };
  }
}

function buildEventId(session, type, data) {
  const fingerprint = buildEventFingerprint(type, data);
  const payload = {
    sessionId: session.id,
    ...fingerprint
  };
  return hashValue(safeStringify(payload));
}

function shouldSendEvent(session, eventId) {
  if (!IDEMPOTENCY_TTL_MS || IDEMPOTENCY_TTL_MS <= 0) return true;
  if (!session.recentEvents) {
    session.recentEvents = new Map();
  }

  const now = Date.now();
  const existing = session.recentEvents.get(eventId);
  if (existing && now - existing < IDEMPOTENCY_TTL_MS) {
    return false;
  }

  session.recentEvents.set(eventId, now);

  if (session.recentEvents.size > IDEMPOTENCY_MAX_KEYS) {
    for (const [key, ts] of session.recentEvents) {
      if (now - ts > IDEMPOTENCY_TTL_MS) {
        session.recentEvents.delete(key);
      }
      if (session.recentEvents.size <= IDEMPOTENCY_MAX_KEYS) break;
    }
  }

  return true;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeSessionFiles(sessionId) {
  const sessionPath = path.join(SESSION_DIR, sessionId);
  try {
    await fs.rm(sessionPath, { recursive: true, force: true });
  } catch (error) {
    logger.warn({ error, sessionId }, 'could not remove session files');
  }
}

async function cleanupSession(sessionId, deleteFiles = false) {
  const existing = sessions.get(sessionId);
  if (existing) {
    try {
      await existing.sock.logout();
    } catch (error) {
      logger.warn({ error, sessionId }, 'logout failed during cleanup');
    }
    sessions.delete(sessionId);
  }

  if (deleteFiles) {
    await removeSessionFiles(sessionId);
  }
}

async function loadSessionConfig(authPath) {
  const configPath = path.join(authPath, SESSION_CONFIG_FILE);
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const webhook = parsed?.webhook || null;
    if (webhook?.url && typeof webhook.url === 'string') {
      let url = null;
      try {
        url = parseWebhookUrl(webhook.url);
      } catch (error) {
        logger.warn({ error, authPath }, 'session config has invalid webhook url');
        return { webhook: null };
      }
      return {
        webhook: {
          url,
          secret: webhook.secret ? String(webhook.secret) : ''
        }
      };
    }
    return { webhook: null };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger.warn({ error, authPath }, 'could not load session config');
    }
    return { webhook: null };
  }
}

async function saveSessionConfig(authPath, config) {
  const configPath = path.join(authPath, SESSION_CONFIG_FILE);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function getLatestVersionSafe() {
  try {
    return await fetchLatestBaileysVersion();
  } catch (error) {
    logger.warn({ error }, 'could not fetch Baileys version');
    return { version: undefined, isLatest: false };
  }
}

async function postWebhook(session, payload, eventId, retries = WEBHOOK_RETRIES) {
  const webhook = session?.webhook || null;
  if (!webhook?.url) return;

  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(eventId ? { 'x-event-id': eventId } : {}),
          ...(webhook.secret ? { 'x-webhook-secret': webhook.secret } : {})
        },
        timeout: 10000
      });
      return; // نجح
    } catch (error) {
      if (i === retries - 1) {
        logger.error({
          error: error.message,
          sessionId: session.id,
          webhookUrl: webhook.url,
          attempt: i + 1
        }, 'webhook request failed after retries');
      } else {
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        logger.warn({
          sessionId: session.id,
          attempt: i + 1,
          retryingIn: delay
        }, 'webhook request failed, retrying');
      }
    }
  }
}

async function emitWebhookEvent(session, type, data) {
  if (!session) return;
  const eventId = buildEventId(session, type, data);
  if (!shouldSendEvent(session, eventId)) return;
  await postWebhook(
    session,
    {
      type,
      eventId,
      sessionId: session.id,
      ...data
    },
    eventId
  );
}

function getPrimaryMessageType(message) {
  if (!message) return 'unknown';
  const keys = Object.keys(message).filter((key) => key !== 'messageContextInfo');
  return keys[0] || 'unknown';
}

function extractButtonReply(message) {
  const buttons = message?.buttonsResponseMessage;
  if (buttons) {
    return {
      responseType: 'buttons_response',
      id: buttons.selectedButtonId || null,
      text: buttons.selectedDisplayText || null
    };
  }

  const template = message?.templateButtonReplyMessage;
  if (template) {
    return {
      responseType: 'template_button_reply',
      id: template.selectedId || null,
      text: template.selectedDisplayText || null,
      index: template.selectedIndex ?? null
    };
  }

  const interactive = message?.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (interactive) {
    return {
      responseType: 'interactive_response',
      name: interactive.name || null,
      paramsJson: interactive.paramsJson || null,
      version: interactive.version ?? null
    };
  }

  return null;
}

function extractListReply(message) {
  const list = message?.listResponseMessage;
  if (!list) return null;
  return {
    responseType: 'list_response',
    title: list.title || null,
    description: list.description || null,
    selectedRowId: list.singleSelectReply?.selectedRowId || null
  };
}

async function createSession(sessionId) {
  const authPath = path.join(SESSION_DIR, sessionId);
  await ensureDir(authPath);

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const config = await loadSessionConfig(authPath);
  const { version } = await getLatestVersionSafe();
  const messageStore = new Map();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: ['Windows', 'Chrome', '10.0'],
    auth: state,
    getMessage: async (key) => getMessageFromStore(messageStore, key)
  });

  const session = {
    id: sessionId,
    sock,
    saveCreds,
    authPath,
    webhook: config.webhook,
    status: 'connecting',
    qr: null,
    lastMessageAt: null,
    recentEvents: new Map(),
    messageStore,
    identity: null,
    polls: new Map(),
    pollsById: new Map()
  };

  sessions.set(sessionId, session);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    if (qr) {
      session.qr = await qrcode.toDataURL(qr);
      logger.info({ sessionId }, 'qr updated');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      session.status = 'open';
      session.qr = null;
      session.identity = getConnectedIdentity(session.sock.user);
      logger.info({ sessionId }, 'whatsapp connected');

      // Save session to database if enabled
      if (DB_ENABLED) {
        db.saveSession({
          id: session.id,
          status: session.status,
          identity: session.identity,
          webhook: session.webhook
        }).catch(err => {
          logger.warn({ error: err.message, sessionId }, 'failed to save session to database');
        });
      }
    }

    if (connection === 'close') {
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      session.status = 'closed';
      session.identity = null;
      logger.warn({ sessionId, statusCode }, 'whatsapp disconnected');

      // Update session status in database if enabled
      if (DB_ENABLED) {
        db.updateSessionStatus(sessionId, 'closed').catch(err => {
          logger.warn({ error: err.message, sessionId }, 'failed to update session status in database');
        });
      }

      if (shouldReconnect) {
        sessions.delete(sessionId);
        setTimeout(() => {
          getOrCreateSession(sessionId).catch((error) => {
            logger.error({ error, sessionId }, 'reconnect failed');
          });
        }, 1000);
      } else {
        sessions.delete(sessionId);
      }
    }

    await emitWebhookEvent(session, 'connection_update', {
      connection,
      status: session.status,
      qr: session.qr || null,
      lastDisconnect: statusCode ? { statusCode } : null,
      phoneNumber: session.identity?.phoneNumber || null,
      userJid: session.identity?.userJid || null,
      lid: session.identity?.lid || null,
      name: session.identity?.name || null
    });
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      const meId = session.sock.user?.id;
      const meIdNormalized = meId ? jidNormalizedUser(meId) : 'me';

      if (msg.message) {
        cacheMessage(session, msg);
        const pollData = recordPollCreation(session, msg, meIdNormalized);

        // Save poll to database if enabled
        if (DB_ENABLED && pollData) {
          db.savePoll(session.id, {
            key: pollData.key,
            pollName: pollData.pollName,
            options: pollData.options,
            selectableCount: pollData.selectableCount,
            creatorJids: pollData.creatorJids,
            pollEncKey: pollData.pollEncKey,
            messageId: msg.key?.id
          }).catch(err => {
            logger.warn({ error: err.message, sessionId }, 'failed to save poll to database');
          });
        }
      }

      if (msg.message?.pollUpdateMessage) {
        continue;
      }

      if (type !== 'notify') {
        continue;
      }

      if (!msg.message || msg.key?.fromMe) continue;

      const messageId = msg.key?.id;
      const from = msg.key?.remoteJid;
      const sender = msg.key?.participant || msg.key?.remoteJid;
      const timestamp = msg.messageTimestamp;

      const buttonReply = extractButtonReply(msg.message);
      if (buttonReply) {
        await emitWebhookEvent(session, 'button_reply', {
          messageId,
          from,
          sender,
          timestamp,
          ...buttonReply,
          raw: msg
        });
        continue;
      }

      const listReply = extractListReply(msg.message);
      if (listReply) {
        await emitWebhookEvent(session, 'list_reply', {
          messageId,
          from,
          sender,
          timestamp,
          ...listReply,
          raw: msg
        });
        continue;
      }

      const pollCreation = getPollCreation(msg.message);
      if (pollCreation) {
        await emitWebhookEvent(session, 'poll', {
          messageId,
          from,
          sender,
          timestamp,
          pollName: pollCreation.name || '',
          options: (pollCreation.options || []).map((option) => option.optionName || ''),
          selectableCount: pollCreation.selectableOptionsCount || null,
          raw: msg
        });
        continue;
      }

      const payload = {
        messageId,
        from,
        sender,
        timestamp,
        messageType: getPrimaryMessageType(msg.message),
        text: getMessageText(msg.message),
        raw: msg
      };

      session.lastMessageAt = Date.now();
      logger.info({ sessionId, messageId: payload.messageId }, 'inbound message');

      await emitWebhookEvent(session, 'message', payload);

      // Save to database if enabled
      if (DB_ENABLED) {
        db.saveMessage(session.id, {
          messageId: payload.messageId,
          direction: 'inbound',
          from: payload.from,
          to: session.identity?.userJid,
          messageType: payload.messageType,
          text: payload.text,
          status: 'received',
          timestamp: payload.timestamp,
          raw: payload.raw
        }).catch(err => {
          logger.warn({ error: err.message, sessionId }, 'failed to save inbound message to database');
        });
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates || []) {
      if (!update?.key) continue;
      const pollUpdates = update.update?.pollUpdates;
      if (Array.isArray(pollUpdates) && pollUpdates.length > 0) {
        const pollKey = pollKeyFromMessageKey(update.key, update.key?.remoteJid);
        let pollData =
          session.polls.get(pollKey) || session.pollsById.get(update.key.id || '');
        const pollCreationMessage =
          getMessageFromStore(session.messageStore, update.key) ||
          pollData?.message ||
          null;
        if (!pollCreationMessage) {
          logger.warn({ sessionId, pollKey }, 'poll update without matching poll creation');
        } else {
          const pollCreation = getPollCreation(pollCreationMessage);
          if (!pollData) {
            pollData = {
              key: pollKey,
              message: pollCreationMessage,
              pollUpdates: [],
              pollEncKey: null,
              pollName: pollCreation?.name || '',
              options: (pollCreation?.options || []).map((option) => option.optionName || ''),
              selectableCount: pollCreation?.selectableOptionsCount || null,
              createdAt: Date.now(),
              creatorJids: []
            };
            session.polls.set(pollKey, pollData);
            if (update.key?.id) {
              session.pollsById.set(update.key.id, pollData);
            }
          } else if (pollCreation) {
            if (!pollData.pollName) {
              pollData.pollName = pollCreation.name || '';
            }
            if (!pollData.options?.length) {
              pollData.options = (pollCreation.options || []).map(
                (option) => option.optionName || ''
              );
            }
            if (!pollData.selectableCount) {
              pollData.selectableCount = pollCreation.selectableOptionsCount || null;
            }
          }

          const meId = session.sock.user?.id;
          const meIdNormalized = meId ? jidNormalizedUser(meId) : 'me';
          for (const pollUpdate of pollUpdates) {
            updateMessageWithPollUpdate(pollData, pollUpdate);
            const aggregate = getAggregateVotesInPollMessage(
              {
                message: pollCreationMessage,
                pollUpdates: pollData.pollUpdates
              },
              meId
            );
            const singleVoteAggregate = getAggregateVotesInPollMessage(
              {
                message: pollCreationMessage,
                pollUpdates: [pollUpdate]
              },
              meId
            );
            const voter = getKeyAuthor(pollUpdate.pollUpdateMessageKey, meIdNormalized);
            const selectedOptions = singleVoteAggregate
              .filter((option) => option.voters.includes(voter))
              .map((option) => option.name);
            await emitWebhookEvent(session, 'poll_vote', {
              pollVoteMessageId: pollUpdate.pollUpdateMessageKey?.id || null,
              pollMessageId: update.key.id,
              pollRemoteJid: update.key.remoteJid,
              pollName: pollData.pollName,
              options: pollData.options,
              selectableCount: pollData.selectableCount,
              voter,
              selectedOptions,
              aggregate,
              raw: pollUpdate
            });

            // Save poll vote to database if enabled
            if (DB_ENABLED) {
              db.savePollVote(session.id, {
                pollMessageId: update.key.id,
                voteMessageId: pollUpdate.pollUpdateMessageKey?.id,
                voter,
                selectedOptions
              }).catch(err => {
                logger.warn({ error: err.message, sessionId }, 'failed to save poll vote to database');
              });
            }
          }
        }
      }
      await emitWebhookEvent(session, 'message_update', {
        messageId: update.key.id,
        from: update.key.remoteJid,
        sender: update.key.participant || update.key.remoteJid,
        update,
        raw: update
      });
    }
  });

  return session;
}

async function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const pending = sessionLocks.get(sessionId);
  if (pending) return pending;
  const promise = createSession(sessionId).finally(() => {
    sessionLocks.delete(sessionId);
  });
  sessionLocks.set(sessionId, promise);
  return promise;
}

async function waitForSessionQr(session, timeoutMs) {
  const maxWait = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 15000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (session.qr) return session.qr;
    if (session.status === 'open') return null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return session.qr || null;
}

async function restoreSessions() {
  try {
    const entries = await fs.readdir(SESSION_DIR, { withFileTypes: true });
    const sessionIds = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^[a-zA-Z0-9_-]+$/.test(name));

    if (!sessionIds.length) {
      logger.info('no saved sessions found');
      return;
    }

    logger.info({ count: sessionIds.length }, 'restoring saved sessions');

    for (const sessionId of sessionIds) {
      try {
        await getOrCreateSession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'could not restore session');
      }
    }
  } catch (error) {
    logger.warn({ error }, 'could not scan session directory');
  }
}

// Dashboard routes
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/dashboard/:sessionId/qr', async (req, res) => {
  try {
    const sessionId = sanitizeSessionId(req.params.sessionId);
    const session = await getOrCreateSession(sessionId);

    if (!session.qr) {
      return res.status(404).json({ error: 'QR not available yet' });
    }

    res.json({ qr: session.qr, status: session.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Rate Limiting - حماية من DDoS
// Rate limiter للـ GET requests (أكثر تساهلاً للـ Dashboard)
const getLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 دقيقة
  max: 120, // 120 طلب في الدقيقة (كافي للـ Dashboard الذي يحدث كل 10 ثوانٍ)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter للـ POST/PUT/DELETE requests (أكثر صرامة)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: API_KEY ? 1000 : 100, // إذا كان API_KEY موجود، حد أعلى
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// API Authentication Middleware (اختياري - يعمل فقط إذا كان API_KEY موجود)
const apiAuth = (req, res, next) => {
  // إذا لم يكن API_KEY محدد، السماح للجميع (للـ development)
  if (!API_KEY) {
    return next();
  }

  // Dashboard needs read-only access and session bootstrap without auth headers.
  // Keep sensitive write operations protected by API key.
  if (req.baseUrl === '/sessions' && req.method === 'GET') {
    return next();
  }
  if (req.baseUrl === '/sessions' && req.method === 'POST' && /^\/[^/]+\/connect$/.test(req.path)) {
    return next();
  }

  // السماح للـ dashboard و health check بدون auth
  if (req.path.startsWith('/dashboard') || req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey || apiKey !== API_KEY) {
    logger.warn({
      ip: req.ip,
      path: req.path,
      requestId: req.id
    }, 'Unauthorized API access attempt');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required. Send it in X-API-Key header or Authorization: Bearer <key>'
    });
  }

  next();
};

// تطبيق Rate Limiting و Authentication على POST/PUT/DELETE
app.use('/sessions', writeLimiter);
app.use('/sessions', apiAuth);

// GET /sessions - مع rate limiting أكثر تساهلاً
app.get('/sessions', getLimiter, (req, res) => {
  try {
    const list = Array.from(sessions.values()).map((session) => ({
      id: session.id,
      status: session.status,
      lastMessageAt: session.lastMessageAt || null,
      identity: session.identity || null
    }));
    res.json({ sessions: list });
  } catch (error) {
    logger.error({ error }, 'error getting sessions list');
    res.status(500).json({ error: 'Failed to get sessions', sessions: [] });
  }
});

app.get('/sessions/:id', getLimiter, (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({
      id: session.id,
      status: session.status,
      lastMessageAt: session.lastMessageAt,
      phoneNumber: session.identity?.phoneNumber || null,
      userJid: session.identity?.userJid || null,
      lid: session.identity?.lid || null,
      name: session.identity?.name || null
    });
  } catch (error) {
    next(error);
  }
});

app.post('/sessions/:id/connect', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { mode = 'qr', phoneNumber, waitMs, webhookUrl, webhookSecret, reset } = req.body || {};
    if (mode !== 'qr' && mode !== 'pair') {
      res.status(400).json({ error: "mode must be 'qr' or 'pair'." });
      return;
    }

    if (reset || sessions.get(sessionId)?.status !== 'open') {
      await cleanupSession(sessionId, true);
    }

    const session = await getOrCreateSession(sessionId);

    // Webhook URL اختياري - يمكن إنشاء جلسة بدون webhook للاختبار
    if (webhookUrl) {
      session.webhook = buildWebhookConfig(
        { webhookUrl, webhookSecret },
        session.webhook
      );
      await saveSessionConfig(session.authPath, { webhook: session.webhook });
    }

    if (mode === 'pair') {
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        res.status(400).json({ error: 'phoneNumber is required for pair mode.' });
        return;
      }
      const pairingCode = await session.sock.requestPairingCode(phoneNumber);
      res.json({
        id: session.id,
        status: session.status,
        pairingCode,
        webhookUrl: session.webhook?.url || null,
        phoneNumber: session.identity?.phoneNumber || null,
        userJid: session.identity?.userJid || null,
        lid: session.identity?.lid || null,
        name: session.identity?.name || null
      });
      return;
    }

    const qr = await waitForSessionQr(session, waitMs);
    if (!qr) {
      res.status(202).json({
        id: session.id,
        status: session.status,
        qr: null,
        webhookUrl: session.webhook?.url || null,
        phoneNumber: session.identity?.phoneNumber || null,
        userJid: session.identity?.userJid || null,
        lid: session.identity?.lid || null,
        name: session.identity?.name || null
      });
      return;
    }
    res.json({
      id: session.id,
      status: session.status,
      qr,
      webhookUrl: session.webhook?.url || null,
      phoneNumber: session.identity?.phoneNumber || null,
      userJid: session.identity?.userJid || null,
      lid: session.identity?.lid || null,
      name: session.identity?.name || null
    });
  } catch (error) {
    next(error);
  }
});

app.get('/sessions/:id/qr', getLimiter, async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const session = await getOrCreateSession(sessionId);
    if (!session.qr) {
      res.status(404).json({ error: 'QR not ready yet.', status: session.status });
      return;
    }
    res.json({ sessionId, qr: session.qr });
  } catch (error) {
    next(error);
  }
});

app.post('/sessions/:id/pair', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { phoneNumber } = req.body || {};
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      res.status(400).json({ error: 'phoneNumber is required.' });
      return;
    }
    const session = await getOrCreateSession(sessionId);
    const pairingCode = await session.sock.requestPairingCode(phoneNumber);
    res.json({ sessionId, pairingCode });
  } catch (error) {
    next(error);
  }
});

app.post('/sessions/:id/send', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { to, message } = req.body || {};
    if (!to || !message) {
      res.status(400).json({ error: "Both 'to' and 'message' are required." });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }
    const jid = normalizeJid(to);
    if (!jid) {
      res.status(400).json({
        error: 'Recipient is invalid.',
        message: 'Phone number must be in international format (e.g., 201234567890 or 01012345678 for Egypt)',
        received: to
      });
      return;
    }

    // إضافة timeout للإرسال (30 ثانية)
    const sendPromise = session.sock.sendMessage(jid, { text: String(message) });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Message send timeout after 30 seconds')), 30000)
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result?.message) {
      cacheMessage(session, result);
    }
    logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent message');

    // Save to database if enabled
    if (DB_ENABLED && result?.key?.id) {
      db.saveMessage(sessionId, {
        messageId: result.key.id,
        direction: 'outbound',
        from: session.identity?.userJid,
        to: jid,
        messageType: 'text',
        text: String(message),
        status: 'sent',
        timestamp: Date.now(),
        raw: { to: jid, message }
      }).catch(err => {
        logger.warn({ error: err.message, sessionId }, 'failed to save outbound message to database');
      });
    }

    res.json({ id: result?.key?.id || null });
  } catch (error) {
    logger.error({ error: error.message, sessionId: req.params.id, to: req.body?.to }, 'send message failed');

    // رسالة خطأ أوضح
    if (error.message.includes('timeout')) {
      res.status(504).json({
        error: 'Request timeout',
        message: 'Message sending timed out. Please check if the phone number is correct and try again.',
        hint: 'Make sure the number is registered on WhatsApp and in international format'
      });
      return;
    }

    if (error.message?.includes('not registered') || error.message?.includes('not found')) {
      res.status(400).json({
        error: 'Phone number not registered',
        message: 'This phone number is not registered on WhatsApp'
      });
      return;
    }

    next(error);
  }
});

app.post('/sessions/:id/send-image', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { to, imageUrl, caption, imageBase64 } = req.body || {};

    if (!to) {
      res.status(400).json({ error: "'to' is required." });
      return;
    }

    if (!imageUrl && !imageBase64) {
      res.status(400).json({ error: "Either 'imageUrl' or 'imageBase64' is required." });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }

    const jid = normalizeJid(to);
    if (!jid) {
      res.status(400).json({
        error: 'Recipient is invalid.',
        message: 'Phone number must be in international format (e.g., 201234567890 or 01012345678 for Egypt)',
        received: to
      });
      return;
    }

    let imageBuffer;

    // إذا كان imageUrl موجود، حمله من URL
    if (imageUrl) {
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
      } catch (error) {
        logger.error({ error: error.message, imageUrl }, 'failed to download image');
        res.status(400).json({
          error: 'Failed to download image from URL',
          message: error.message
        });
        return;
      }
    }
    // إذا كان imageBase64 موجود، حوّله إلى buffer
    else if (imageBase64) {
      try {
        // إزالة data:image/...;base64, إذا كان موجوداً
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch (error) {
        logger.error({ error: error.message }, 'failed to decode base64 image');
        res.status(400).json({
          error: 'Invalid base64 image data',
          message: error.message
        });
        return;
      }
    }

    // إرسال الصورة
    const sendPromise = session.sock.sendMessage(jid, {
      image: imageBuffer,
      caption: caption || ''
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Image send timeout after 60 seconds')), 60000)
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result?.message) {
      cacheMessage(session, result);
    }

    logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent image');
    res.json({ id: result?.key?.id || null });
  } catch (error) {
    logger.error({ error: error.message, sessionId: req.params.id, to: req.body?.to }, 'send image failed');

    if (error.message.includes('timeout')) {
      res.status(504).json({
        error: 'Request timeout',
        message: 'Image sending timed out. Please try again.'
      });
      return;
    }

    next(error);
  }
});

app.post('/sessions/:id/send-poll', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { to, name, options, selectableCount } = req.body || {};
    if (!to || !name || !Array.isArray(options)) {
      res.status(400).json({ error: 'to, name, and options are required.' });
      return;
    }
    if (options.length < 2) {
      res.status(400).json({ error: 'options must have at least 2 entries.' });
      return;
    }
    const count = selectableCount ? Number(selectableCount) : 1;
    if (!Number.isInteger(count) || count < 1 || count > options.length) {
      res
        .status(400)
        .json({ error: 'selectableCount must be between 1 and the number of options.' });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }
    const jid = normalizeJid(to);
    if (!jid) {
      res.status(400).json({ error: 'Recipient is invalid.' });
      return;
    }
    const result = await session.sock.sendMessage(jid, {
      poll: {
        name: String(name),
        values: options.map((value) => String(value)),
        selectableCount: count
      }
    });
    if (result?.message) {
      cacheMessage(session, result);
      const meId = session.sock.user?.id;
      const meIdNormalized = meId ? jidNormalizedUser(meId) : 'me';
      recordPollCreation(session, result, meIdNormalized);
    }
    logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent poll');
    res.json({ id: result?.key?.id || null });
  } catch (error) {
    next(error);
  }
});

app.post('/sessions/:id/send-buttons', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const {
      to,
      text,
      buttons,
      footer,
      title,
      subtitle,
      contextInfo,
      options
    } = req.body || {};

    if (!to) {
      res.status(400).json({ error: 'to is required.' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }

    const jid = normalizeJid(to);
    if (!jid) {
      res.status(400).json({ error: 'Recipient is invalid.' });
      return;
    }

    const payload = { text, buttons: stringifyButtonParams(buttons) };
    if (footer !== undefined) payload.footer = footer;
    if (title !== undefined) payload.title = title;
    if (subtitle !== undefined) payload.subtitle = subtitle;
    if (contextInfo !== undefined) payload.contextInfo = contextInfo;

    const result = await sendButtons(session.sock, jid, payload, options || {});
    if (result?.message) {
      cacheMessage(session, result);
    }
    logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent buttons');
    res.json({ id: result?.key?.id || null });
  } catch (error) {
    if (error instanceof InteractiveValidationError || error?.name === 'InteractiveValidationError') {
      res.status(400).json({ error: error.toJSON ? error.toJSON() : error.message });
      return;
    }
    next(error);
  }
});

app.post('/sessions/:id/send-interactive', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { to, options, ...content } = req.body || {};

    if (!to) {
      res.status(400).json({ error: 'to is required.' });
      return;
    }

    if (!content.interactiveButtons && !content.interactiveMessage) {
      res.status(400).json({
        error: 'interactiveButtons or interactiveMessage is required.'
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }

    const jid = normalizeJid(to);
    if (!jid) {
      res.status(400).json({ error: 'Recipient is invalid.' });
      return;
    }

    const payload = normalizeInteractiveContent(content);
    const result = await hydratedTemplate(session.sock, jid, payload, options || {});
    if (result?.message) {
      cacheMessage(session, result);
    }
    logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent interactive message');
    res.json({ id: result?.key?.id || null });
  } catch (error) {
    if (error instanceof InteractiveValidationError || error?.name === 'InteractiveValidationError') {
      res.status(400).json({ error: error.toJSON ? error.toJSON() : error.message });
      return;
    }
    next(error);
  }
});

app.post('/sessions/:id/send-bulk', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    const { recipients, message, delay = 1000 } = req.body || {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'recipients must be a non-empty array.' });
      return;
    }

    // حد أقصى لعدد المستلمين
    if (recipients.length > MAX_BULK_SIZE) {
      res.status(400).json({
        error: `Maximum ${MAX_BULK_SIZE} recipients allowed per request.`,
        received: recipients.length,
        max: MAX_BULK_SIZE
      });
      return;
    }

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required and must be a string.' });
      return;
    }

    // حد أقصى لطول الرسالة
    if (message.length > 4096) {
      res.status(400).json({
        error: 'Message too long.',
        message: 'Maximum message length is 4096 characters.',
        received: message.length
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      res.status(409).json({ error: 'Session is not connected.' });
      return;
    }

    const results = [];
    const maxConcurrency = 5; // حد أقصى 5 رسائل في نفس الوقت

    // دالة لإرسال رسالة واحدة
    const sendSingleMessage = async (recipient) => {
      try {
        const phone = typeof recipient === 'string' ? recipient : recipient.phone || recipient.to;
        const jid = normalizeJid(phone);

        if (!jid) {
          return {
            recipient,
            success: false,
            error: 'Invalid phone number format'
          };
        }

        const result = await session.sock.sendMessage(jid, { text: String(message) });
        if (result?.message) {
          cacheMessage(session, result);
        }

        logger.info({ sessionId, to: jid, messageId: result?.key?.id }, 'sent bulk message');

        return {
          recipient,
          success: true,
          messageId: result?.key?.id || null
        };
      } catch (error) {
        logger.error({ error, sessionId, recipient }, 'bulk message failed');
        return {
          recipient,
          success: false,
          error: error.message
        };
      }
    };

    // إرسال الرسائل بالتتابع مع تأخير
    for (let i = 0; i < recipients.length; i += maxConcurrency) {
      const batch = recipients.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(sendSingleMessage);
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // تأخير بين الدفعات
      if (i + maxConcurrency < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    logger.info({ sessionId, total: results.length, success: successCount, failed: failCount }, 'bulk messaging completed');

    res.json({
      total: results.length,
      success: successCount,
      failed: failCount,
      results
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/sessions/:id', async (req, res, next) => {
  try {
    const sessionId = sanitizeSessionId(req.params.id);
    await cleanupSession(sessionId, true);
    res.json({ id: sessionId, status: 'logged_out', deleted: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  logger.error({ error }, 'request error');
  res.status(statusCode).json({ error: error.message || 'Internal error.' });
});

// Graceful Shutdown - إغلاق الجلسات بشكل صحيح
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal, closing gracefully');

  // إغلاق جميع الجلسات
  const shutdownPromises = [];
  for (const [sessionId, session] of sessions) {
    shutdownPromises.push(
      session.sock.logout().catch((error) => {
        logger.warn({ error, sessionId }, 'Error during session logout');
      })
    );
  }

  await Promise.all(shutdownPromises);
  logger.info('All sessions closed, exiting');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Memory cleanup دوري
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    // تنظيف الأحداث القديمة
    if (session.recentEvents) {
      for (const [eventId, timestamp] of session.recentEvents) {
        if (now - timestamp > IDEMPOTENCY_TTL_MS) {
          session.recentEvents.delete(eventId);
        }
      }
    }

    // تنظيف messageStore
    pruneMessageStore(session.messageStore);
  }
}, 60000); // كل دقيقة

async function start() {
  await ensureDir(SESSION_DIR);

  // Initialize database if enabled
  if (DB_ENABLED) {
    try {
      db.initDatabase();
      const connected = await db.testConnection();
      if (connected) {
        logger.info('database connection established');
      } else {
        logger.warn('database connection failed - continuing without database');
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'database initialization failed - continuing without database');
    }
  }

  if (API_KEY) {
    logger.info('API Authentication enabled');
  } else {
    logger.warn('API Authentication disabled - set API_KEY in environment to enable');
  }

  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      apiAuth: API_KEY ? 'enabled' : 'disabled',
      maxBulkSize: MAX_BULK_SIZE,
      database: DB_ENABLED ? 'enabled' : 'disabled'
    }, 'server listening');
  });
  restoreSessions();
}

start().catch((error) => {
  logger.error({ error }, 'server failed to start');
  process.exit(1);
});
