use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ────────────────────────────────────────────────────────────────────────────
// User
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
    pub theme: String,
    pub language: String,
    pub notifications_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// User status and presence information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStatus {
    pub user_id: Uuid,
    pub status: String, // 'online' | 'idle' | 'dnd' | 'offline'
    pub custom_text: Option<String>,
    pub activity_type: Option<String>,
    pub activity_name: Option<String>,
    pub last_seen: String,
    pub updated_at: String,
}

/// Public-facing user info (no password hash, no settings)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
    pub status: Option<UserStatus>,
}

// ────────────────────────────────────────────────────────────────────────────
// Server
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: Uuid,
    pub name: String,
    pub icon_url: Option<String>,
    pub owner_id: Uuid,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub icon_url: Option<String>,
}

// ────────────────────────────────────────────────────────────────────────────
// Server Member
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMember {
    pub user_id: Uuid,
    pub server_id: Uuid,
    pub role: String,
    pub joined_at: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub status: Option<UserStatus>,
}

// ────────────────────────────────────────────────────────────────────────────
// Channel
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: Uuid,
    pub server_id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: String,
}

// ────────────────────────────────────────────────────────────────────────────
// Message
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub author_id: Uuid,
    pub content: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub author: Option<UserPublic>,
    pub attachments: Vec<Attachment>,
    pub reactions: Vec<ReactionGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub content: Option<String>,
}

// ────────────────────────────────────────────────────────────────────────────
// Attachment
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: Uuid,
    pub message_id: Uuid,
    pub file_url: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: Option<i64>,
    pub created_at: String,
}

// ────────────────────────────────────────────────────────────────────────────
// Reaction
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub message_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: String,
}

/// Grouped reaction count for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionGroup {
    pub emoji: String,
    pub count: i32,
    pub me: bool,
}

// ────────────────────────────────────────────────────────────────────────────
// Voice State
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceState {
    pub user_id: Uuid,
    pub channel_id: Uuid,
    pub muted: bool,
    pub deafened: bool,
    pub joined_at: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

// ────────────────────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub theme: Option<String>,
    pub language: Option<String>,
    pub notifications_enabled: Option<bool>,
}

// ────────────────────────────────────────────────────────────────────────────
// Direct Messages
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmConversation {
    pub id: Uuid,
    pub user1_id: Uuid,
    pub user2_id: Uuid,
    pub other_user: UserPublic,
    pub last_message: Option<DmMessage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub author_id: Uuid,
    pub content: Option<String>,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub author: Option<UserPublic>,
    pub attachments: Vec<Attachment>,
    pub reactions: Vec<ReactionGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDmRequest {
    pub recipient_username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDmMessageRequest {
    pub content: Option<String>,
}
