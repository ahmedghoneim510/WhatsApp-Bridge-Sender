-- WhatsApp Bridge Database Schema
-- This schema stores messages, webhooks, polls, and session data

CREATE DATABASE IF NOT EXISTS whatsapp_bridge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE whatsapp_bridge;

-- Sessions table: Track all WhatsApp sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(100) PRIMARY KEY,
    status ENUM('connecting', 'open', 'closed') NOT NULL DEFAULT 'connecting',
    phone_number VARCHAR(20),
    user_jid VARCHAR(100),
    name VARCHAR(255),
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    last_connected_at TIMESTAMP NULL,
    last_disconnected_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_phone (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages table: Store all sent and received messages
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(100) NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    from_jid VARCHAR(100),
    from_phone VARCHAR(20),
    to_jid VARCHAR(100),
    to_phone VARCHAR(20),
    message_type VARCHAR(50),
    text_content TEXT,
    media_url TEXT,
    caption TEXT,
    status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
    raw_data JSON,
    timestamp BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_message (session_id, message_id),
    INDEX idx_session (session_id),
    INDEX idx_from_phone (from_phone),
    INDEX idx_to_phone (to_phone),
    INDEX idx_direction (direction),
    INDEX idx_timestamp (timestamp),
    INDEX idx_created (created_at),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Polls table: Store poll creations
CREATE TABLE IF NOT EXISTS polls (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    poll_key VARCHAR(255) NOT NULL,
    message_id VARCHAR(100),
    poll_name TEXT,
    options JSON,
    selectable_count INT DEFAULT 1,
    creator_jid VARCHAR(100),
    creator_phone VARCHAR(20),
    poll_enc_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_poll (session_id, poll_key),
    INDEX idx_session (session_id),
    INDEX idx_message_id (message_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Poll votes table: Store individual poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    poll_id BIGINT UNSIGNED NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    poll_message_id VARCHAR(100),
    vote_message_id VARCHAR(100),
    voter_jid VARCHAR(100),
    voter_phone VARCHAR(20),
    selected_options JSON,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_poll (poll_id),
    INDEX idx_session (session_id),
    INDEX idx_voter (voter_phone),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhook events table: Log all webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSON,
    webhook_url TEXT,
    status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_event (event_id),
    INDEX idx_session (session_id),
    INDEX idx_type (event_type),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contacts table: Store contact information
CREATE TABLE IF NOT EXISTS contacts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    jid VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    name VARCHAR(255),
    notify_name VARCHAR(255),
    is_business BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_contact (session_id, jid),
    INDEX idx_session (session_id),
    INDEX idx_phone (phone),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Message status updates table: Track delivery/read receipts
CREATE TABLE IF NOT EXISTS message_status_updates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    status ENUM('sent', 'delivered', 'read', 'failed') NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message (message_id),
    INDEX idx_session (session_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Analytics view: Message statistics per session
CREATE OR REPLACE VIEW message_stats AS
SELECT 
    session_id,
    COUNT(*) as total_messages,
    SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_count,
    SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound_count,
    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
    SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
    MAX(created_at) as last_message_at
FROM messages
GROUP BY session_id;
