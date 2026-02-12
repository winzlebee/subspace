use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{Message, ReactionGroup, UserPublic, VoiceState};

/// All WebSocket messages share this envelope format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEnvelope {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub payload: serde_json::Value,
}

// ────────────────────────────────────────────────────────────────────────────
// Client → Server
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsAuth {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSendMessage {
    pub channel_id: Uuid,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEditMessage {
    pub message_id: Uuid,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsDeleteMessage {
    pub message_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsAddReaction {
    pub message_id: Uuid,
    pub emoji: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsRemoveReaction {
    pub message_id: Uuid,
    pub emoji: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsTyping {
    pub channel_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsJoinVoice {
    pub channel_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsLeaveVoice {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsVoiceMuteDeafen {
    pub muted: bool,
    pub deafened: bool,
}

/// WebRTC signaling: SDP offer/answer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSignalSdp {
    pub target_user_id: Uuid,
    pub sdp: String,
    pub sdp_type: String, // "offer" | "answer"
}

/// WebRTC signaling: ICE candidate
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSignalIce {
    pub target_user_id: Uuid,
    pub candidate: String,
    pub sdp_mid: Option<String>,
    pub sdp_mline_index: Option<u16>,
}

// ────────────────────────────────────────────────────────────────────────────
// Server → Client
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessageCreated {
    pub message: Message,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessageUpdated {
    pub message_id: Uuid,
    pub content: Option<String>,
    pub edited_at: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessageDeleted {
    pub message_id: Uuid,
    pub channel_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsReactionUpdated {
    pub message_id: Uuid,
    pub reactions: Vec<ReactionGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsUserTyping {
    pub channel_id: Uuid,
    pub user: UserPublic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsVoiceStateUpdate {
    pub channel_id: Uuid,
    pub voice_states: Vec<VoiceState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSignalSdpRelay {
    pub from_user_id: Uuid,
    pub sdp: String,
    pub sdp_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsSignalIceRelay {
    pub from_user_id: Uuid,
    pub candidate: String,
    pub sdp_mid: Option<String>,
    pub sdp_mline_index: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsError {
    pub message: String,
}
