use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{auth::AuthUser, AppState};
use shared::models::{
    Attachment, CreateDmMessageRequest, CreateDmRequest, DmConversation, DmMessage, ReactionGroup,
    UserPublic,
};

// ────────────────────────────────────────────────────────────────────────────
// List DM Conversations
// ────────────────────────────────────────────────────────────────────────────

pub async fn list_conversations(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    match state.db.get_dm_conversations(&user.user_id) {
        Ok(rows) => {
            let mut conversations = Vec::new();

            for row in rows {
                let conv_id = Uuid::parse_str(&row.id).unwrap();

                // Get last message
                let last_message = state
                    .db
                    .get_last_dm_message(&row.id)
                    .ok()
                    .flatten()
                    .map(|msg_row| DmMessage {
                        id: Uuid::parse_str(&msg_row.id).unwrap(),
                        conversation_id: Uuid::parse_str(&msg_row.conversation_id).unwrap(),
                        author_id: Uuid::parse_str(&msg_row.author_id).unwrap(),
                        content: msg_row.content,
                        created_at: msg_row.created_at,
                        edited_at: msg_row.edited_at,
                        author: Some(UserPublic {
                            id: Uuid::parse_str(&msg_row.author_id).unwrap(),
                            username: msg_row.author_username,
                            avatar_url: msg_row.author_avatar_url,
                        }),
                        attachments: vec![],
                        reactions: vec![],
                    });

                conversations.push(DmConversation {
                    id: conv_id,
                    user1_id: Uuid::parse_str(&row.user1_id).unwrap(),
                    user2_id: Uuid::parse_str(&row.user2_id).unwrap(),
                    other_user: UserPublic {
                        id: Uuid::parse_str(&row.other_user_id).unwrap(),
                        username: row.other_username,
                        avatar_url: row.other_avatar_url,
                    },
                    last_message,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                });
            }

            Json(conversations).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to list DM conversations: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Create or Get DM Conversation
// ────────────────────────────────────────────────────────────────────────────

pub async fn create_conversation(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    
    // Parse body manually
    let body: CreateDmRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    // Find recipient by username
    let recipient = match state.db.get_user_by_username(&body.recipient_username) {
        Ok(Some(user)) => user,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "User not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to find user: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let recipient_id = Uuid::parse_str(&recipient.id).unwrap();

    // Can't DM yourself
    if recipient_id == user_id {
        return (StatusCode::BAD_REQUEST, "Cannot create DM with yourself").into_response();
    }

    // Ensure consistent ordering (user1_id < user2_id)
    let (user1_id, user2_id) = if user_id < recipient_id {
        (user_id, recipient_id)
    } else {
        (recipient_id, user_id)
    };

    // Check if conversation already exists
    let conv_id = match state
        .db
        .get_dm_conversation(&user1_id.to_string(), &user2_id.to_string())
    {
        Ok(Some(existing)) => Uuid::parse_str(&existing.id).unwrap(),
        Ok(None) => {
            // Create new conversation
            let new_id = Uuid::new_v4();
            if let Err(e) = state.db.create_dm_conversation(
                &new_id,
                &user1_id.to_string(),
                &user2_id.to_string(),
            ) {
                tracing::error!("Failed to create DM conversation: {e}");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            new_id
        }
        Err(e) => {
            tracing::error!("Failed to check for existing conversation: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Fetch the conversation with proper timestamps
    let conv_row = match state.db.get_dm_conversation(&user1_id.to_string(), &user2_id.to_string()) {
        Ok(Some(row)) => row,
        _ => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    Json(DmConversation {
        id: conv_id,
        user1_id,
        user2_id,
        other_user: UserPublic {
            id: recipient_id,
            username: recipient.username,
            avatar_url: recipient.avatar_url,
        },
        last_message: None,
        created_at: conv_row.created_at,
        updated_at: conv_row.updated_at,
    })
    .into_response()
}

// ────────────────────────────────────────────────────────────────────────────
// Get DM Messages
// ────────────────────────────────────────────────────────────────────────────

pub async fn get_messages(
    State(state): State<Arc<AppState>>,
    Path(conversation_id): Path<Uuid>,
    req: Request,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    // Verify user is part of this conversation
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (Uuid::parse_str(&u1).unwrap(), Uuid::parse_str(&u2).unwrap()),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Conversation not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get conversation users: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if user_id != user1 && user_id != user2 {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    // Fetch messages
    match state.db.get_dm_messages(&conversation_id.to_string()) {
        Ok(rows) => {
            let mut messages = Vec::new();

            for row in rows {
                let msg_id = Uuid::parse_str(&row.id).unwrap();

                // Fetch attachments
                let attachments = state
                    .db
                    .get_dm_attachments(&msg_id.to_string())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|a| Attachment {
                        id: Uuid::parse_str(&a.id).unwrap(),
                        message_id: Uuid::parse_str(&a.message_id).unwrap(),
                        file_url: a.file_url,
                        file_name: a.file_name,
                        mime_type: a.mime_type,
                        size_bytes: a.size_bytes,
                        created_at: a.created_at,
                    })
                    .collect();

                // Fetch reactions
                let reactions = state
                    .db
                    .get_dm_reactions(&msg_id.to_string(), &user.user_id)
                    .unwrap_or_default()
                    .into_iter()
                    .map(|r| ReactionGroup {
                        emoji: r.emoji,
                        count: r.count,
                        me: r.me,
                    })
                    .collect();

                messages.push(DmMessage {
                    id: msg_id,
                    conversation_id: Uuid::parse_str(&row.conversation_id).unwrap(),
                    author_id: Uuid::parse_str(&row.author_id).unwrap(),
                    content: row.content,
                    created_at: row.created_at,
                    edited_at: row.edited_at,
                    author: Some(UserPublic {
                        id: Uuid::parse_str(&row.author_id).unwrap(),
                        username: row.author_username,
                        avatar_url: row.author_avatar_url,
                    }),
                    attachments,
                    reactions,
                });
            }

            Json(messages).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get DM messages: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Create DM Message
// ─────────────────────────���──────────────────────────────────────────────────

pub async fn create_message(
    State(state): State<Arc<AppState>>,
    Path(conversation_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    
    // Parse body manually
    let body: CreateDmMessageRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    // Verify user is part of this conversation
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (Uuid::parse_str(&u1).unwrap(), Uuid::parse_str(&u2).unwrap()),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Conversation not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get conversation users: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if user_id != user1 && user_id != user2 {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    // Create message
    let msg_id = Uuid::new_v4();
    match state.db.create_dm_message(
        &msg_id,
        &conversation_id.to_string(),
        &user.user_id,
        body.content.as_deref(),
    ) {
        Ok(row) => {
            let message = DmMessage {
                id: msg_id,
                conversation_id: Uuid::parse_str(&row.conversation_id).unwrap(),
                author_id: Uuid::parse_str(&row.author_id).unwrap(),
                content: row.content,
                created_at: row.created_at,
                edited_at: row.edited_at,
                author: Some(UserPublic {
                    id: Uuid::parse_str(&row.author_id).unwrap(),
                    username: row.author_username,
                    avatar_url: row.author_avatar_url,
                }),
                attachments: vec![],
                reactions: vec![],
            };

            // Broadcast via WebSocket
            let ws_msg = shared::ws_messages::WsEnvelope {
                msg_type: "dm_message_created".to_string(),
                payload: serde_json::to_value(&shared::ws_messages::WsDmMessageCreated {
                    message: message.clone(),
                })
                .unwrap(),
            };

            let ws_msg_str = serde_json::to_string(&ws_msg).unwrap();
            state
                .ws_state
                .broadcast_to_user(&user1.to_string(), &ws_msg_str)
                .await;
            state
                .ws_state
                .broadcast_to_user(&user2.to_string(), &ws_msg_str)
                .await;

            (StatusCode::CREATED, Json(message)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create DM message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Edit DM Message
// ────────────────────────────────────────────────────────────────────────────

pub async fn edit_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    
    // Parse body manually
    let body: CreateDmMessageRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    // Verify ownership
    let (author_id, conversation_id) = match state
        .db
        .get_dm_message_info(&message_id.to_string())
    {
        Ok(Some((author, conv))) => (
            Uuid::parse_str(&author).unwrap(),
            Uuid::parse_str(&conv).unwrap(),
        ),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Message not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get message info: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if author_id != user_id {
        return (StatusCode::FORBIDDEN, "Not your message").into_response();
    }

    // Update message
    if let Err(e) = state
        .db
        .edit_dm_message(&message_id.to_string(), body.content.as_deref().unwrap_or(""))
    {
        tracing::error!("Failed to edit DM message: {e}");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Get conversation users for broadcast
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (u1, u2),
        _ => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Broadcast update
    let ws_msg = shared::ws_messages::WsEnvelope {
        msg_type: "dm_message_updated".to_string(),
        payload: serde_json::to_value(&shared::ws_messages::WsDmMessageUpdated {
            message_id,
            content: body.content.clone(),
            edited_at: None,
        })
        .unwrap(),
    };

    let ws_msg_str = serde_json::to_string(&ws_msg).unwrap();
    state.ws_state.broadcast_to_user(&user1, &ws_msg_str).await;
    state.ws_state.broadcast_to_user(&user2, &ws_msg_str).await;

    Json(json!({ "success": true })).into_response()
}

// ────────────────────────────────────────────────────────────────────────────
// Delete DM Message
// ────────────────────────────────────────────────────────────────────────────

pub async fn delete_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
    req: Request,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    // Verify ownership
    let (author_id, conversation_id) = match state
        .db
        .get_dm_message_info(&message_id.to_string())
    {
        Ok(Some((author, conv))) => (
            Uuid::parse_str(&author).unwrap(),
            Uuid::parse_str(&conv).unwrap(),
        ),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Message not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get message info: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if author_id != user_id {
        return (StatusCode::FORBIDDEN, "Not your message").into_response();
    }

    // Get conversation users before deleting
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (u1, u2),
        _ => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Delete message
    if let Err(e) = state.db.delete_dm_message(&message_id.to_string()) {
        tracing::error!("Failed to delete DM message: {e}");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Broadcast deletion
    let ws_msg = shared::ws_messages::WsEnvelope {
        msg_type: "dm_message_deleted".to_string(),
        payload: serde_json::to_value(&shared::ws_messages::WsDmMessageDeleted {
            message_id,
            conversation_id,
        })
        .unwrap(),
    };

    let ws_msg_str = serde_json::to_string(&ws_msg).unwrap();
    state.ws_state.broadcast_to_user(&user1, &ws_msg_str).await;
    state.ws_state.broadcast_to_user(&user2, &ws_msg_str).await;

    StatusCode::NO_CONTENT.into_response()
}

// ────────────────────────────────────────────────────────────────────────────
// Add Reaction to DM Message
// ────────────────────────────────────────────────────────────────────────────

pub async fn add_reaction(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    
    // Parse body manually
    let body: serde_json::Value = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let user_id = Uuid::parse_str(&user.user_id).unwrap();

    let emoji = match body["emoji"].as_str() {
        Some(e) => e,
        None => return (StatusCode::BAD_REQUEST, "Missing emoji").into_response(),
    };

    // Verify message exists and get conversation
    let conversation_id = match state.db.get_dm_message_info(&message_id.to_string()) {
        Ok(Some((_, conv))) => Uuid::parse_str(&conv).unwrap(),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Message not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get message info: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Verify user is part of conversation
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (Uuid::parse_str(&u1).unwrap(), Uuid::parse_str(&u2).unwrap()),
        _ => return (StatusCode::FORBIDDEN, "Access denied").into_response(),
    };

    if user_id != user1 && user_id != user2 {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    // Add reaction
    if let Err(e) = state
        .db
        .add_dm_reaction(&message_id.to_string(), &user.user_id, emoji)
    {
        tracing::error!("Failed to add DM reaction: {e}");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Fetch updated reactions
    let reactions = state
        .db
        .get_dm_reactions(&message_id.to_string(), &user.user_id)
        .unwrap_or_default()
        .into_iter()
        .map(|r| ReactionGroup {
            emoji: r.emoji,
            count: r.count,
            me: r.me,
        })
        .collect::<Vec<_>>();

    // Broadcast update
    let ws_msg = shared::ws_messages::WsEnvelope {
        msg_type: "dm_reaction_updated".to_string(),
        payload: serde_json::to_value(&shared::ws_messages::WsDmReactionUpdated {
            message_id,
            reactions: reactions.clone(),
        })
        .unwrap(),
    };

    let ws_msg_str = serde_json::to_string(&ws_msg).unwrap();
    state
        .ws_state
        .broadcast_to_user(&user1.to_string(), &ws_msg_str)
        .await;
    state
        .ws_state
        .broadcast_to_user(&user2.to_string(), &ws_msg_str)
        .await;

    Json(json!({ "reactions": reactions })).into_response()
}

// ────────────────────────────────────────────────────────────────────────────
// Remove Reaction from DM Message
// ────────────────────────────────────────────────────────────────────────────

pub async fn remove_reaction(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
    req: Request,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    // Parse body manually for DELETE request
    let body: serde_json::Value = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let emoji = match body["emoji"].as_str() {
        Some(e) => e,
        None => return (StatusCode::BAD_REQUEST, "Missing emoji").into_response(),
    };

    // Verify message exists and get conversation
    let conversation_id = match state.db.get_dm_message_info(&message_id.to_string()) {
        Ok(Some((_, conv))) => Uuid::parse_str(&conv).unwrap(),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Message not found").into_response();
        }
        Err(e) => {
            tracing::error!("Failed to get message info: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Get conversation users
    let (user1, user2) = match state
        .db
        .get_dm_conversation_users(&conversation_id.to_string())
    {
        Ok(Some((u1, u2))) => (u1, u2),
        _ => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Remove reaction
    if let Err(e) = state
        .db
        .remove_dm_reaction(&message_id.to_string(), &user.user_id, emoji)
    {
        tracing::error!("Failed to remove DM reaction: {e}");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Fetch updated reactions
    let reactions = state
        .db
        .get_dm_reactions(&message_id.to_string(), &user.user_id)
        .unwrap_or_default()
        .into_iter()
        .map(|r| ReactionGroup {
            emoji: r.emoji,
            count: r.count,
            me: r.me,
        })
        .collect::<Vec<_>>();

    // Broadcast update
    let ws_msg = shared::ws_messages::WsEnvelope {
        msg_type: "dm_reaction_updated".to_string(),
        payload: serde_json::to_value(&shared::ws_messages::WsDmReactionUpdated {
            message_id,
            reactions: reactions.clone(),
        })
        .unwrap(),
    };

    let ws_msg_str = serde_json::to_string(&ws_msg).unwrap();
    state.ws_state.broadcast_to_user(&user1, &ws_msg_str).await;
    state.ws_state.broadcast_to_user(&user2, &ws_msg_str).await;

    Json(json!({ "reactions": reactions })).into_response()
}
