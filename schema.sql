-- Subspace Database Schema
-- Designed for SQLite with future PostgreSQL migration in mind.
-- Avoids SQLite-only features; uses standard SQL types.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

--------------------------------------------------------------------------------
-- Users
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,               -- UUID
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    avatar_url    TEXT,
    theme         TEXT    NOT NULL DEFAULT 'dark', -- 'light' | 'dark'
    language      TEXT    NOT NULL DEFAULT 'en',
    notifications_enabled INTEGER NOT NULL DEFAULT 1, -- boolean (0/1)
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

--------------------------------------------------------------------------------
-- Servers
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,               -- UUID
    name        TEXT NOT NULL,
    icon_url    TEXT,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);

--------------------------------------------------------------------------------
-- Server Members  (many-to-many: users ↔ servers)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS server_members (
    user_id   TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id)  ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member',       -- 'owner' | 'admin' | 'member'
    joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);

--------------------------------------------------------------------------------
-- Channels  (belong to a server; type = 'text' | 'voice')
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,               -- UUID
    server_id   TEXT    NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK (type IN ('text', 'voice')),
    position    INTEGER NOT NULL DEFAULT 0,     -- display ordering
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);

--------------------------------------------------------------------------------
-- Messages  (belong to a text channel)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,               -- UUID
    channel_id TEXT    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id  TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    content    TEXT,                            -- markdown text (nullable for media-only)
    pinned     INTEGER NOT NULL DEFAULT 0,     -- boolean
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    edited_at  TEXT                             -- NULL until edited
);

CREATE INDEX IF NOT EXISTS idx_messages_channel   ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author    ON messages(author_id);

--------------------------------------------------------------------------------
-- Message Attachments  (images / videos uploaded with a message)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id         TEXT PRIMARY KEY,               -- UUID
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_url   TEXT NOT NULL,
    file_name  TEXT NOT NULL,
    mime_type  TEXT NOT NULL,                   -- e.g. 'image/png', 'video/mp4'
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

--------------------------------------------------------------------------------
-- Reactions  (emoji reactions on messages)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    emoji      TEXT NOT NULL,                  -- native Unicode emoji character(s)
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

--------------------------------------------------------------------------------
-- Mentions  (tracks @user, @here, @everyone per message for notifications)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentions (
    id         TEXT PRIMARY KEY,               -- UUID
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('user', 'here', 'everyone')),
    target_id  TEXT REFERENCES users(id) ON DELETE CASCADE, -- NULL for @here/@everyone
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mentions_message ON mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_mentions_target  ON mentions(target_id);

--------------------------------------------------------------------------------
-- Voice State  (ephemeral: who is in which voice channel right now)
-- Rows are inserted on join and deleted on leave.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_states (
    user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    muted      INTEGER NOT NULL DEFAULT 0,     -- self-mute
    deafened   INTEGER NOT NULL DEFAULT 0,     -- self-deafen
    joined_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_states_channel ON voice_states(channel_id);
