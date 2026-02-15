use rusqlite::{params, Connection};
use std::sync::Mutex;
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn run_migrations(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let schema = include_str!("../../schema.sql");
        conn.execute_batch(schema)?;
        Ok(())
    }

    // ── User queries ─────────────────────────────────────────────────────

    pub fn create_user(
        &self,
        id: &Uuid,
        username: &str,
        password_hash: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (?1, ?2, ?3)",
            params![id.to_string(), username, password_hash],
        )?;
        Ok(())
    }

    pub fn get_user_by_username(&self, username: &str) -> Result<Option<UserRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, password_hash, avatar_url, theme, language,
                    notifications_enabled, created_at, updated_at
             FROM users WHERE username = ?1",
        )?;
        let mut rows = stmt.query_map(params![username], |row| {
            Ok(UserRow {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: row.get(2)?,
                avatar_url: row.get(3)?,
                theme: row.get(4)?,
                language: row.get(5)?,
                notifications_enabled: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn get_user_by_id(&self, id: &str) -> Result<Option<UserRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, password_hash, avatar_url, theme, language,
                    notifications_enabled, created_at, updated_at
             FROM users WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(UserRow {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: row.get(2)?,
                avatar_url: row.get(3)?,
                theme: row.get(4)?,
                language: row.get(5)?,
                notifications_enabled: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn update_user(
        &self,
        id: &str,
        username: Option<&str>,
        avatar_url: Option<&str>,
        theme: Option<&str>,
        language: Option<&str>,
        notifications_enabled: Option<bool>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        if let Some(v) = username {
            conn.execute(
                "UPDATE users SET username = ?1 WHERE id = ?2",
                params![v, id],
            )?;
        }
        if let Some(v) = avatar_url {
            conn.execute(
                "UPDATE users SET avatar_url = ?1 WHERE id = ?2",
                params![v, id],
            )?;
        }
        if let Some(v) = theme {
            conn.execute("UPDATE users SET theme = ?1 WHERE id = ?2", params![v, id])?;
        }
        if let Some(v) = language {
            conn.execute(
                "UPDATE users SET language = ?1 WHERE id = ?2",
                params![v, id],
            )?;
        }
        if let Some(v) = notifications_enabled {
            conn.execute(
                "UPDATE users SET notifications_enabled = ?1 WHERE id = ?2",
                params![v as i32, id],
            )?;
        }
        Ok(())
    }

    // ── Server queries ───────────────────────────────────────────────────

    pub fn create_server(
        &self,
        id: &Uuid,
        name: &str,
        icon_url: Option<&str>,
        owner_id: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO servers (id, name, icon_url, owner_id) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), name, icon_url, owner_id],
        )?;
        // Also add owner as a member
        conn.execute(
            "INSERT INTO server_members (user_id, server_id, role) VALUES (?1, ?2, 'owner')",
            params![owner_id, id.to_string()],
        )?;
        // Create default channels
        let text_id = Uuid::new_v4();
        let voice_id = Uuid::new_v4();
        conn.execute(
            "INSERT INTO channels (id, server_id, name, type, position) VALUES (?1, ?2, 'general', 'text', 0)",
            params![text_id.to_string(), id.to_string()],
        )?;
        conn.execute(
            "INSERT INTO channels (id, server_id, name, type, position) VALUES (?1, ?2, 'General', 'voice', 1)",
            params![voice_id.to_string(), id.to_string()],
        )?;
        Ok(())
    }

    pub fn get_servers_for_user(&self, user_id: &str) -> Result<Vec<ServerRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.icon_url, s.owner_id, s.created_at, s.updated_at
             FROM servers s
             JOIN server_members sm ON s.id = sm.server_id
             WHERE sm.user_id = ?1
             ORDER BY s.name",
        )?;
        let rows = stmt
            .query_map(params![user_id], |row| {
                Ok(ServerRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon_url: row.get(2)?,
                    owner_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn join_server(&self, user_id: &str, server_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO server_members (user_id, server_id) VALUES (?1, ?2)",
            params![user_id, server_id],
        )?;
        Ok(())
    }

    pub fn leave_server(&self, user_id: &str, server_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM server_members WHERE user_id = ?1 AND server_id = ?2",
            params![user_id, server_id],
        )?;
        Ok(())
    }

    pub fn get_server_members(&self, server_id: &str) -> Result<Vec<MemberRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT sm.user_id, sm.server_id, sm.role, sm.joined_at,
                    u.username, u.avatar_url
             FROM server_members sm
             JOIN users u ON sm.user_id = u.id
             WHERE sm.server_id = ?1
             ORDER BY u.username",
        )?;
        let rows = stmt
            .query_map(params![server_id], |row| {
                Ok(MemberRow {
                    user_id: row.get(0)?,
                    server_id: row.get(1)?,
                    role: row.get(2)?,
                    joined_at: row.get(3)?,
                    username: row.get(4)?,
                    avatar_url: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Channel queries ──────────────────────────────────────────────────

    pub fn get_channels_for_server(
        &self,
        server_id: &str,
    ) -> Result<Vec<ChannelRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_id, name, type, position, created_at, updated_at
             FROM channels WHERE server_id = ?1 ORDER BY position",
        )?;
        let rows = stmt
            .query_map(params![server_id], |row| {
                Ok(ChannelRow {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    name: row.get(2)?,
                    channel_type: row.get(3)?,
                    position: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn create_channel(
        &self,
        id: &Uuid,
        server_id: &str,
        name: &str,
        channel_type: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let position: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM channels WHERE server_id = ?1",
                params![server_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO channels (id, server_id, name, type, position) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id.to_string(), server_id, name, channel_type, position],
        )?;
        Ok(())
    }

    pub fn delete_channel(&self, channel_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM channels WHERE id = ?1", params![channel_id])?;
        Ok(())
    }

    // ── Message queries ──────────────────────────────────────────────────

    pub fn create_message(
        &self,
        id: &Uuid,
        channel_id: &str,
        author_id: &str,
        content: Option<&str>,
    ) -> Result<MessageRow, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (id, channel_id, author_id, content) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), channel_id, author_id, content],
        )?;
        let mut stmt = conn.prepare(
            "SELECT m.id, m.channel_id, m.author_id, m.content, m.pinned, m.created_at, m.edited_at,
                    u.username, u.avatar_url
             FROM messages m JOIN users u ON m.author_id = u.id
             WHERE m.id = ?1",
        )?;
        stmt.query_row(params![id.to_string()], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                channel_id: row.get(1)?,
                author_id: row.get(2)?,
                content: row.get(3)?,
                pinned: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                edited_at: row.get(6)?,
                author_username: row.get(7)?,
                author_avatar_url: row.get(8)?,
            })
        })
    }

    pub fn get_messages(
        &self,
        channel_id: &str,
        limit: i32,
        before: Option<&str>,
    ) -> Result<Vec<MessageRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let (query, p): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(before_ts) =
            before
        {
            (
                "SELECT m.id, m.channel_id, m.author_id, m.content, m.pinned, m.created_at, m.edited_at,
                        u.username, u.avatar_url
                 FROM messages m JOIN users u ON m.author_id = u.id
                 WHERE m.channel_id = ?1 AND m.created_at < ?2
                 ORDER BY m.created_at DESC LIMIT ?3".to_string(),
                vec![
                    Box::new(channel_id.to_string()) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(before_ts.to_string()),
                    Box::new(limit),
                ],
            )
        } else {
            (
                "SELECT m.id, m.channel_id, m.author_id, m.content, m.pinned, m.created_at, m.edited_at,
                        u.username, u.avatar_url
                 FROM messages m JOIN users u ON m.author_id = u.id
                 WHERE m.channel_id = ?1
                 ORDER BY m.created_at DESC LIMIT ?2".to_string(),
                vec![
                    Box::new(channel_id.to_string()) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(limit),
                ],
            )
        };
        let mut stmt = conn.prepare(&query)?;
        let params_ref: Vec<&dyn rusqlite::types::ToSql> = p.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(params_ref.as_slice(), |row| {
                Ok(MessageRow {
                    id: row.get(0)?,
                    channel_id: row.get(1)?,
                    author_id: row.get(2)?,
                    content: row.get(3)?,
                    pinned: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                    edited_at: row.get(6)?,
                    author_username: row.get(7)?,
                    author_avatar_url: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_pinned_messages(
        &self,
        channel_id: &str,
    ) -> Result<Vec<MessageRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT m.id, m.channel_id, m.author_id, m.content, m.pinned, m.created_at, m.edited_at,
                    u.username, u.avatar_url
             FROM messages m JOIN users u ON m.author_id = u.id
             WHERE m.channel_id = ?1 AND m.pinned = 1
             ORDER BY m.created_at DESC",
        )?;
        let rows = stmt
            .query_map(params![channel_id], |row| {
                Ok(MessageRow {
                    id: row.get(0)?,
                    channel_id: row.get(1)?,
                    author_id: row.get(2)?,
                    content: row.get(3)?,
                    pinned: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                    edited_at: row.get(6)?,
                    author_username: row.get(7)?,
                    author_avatar_url: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn edit_message(&self, message_id: &str, content: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE messages SET content = ?1, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
            params![content, message_id],
        )?;
        Ok(())
    }

    pub fn delete_message(&self, message_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages WHERE id = ?1", params![message_id])?;
        Ok(())
    }

    pub fn pin_message(&self, message_id: &str, pinned: bool) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE messages SET pinned = ?1 WHERE id = ?2",
            params![pinned as i32, message_id],
        )?;
        Ok(())
    }

    pub fn get_message_channel(&self, message_id: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT channel_id FROM messages WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![message_id], |row| row.get::<_, String>(0))?;
        Ok(rows.next().transpose()?)
    }

    // ── Reaction queries ─────────────────────────────────────────────────

    pub fn add_reaction(
        &self,
        message_id: &str,
        user_id: &str,
        emoji: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?1, ?2, ?3)",
            params![message_id, user_id, emoji],
        )?;
        Ok(())
    }

    pub fn remove_reaction(
        &self,
        message_id: &str,
        user_id: &str,
        emoji: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM reactions WHERE message_id = ?1 AND user_id = ?2 AND emoji = ?3",
            params![message_id, user_id, emoji],
        )?;
        Ok(())
    }

    pub fn get_reactions_for_message(
        &self,
        message_id: &str,
        current_user_id: &str,
    ) -> Result<Vec<ReactionGroupRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT emoji, COUNT(*) as cnt,
                    MAX(CASE WHEN user_id = ?2 THEN 1 ELSE 0 END) as me
             FROM reactions WHERE message_id = ?1
             GROUP BY emoji",
        )?;
        let rows = stmt
            .query_map(params![message_id, current_user_id], |row| {
                Ok(ReactionGroupRow {
                    emoji: row.get(0)?,
                    count: row.get(1)?,
                    me: row.get::<_, i32>(2)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Attachment queries ───────────────────────────────────────────────

    pub fn create_attachment(
        &self,
        id: &Uuid,
        message_id: &str,
        file_url: &str,
        file_name: &str,
        mime_type: &str,
        size_bytes: Option<i64>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO attachments (id, message_id, file_url, file_name, mime_type, size_bytes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id.to_string(),
                message_id,
                file_url,
                file_name,
                mime_type,
                size_bytes
            ],
        )?;
        Ok(())
    }

    pub fn get_attachments_for_message(
        &self,
        message_id: &str,
    ) -> Result<Vec<AttachmentRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, message_id, file_url, file_name, mime_type, size_bytes, created_at
             FROM attachments WHERE message_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![message_id], |row| {
                Ok(AttachmentRow {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    file_url: row.get(2)?,
                    file_name: row.get(3)?,
                    mime_type: row.get(4)?,
                    size_bytes: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Voice state queries ──────────────────────────────────────────────

    pub fn join_voice_channel(
        &self,
        user_id: &str,
        channel_id: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        // Remove from any existing voice channel first
        conn.execute(
            "DELETE FROM voice_states WHERE user_id = ?1",
            params![user_id],
        )?;
        conn.execute(
            "INSERT INTO voice_states (user_id, channel_id) VALUES (?1, ?2)",
            params![user_id, channel_id],
        )?;
        Ok(())
    }

    pub fn leave_voice_channel(&self, user_id: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let channel_id: Option<String> = conn
            .query_row(
                "SELECT channel_id FROM voice_states WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .ok();
        conn.execute(
            "DELETE FROM voice_states WHERE user_id = ?1",
            params![user_id],
        )?;
        Ok(channel_id)
    }

    pub fn update_voice_state(
        &self,
        user_id: &str,
        muted: bool,
        deafened: bool,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE voice_states SET muted = ?1, deafened = ?2 WHERE user_id = ?3",
            params![muted as i32, deafened as i32, user_id],
        )?;
        Ok(())
    }

    pub fn get_voice_states_for_channel(
        &self,
        channel_id: &str,
    ) -> Result<Vec<VoiceStateRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT vs.user_id, vs.channel_id, vs.muted, vs.deafened, vs.joined_at,
                    u.username, u.avatar_url
             FROM voice_states vs
             JOIN users u ON vs.user_id = u.id
             WHERE vs.channel_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![channel_id], |row| {
                Ok(VoiceStateRow {
                    user_id: row.get(0)?,
                    channel_id: row.get(1)?,
                    muted: row.get::<_, i32>(2)? != 0,
                    deafened: row.get::<_, i32>(3)? != 0,
                    joined_at: row.get(4)?,
                    username: row.get(5)?,
                    avatar_url: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_user_voice_channel(&self, user_id: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT channel_id FROM voice_states WHERE user_id = ?1",
            params![user_id],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(channel_id) => Ok(Some(channel_id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    // ── Mention queries ──────────────────────────────────────────────────

    pub fn create_mention(
        &self,
        id: &Uuid,
        message_id: &str,
        mention_type: &str,
        target_id: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mentions (id, message_id, type, target_id) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), message_id, mention_type, target_id],
        )?;
        Ok(())
    }

    // ── Utility ──────────────────────────────────────────────────────────

    pub fn get_channel_server_id(
        &self,
        channel_id: &str,
    ) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT server_id FROM channels WHERE id = ?1",
            params![channel_id],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(sid) => Ok(Some(sid)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn is_user_member_of_server(
        &self,
        user_id: &str,
        server_id: &str,
    ) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM server_members WHERE user_id = ?1 AND server_id = ?2",
            params![user_id, server_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn get_server_by_id(&self, server_id: &str) -> Result<Option<ServerRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT id, name, icon_url, owner_id, created_at, updated_at FROM servers WHERE id = ?1",
            params![server_id],
            |row| {
                Ok(ServerRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon_url: row.get(2)?,
                    owner_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        );
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    // ── DM queries ───────────────────────────────────────────────────────

    pub fn get_dm_conversations(&self, user_id: &str) -> Result<Vec<DmConversationRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT dc.id, dc.user1_id, dc.user2_id, dc.created_at, dc.updated_at,
                    u.id as other_user_id, u.username as other_username, u.avatar_url as other_avatar_url
             FROM dm_conversations dc
             JOIN users u ON (CASE WHEN dc.user1_id = ?1 THEN dc.user2_id = u.id ELSE dc.user1_id = u.id END)
             WHERE dc.user1_id = ?1 OR dc.user2_id = ?1
             ORDER BY dc.updated_at DESC",
        )?;
        let rows = stmt
            .query_map(params![user_id], |row| {
                Ok(DmConversationRow {
                    id: row.get(0)?,
                    user1_id: row.get(1)?,
                    user2_id: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    other_user_id: row.get(5)?,
                    other_username: row.get(6)?,
                    other_avatar_url: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_dm_conversation(&self, user1_id: &str, user2_id: &str) -> Result<Option<DmConversationRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT id, user1_id, user2_id, created_at, updated_at FROM dm_conversations WHERE user1_id = ?1 AND user2_id = ?2",
            params![user1_id, user2_id],
            |row| {
                Ok(DmConversationRow {
                    id: row.get(0)?,
                    user1_id: row.get(1)?,
                    user2_id: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    other_user_id: String::new(),
                    other_username: String::new(),
                    other_avatar_url: None,
                })
            },
        );
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn create_dm_conversation(&self, id: &Uuid, user1_id: &str, user2_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO dm_conversations (id, user1_id, user2_id) VALUES (?1, ?2, ?3)",
            params![id.to_string(), user1_id, user2_id],
        )?;
        Ok(())
    }

    pub fn get_dm_messages(&self, conversation_id: &str) -> Result<Vec<DmMessageRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.created_at, dm.edited_at,
                    u.username, u.avatar_url
             FROM dm_messages dm
             JOIN users u ON dm.author_id = u.id
             WHERE dm.conversation_id = ?1
             ORDER BY dm.created_at ASC
             LIMIT 100",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], |row| {
                Ok(DmMessageRow {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    author_id: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    edited_at: row.get(5)?,
                    author_username: row.get(6)?,
                    author_avatar_url: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_last_dm_message(&self, conversation_id: &str) -> Result<Option<DmMessageRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.created_at, dm.edited_at,
                    u.username, u.avatar_url
             FROM dm_messages dm
             JOIN users u ON dm.author_id = u.id
             WHERE dm.conversation_id = ?1
             ORDER BY dm.created_at DESC
             LIMIT 1",
            params![conversation_id],
            |row| {
                Ok(DmMessageRow {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    author_id: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    edited_at: row.get(5)?,
                    author_username: row.get(6)?,
                    author_avatar_url: row.get(7)?,
                })
            },
        );
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn create_dm_message(&self, id: &Uuid, conversation_id: &str, author_id: &str, content: Option<&str>) -> Result<DmMessageRow, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO dm_messages (id, conversation_id, author_id, content) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), conversation_id, author_id, content],
        )?;
        conn.execute(
            "UPDATE dm_conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
            params![conversation_id],
        )?;
        let mut stmt = conn.prepare(
            "SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.created_at, dm.edited_at,
                    u.username, u.avatar_url
             FROM dm_messages dm JOIN users u ON dm.author_id = u.id
             WHERE dm.id = ?1",
        )?;
        stmt.query_row(params![id.to_string()], |row| {
            Ok(DmMessageRow {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                author_id: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                edited_at: row.get(5)?,
                author_username: row.get(6)?,
                author_avatar_url: row.get(7)?,
            })
        })
    }

    pub fn edit_dm_message(&self, message_id: &str, content: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE dm_messages SET content = ?1, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
            params![content, message_id],
        )?;
        Ok(())
    }

    pub fn delete_dm_message(&self, message_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM dm_messages WHERE id = ?1", params![message_id])?;
        Ok(())
    }

    pub fn get_dm_message_info(&self, message_id: &str) -> Result<Option<(String, String)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT author_id, conversation_id FROM dm_messages WHERE id = ?1",
            params![message_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        );
        match result {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_dm_conversation_users(&self, conversation_id: &str) -> Result<Option<(String, String)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT user1_id, user2_id FROM dm_conversations WHERE id = ?1",
            params![conversation_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        );
        match result {
            Ok(users) => Ok(Some(users)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn add_dm_reaction(&self, message_id: &str, user_id: &str, emoji: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO dm_reactions (message_id, user_id, emoji) VALUES (?1, ?2, ?3)",
            params![message_id, user_id, emoji],
        )?;
        Ok(())
    }

    pub fn remove_dm_reaction(&self, message_id: &str, user_id: &str, emoji: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM dm_reactions WHERE message_id = ?1 AND user_id = ?2 AND emoji = ?3",
            params![message_id, user_id, emoji],
        )?;
        Ok(())
    }

    pub fn get_dm_reactions(&self, message_id: &str, current_user_id: &str) -> Result<Vec<ReactionGroupRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT emoji, COUNT(*) as cnt,
                    MAX(CASE WHEN user_id = ?2 THEN 1 ELSE 0 END) as me
             FROM dm_reactions WHERE message_id = ?1
             GROUP BY emoji",
        )?;
        let rows = stmt
            .query_map(params![message_id, current_user_id], |row| {
                Ok(ReactionGroupRow {
                    emoji: row.get(0)?,
                    count: row.get(1)?,
                    me: row.get::<_, i32>(2)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_dm_attachments(&self, message_id: &str) -> Result<Vec<AttachmentRow>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, message_id, file_url, file_name, mime_type, size_bytes, created_at
             FROM dm_attachments WHERE message_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![message_id], |row| {
                Ok(AttachmentRow {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    file_url: row.get(2)?,
                    file_name: row.get(3)?,
                    mime_type: row.get(4)?,
                    size_bytes: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

// ── Row types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct UserRow {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub avatar_url: Option<String>,
    pub theme: String,
    pub language: String,
    pub notifications_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct ServerRow {
    pub id: String,
    pub name: String,
    pub icon_url: Option<String>,
    pub owner_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct MemberRow {
    pub user_id: String,
    pub server_id: String,
    pub role: String,
    pub joined_at: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ChannelRow {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub channel_type: String,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct MessageRow {
    pub id: String,
    pub channel_id: String,
    pub author_id: String,
    pub content: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub author_username: String,
    pub author_avatar_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AttachmentRow {
    pub id: String,
    pub message_id: String,
    pub file_url: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct ReactionGroupRow {
    pub emoji: String,
    pub count: i32,
    pub me: bool,
}

#[derive(Debug, Clone)]
pub struct VoiceStateRow {
    pub user_id: String,
    pub channel_id: String,
    pub muted: bool,
    pub deafened: bool,
    pub joined_at: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DmConversationRow {
    pub id: String,
    pub user1_id: String,
    pub user2_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub other_user_id: String,
    pub other_username: String,
    pub other_avatar_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DmMessageRow {
    pub id: String,
    pub conversation_id: String,
    pub author_id: String,
    pub content: Option<String>,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub author_username: String,
    pub author_avatar_url: Option<String>,
}
