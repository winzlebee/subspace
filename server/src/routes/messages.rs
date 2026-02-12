use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{auth::AuthUser, AppState};
use shared::models::{Attachment, CreateMessageRequest, Message, ReactionGroup, UserPublic};

#[derive(Deserialize)]
pub struct MessageQuery {
    pub limit: Option<i32>,
    pub before: Option<String>,
}

pub async fn get_messages(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    Query(query): Query<MessageQuery>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    let limit = query.limit.unwrap_or(50).min(100);

    match state
        .db
        .get_messages(&channel_id, limit, query.before.as_deref())
    {
        Ok(rows) => {
            let mut messages: Vec<Message> = rows
                .into_iter()
                .map(|r| {
                    // Get attachments for this message
                    let attachments = state
                        .db
                        .get_attachments_for_message(&r.id)
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

                    // Get reactions for this message
                    let reactions = state
                        .db
                        .get_reactions_for_message(&r.id, &user.user_id)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|rg| ReactionGroup {
                            emoji: rg.emoji,
                            count: rg.count,
                            me: rg.me,
                        })
                        .collect();

                    Message {
                        id: Uuid::parse_str(&r.id).unwrap(),
                        channel_id: Uuid::parse_str(&r.channel_id).unwrap(),
                        author_id: Uuid::parse_str(&r.author_id).unwrap(),
                        content: r.content,
                        pinned: r.pinned,
                        created_at: r.created_at,
                        edited_at: r.edited_at,
                        author: Some(UserPublic {
                            id: Uuid::parse_str(&r.author_id).unwrap(),
                            username: r.author_username,
                            avatar_url: r.author_avatar_url,
                        }),
                        attachments,
                        reactions,
                    }
                })
                .collect();

            // Reverse so oldest first
            messages.reverse();

            Json(messages).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get messages: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_pinned_messages(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    match state.db.get_pinned_messages(&channel_id) {
        Ok(rows) => {
             let messages: Vec<Message> = rows
                .into_iter()
                .map(|r| {
                     // Get attachments for this message
                    let attachments = state
                        .db
                        .get_attachments_for_message(&r.id)
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

                    // Get reactions for this message
                    let reactions = state
                        .db
                        .get_reactions_for_message(&r.id, &user.user_id)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|rg| ReactionGroup {
                            emoji: rg.emoji,
                            count: rg.count,
                            me: rg.me,
                        })
                        .collect();

                    Message {
                        id: Uuid::parse_str(&r.id).unwrap(),
                        channel_id: Uuid::parse_str(&r.channel_id).unwrap(),
                        author_id: Uuid::parse_str(&r.author_id).unwrap(),
                        content: r.content,
                        pinned: r.pinned,
                        created_at: r.created_at,
                        edited_at: r.edited_at,
                        author: Some(UserPublic {
                            id: Uuid::parse_str(&r.author_id).unwrap(),
                            username: r.author_username,
                            avatar_url: r.author_avatar_url,
                        }),
                        attachments,
                        reactions,
                    }
                })
                .collect();
            // No reverse needed as we order by created_at DESC in query and probably want recent first?
            // Actually usually pinned messages are shown in a list, order matters less or we want recent?
            // Let's keep DESC (newest first).
            Json(messages).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get pinned messages: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create_message(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    let body: CreateMessageRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let id = Uuid::new_v4();
    match state
        .db
        .create_message(&id, &channel_id, &user.user_id, body.content.as_deref())
    {
        Ok(row) => {
            let message = Message {
                id: Uuid::parse_str(&row.id).unwrap(),
                channel_id: Uuid::parse_str(&row.channel_id).unwrap(),
                author_id: Uuid::parse_str(&row.author_id).unwrap(),
                content: row.content,
                pinned: row.pinned,
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
            if let Some(server_id) = state.db.get_channel_server_id(&channel_id).ok().flatten() {
                let ws_msg = shared::ws_messages::WsEnvelope {
                    msg_type: "message_created".to_string(),
                    payload: serde_json::to_value(&shared::ws_messages::WsMessageCreated {
                        message: message.clone(),
                    })
                    .unwrap(),
                };
                state
                    .ws_state
                    .broadcast_to_server(&server_id, &serde_json::to_string(&ws_msg).unwrap())
                    .await;
            }

            (StatusCode::CREATED, Json(message)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct EditMessageBody {
    pub content: String,
}

pub async fn edit_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
    Json(body): Json<EditMessageBody>,
) -> impl IntoResponse {
    // Get channel_id and server_id for broadcasting
    let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state.db.edit_message(&message_id, &body.content) {
        Ok(()) => {
            if let Some(sid) = server_id {
                let edited_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
                    .to_string();

                let ws_msg = shared::ws_messages::WsEnvelope {
                    msg_type: "message_updated".to_string(),
                    payload: serde_json::to_value(&shared::ws_messages::WsMessageUpdated {
                        message_id: Uuid::parse_str(&message_id).unwrap(),
                        content: Some(body.content),
                        edited_at: Some(edited_at),
                        pinned: None,
                    })
                    .unwrap(),
                };
                let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
            }
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to edit message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
) -> impl IntoResponse {
    // Get channel_id before deleting
    let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state.db.delete_message(&message_id) {
        Ok(()) => {
            if let Some(sid) = server_id {
                let ws_msg = shared::ws_messages::WsEnvelope {
                    msg_type: "message_deleted".to_string(),
                    payload: serde_json::to_value(&shared::ws_messages::WsMessageDeleted {
                        message_id: Uuid::parse_str(&message_id).unwrap(),
                        channel_id: Uuid::parse_str(&channel_id.unwrap()).unwrap(),
                    })
                    .unwrap(),
                };
                let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to delete message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn pin_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
) -> impl IntoResponse {
    let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state.db.pin_message(&message_id, true) {
        Ok(()) => {
            if let Some(sid) = server_id {
                 let ws_msg = shared::ws_messages::WsEnvelope {
                    msg_type: "message_updated".to_string(),
                    payload: serde_json::to_value(&shared::ws_messages::WsMessageUpdated {
                        message_id: Uuid::parse_str(&message_id).unwrap(),
                        content: None,
                        edited_at: None,
                        pinned: Some(true),
                    })
                    .unwrap(),
                };
                let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
            }
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to pin message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn unpin_message(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
) -> impl IntoResponse {
    let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state.db.pin_message(&message_id, false) {
        Ok(()) => {
             if let Some(sid) = server_id {
                 let ws_msg = shared::ws_messages::WsEnvelope {
                    msg_type: "message_updated".to_string(),
                    payload: serde_json::to_value(&shared::ws_messages::WsMessageUpdated {
                        message_id: Uuid::parse_str(&message_id).unwrap(),
                        content: None,
                        edited_at: None,
                        pinned: Some(false),
                    })
                    .unwrap(),
                };
                let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
            }
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to unpin message: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct ReactionBody {
    pub emoji: String,
}

pub async fn add_reaction(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    // Parse body first
    let body: ReactionBody = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    // Get context for broadcasting
    let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state
        .db
        .add_reaction(&message_id, &user.user_id, &body.emoji)
    {
        Ok(()) => {
            if let Some(sid) = server_id {
                // Fetch updated reactions
                if let Ok(reactions) = state.db.get_reactions_for_message(&message_id, &user.user_id) {
                     let ws_msg = shared::ws_messages::WsEnvelope {
                        msg_type: "reaction_updated".to_string(),
                        payload: serde_json::to_value(&shared::ws_messages::WsReactionUpdated {
                            message_id: Uuid::parse_str(&message_id).unwrap(),
                            reactions: reactions.into_iter().map(|r| shared::models::ReactionGroup {
                                emoji: r.emoji,
                                count: r.count,
                                me: r.me,
                            }).collect(),
                        })
                        .unwrap(),
                    };
                    let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
                }
            }
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to add reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn remove_reaction(
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    let body: ReactionBody = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

     let channel_id = state.db.get_message_channel(&message_id).ok().flatten();
    let server_id = if let Some(cid) = &channel_id {
        state.db.get_channel_server_id(cid).ok().flatten()
    } else {
        None
    };

    match state
        .db
        .remove_reaction(&message_id, &user.user_id, &body.emoji)
    {
        Ok(()) => {
            if let Some(sid) = server_id {
                 // Fetch updated reactions
                if let Ok(reactions) = state.db.get_reactions_for_message(&message_id, &user.user_id) {
                     let ws_msg = shared::ws_messages::WsEnvelope {
                        msg_type: "reaction_updated".to_string(),
                        payload: serde_json::to_value(&shared::ws_messages::WsReactionUpdated {
                            message_id: Uuid::parse_str(&message_id).unwrap(),
                            reactions: reactions.into_iter().map(|r| shared::models::ReactionGroup {
                                emoji: r.emoji,
                                count: r.count,
                                me: r.me,
                            }).collect(),
                        })
                        .unwrap(),
                    };
                    let _ = state.ws_state.broadcast_to_server(&sid, &serde_json::to_string(&ws_msg).unwrap()).await;
                }
            }
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to remove reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
