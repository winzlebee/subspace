use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::{
    collections::HashMap,
    sync::Arc,
};
use tokio::sync::{broadcast, RwLock};

use crate::{auth, AppState};
use shared::ws_messages::WsEnvelope;

/// Tracks which user IDs are connected and which servers they belong to.
pub struct WsState {
    /// Maps server_id -> broadcast sender
    server_channels: RwLock<HashMap<String, broadcast::Sender<String>>>,
    /// Maps user_id -> list of server_ids they're subscribed to
    user_servers: RwLock<HashMap<String, Vec<String>>>,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            server_channels: RwLock::new(HashMap::new()),
            user_servers: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_or_create_server_channel(
        &self,
        server_id: &str,
    ) -> broadcast::Sender<String> {
        {
            let channels = self.server_channels.read().await;
            if let Some(tx) = channels.get(server_id) {
                return tx.clone();
            }
        }
        let mut channels = self.server_channels.write().await;
        let (tx, _) = broadcast::channel(256);
        channels.insert(server_id.to_string(), tx.clone());
        tx
    }

    pub async fn broadcast_to_server(&self, server_id: &str, message: &str) {
        let channels = self.server_channels.read().await;
        if let Some(tx) = channels.get(server_id) {
            let _ = tx.send(message.to_string());
        }
    }

    pub async fn subscribe_user_to_server(
        &self,
        user_id: &str,
        server_id: &str,
    ) -> broadcast::Receiver<String> {
        let tx = self.get_or_create_server_channel(server_id).await;
        let rx = tx.subscribe();

        let mut user_servers = self.user_servers.write().await;
        user_servers
            .entry(user_id.to_string())
            .or_default()
            .push(server_id.to_string());

        rx
    }

    pub async fn unsubscribe_user(&self, user_id: &str) {
        let mut user_servers = self.user_servers.write().await;
        user_servers.remove(user_id);
    }

    /// Broadcast a message to a specific user across all their subscribed servers
    pub async fn broadcast_to_user(&self, user_id: &str, message: &str) {
        let user_servers = self.user_servers.read().await;
        if let Some(server_ids) = user_servers.get(user_id) {
            let channels = self.server_channels.read().await;
            for server_id in server_ids {
                if let Some(tx) = channels.get(server_id) {
                    let _ = tx.send(message.to_string());
                }
            }
        }
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // First message must be auth
    let user_id = match receiver.next().await {
        Some(Ok(Message::Text(text))) => {
            match serde_json::from_str::<WsEnvelope>(&text) {
                Ok(env) if env.msg_type == "auth" => {
                    match serde_json::from_value::<shared::ws_messages::WsAuth>(env.payload) {
                        Ok(auth_msg) => {
                            match auth::validate_token(&auth_msg.token, &state.jwt_secret) {
                                Ok(claims) => claims.sub,
                                Err(_) => {
                                    let _ = sender
                                        .send(Message::Text(
                                            serde_json::to_string(&WsEnvelope {
                                                msg_type: "error".to_string(),
                                                payload: serde_json::to_value(
                                                    shared::ws_messages::WsError {
                                                        message: "Invalid token".to_string(),
                                                    },
                                                )
                                                .unwrap(),
                                            })
                                            .unwrap()
                                            .into(),
                                        ))
                                        .await;
                                    return;
                                }
                            }
                        }
                        Err(_) => return,
                    }
                }
                _ => return,
            }
        }
        _ => return,
    };

    tracing::info!("WebSocket authenticated: user_id={user_id}");

    // Subscribe to all servers the user is a member of
    let servers = state
        .db
        .get_servers_for_user(&user_id)
        .unwrap_or_default();

    let mut receivers = Vec::new();
    for server in &servers {
        let rx = state
            .ws_state
            .subscribe_user_to_server(&user_id, &server.id)
            .await;
        receivers.push(rx);
    }

    // Merge all server broadcast receivers into one stream
    let (merged_tx, mut merged_rx) = tokio::sync::mpsc::channel::<String>(256);

    for mut rx in receivers {
        let merged_tx = merged_tx.clone();
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(msg) => {
                        if merged_tx.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        });
    }
    drop(merged_tx); // Drop the original so channel closes when all tasks finish

    // Send auth success
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&WsEnvelope {
                msg_type: "auth_success".to_string(),
                payload: serde_json::Value::Null,
            })
            .unwrap()
            .into(),
        ))
        .await;

    let user_id_clone = user_id.clone();
    let state_clone = state.clone();

    // Spawn task to forward broadcast messages to this client
    let send_task = tokio::spawn(async move {
        while let Some(msg) = merged_rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages from client
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    handle_client_message(&text, &user_id_clone, &state_clone).await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Cleanup: leave voice if in one, unsubscribe
    if let Ok(Some(channel_id)) = state.db.leave_voice_channel(&user_id) {
        broadcast_voice_state_update(&state, &channel_id).await;
    }
    state.ws_state.unsubscribe_user(&user_id).await;
    tracing::info!("WebSocket disconnected: user_id={user_id}");
}

async fn handle_client_message(text: &str, user_id: &str, state: &Arc<AppState>) {
    let env: WsEnvelope = match serde_json::from_str(text) {
        Ok(e) => e,
        Err(_) => return,
    };

    match env.msg_type.as_str() {
        "send_message" => {
            if let Ok(msg) =
                serde_json::from_value::<shared::ws_messages::WsSendMessage>(env.payload)
            {
                let id = uuid::Uuid::new_v4();
                let channel_id = msg.channel_id.to_string();
                if let Ok(row) = state
                    .db
                    .create_message(&id, &channel_id, user_id, Some(&msg.content))
                {
                    let message = shared::models::Message {
                        id: uuid::Uuid::parse_str(&row.id).unwrap(),
                        channel_id: uuid::Uuid::parse_str(&row.channel_id).unwrap(),
                        author_id: uuid::Uuid::parse_str(&row.author_id).unwrap(),
                        content: row.content,
                        pinned: row.pinned,
                        created_at: row.created_at,
                        edited_at: row.edited_at,
                        author: Some(shared::models::UserPublic {
                            id: uuid::Uuid::parse_str(&row.author_id).unwrap(),
                            username: row.author_username,
                            avatar_url: row.author_avatar_url,
                        }),
                        attachments: vec![],
                        reactions: vec![],
                    };

                    if let Some(server_id) =
                        state.db.get_channel_server_id(&channel_id).ok().flatten()
                    {
                        let ws_msg = WsEnvelope {
                            msg_type: "message_created".to_string(),
                            payload: serde_json::to_value(
                                shared::ws_messages::WsMessageCreated { message },
                            )
                            .unwrap(),
                        };
                        state
                            .ws_state
                            .broadcast_to_server(
                                &server_id,
                                &serde_json::to_string(&ws_msg).unwrap(),
                            )
                            .await;
                    }
                }
            }
        }
        "typing" => {
            if let Ok(msg) = serde_json::from_value::<shared::ws_messages::WsTyping>(env.payload) {
                let channel_id = msg.channel_id.to_string();
                if let Some(server_id) =
                    state.db.get_channel_server_id(&channel_id).ok().flatten()
                {
                    if let Ok(Some(user_row)) = state.db.get_user_by_id(user_id) {
                        let ws_msg = WsEnvelope {
                            msg_type: "user_typing".to_string(),
                            payload: serde_json::to_value(shared::ws_messages::WsUserTyping {
                                channel_id: msg.channel_id,
                                user: shared::models::UserPublic {
                                    id: uuid::Uuid::parse_str(&user_row.id).unwrap(),
                                    username: user_row.username,
                                    avatar_url: user_row.avatar_url,
                                },
                            })
                            .unwrap(),
                        };
                        state
                            .ws_state
                            .broadcast_to_server(
                                &server_id,
                                &serde_json::to_string(&ws_msg).unwrap(),
                            )
                            .await;
                    }
                }
            }
        }
        "join_voice" => {
            if let Ok(msg) =
                serde_json::from_value::<shared::ws_messages::WsJoinVoice>(env.payload)
            {
                let channel_id = msg.channel_id.to_string();
                // Leave previous voice channel if any
                if let Ok(Some(prev_channel)) = state.db.leave_voice_channel(user_id) {
                    broadcast_voice_state_update(state, &prev_channel).await;
                }
                if state
                    .db
                    .join_voice_channel(user_id, &channel_id)
                    .is_ok()
                {
                    broadcast_voice_state_update(state, &channel_id).await;
                }
            }
        }
        "leave_voice" => {
            if let Ok(Some(channel_id)) = state.db.leave_voice_channel(user_id) {
                broadcast_voice_state_update(state, &channel_id).await;
            }
        }
        "voice_mute_deafen" => {
            if let Ok(msg) =
                serde_json::from_value::<shared::ws_messages::WsVoiceMuteDeafen>(env.payload)
            {
                if state
                    .db
                    .update_voice_state(user_id, msg.muted, msg.deafened)
                    .is_ok()
                {
                    if let Ok(Some(channel_id)) = state.db.get_user_voice_channel(user_id) {
                        broadcast_voice_state_update(state, &channel_id).await;
                    }
                }
            }
        }
        "signal_sdp" => {
            if let Ok(msg) =
                serde_json::from_value::<shared::ws_messages::WsSignalSdp>(env.payload)
            {
                // Relay to target user — for now broadcast to the voice channel
                // In production you'd have per-user channels
                if let Ok(Some(channel_id)) = state.db.get_user_voice_channel(user_id) {
                    if let Some(server_id) =
                        state.db.get_channel_server_id(&channel_id).ok().flatten()
                    {
                        let relay = WsEnvelope {
                            msg_type: "signal_sdp".to_string(),
                            payload: serde_json::to_value(
                                shared::ws_messages::WsSignalSdpRelay {
                                    from_user_id: uuid::Uuid::parse_str(user_id).unwrap(),
                                    target_user_id: msg.target_user_id,
                                    sdp: msg.sdp,
                                    sdp_type: msg.sdp_type,
                                },
                            )
                            .unwrap(),
                        };
                        state
                            .ws_state
                            .broadcast_to_server(
                                &server_id,
                                &serde_json::to_string(&relay).unwrap(),
                            )
                            .await;
                    }
                }
            }
        }
        "signal_ice" => {
            if let Ok(msg) =
                serde_json::from_value::<shared::ws_messages::WsSignalIce>(env.payload)
            {
                if let Ok(Some(channel_id)) = state.db.get_user_voice_channel(user_id) {
                    if let Some(server_id) =
                        state.db.get_channel_server_id(&channel_id).ok().flatten()
                    {
                        let relay = WsEnvelope {
                            msg_type: "signal_ice".to_string(),
                            payload: serde_json::to_value(
                                shared::ws_messages::WsSignalIceRelay {
                                    from_user_id: uuid::Uuid::parse_str(user_id).unwrap(),
                                    target_user_id: msg.target_user_id,
                                    candidate: msg.candidate,
                                    sdp_mid: msg.sdp_mid,
                                    sdp_mline_index: msg.sdp_mline_index,
                                },
                            )
                            .unwrap(),
                        };
                        state
                            .ws_state
                            .broadcast_to_server(
                                &server_id,
                                &serde_json::to_string(&relay).unwrap(),
                            )
                            .await;
                    }
                }
            }
        }
        _ => {
            tracing::warn!("Unknown WS message type: {}", env.msg_type);
        }
    }
}

async fn broadcast_voice_state_update(state: &Arc<AppState>, channel_id: &str) {
    if let Ok(states) = state.db.get_voice_states_for_channel(channel_id) {
        let voice_states: Vec<shared::models::VoiceState> = states
            .into_iter()
            .map(|vs| shared::models::VoiceState {
                user_id: uuid::Uuid::parse_str(&vs.user_id).unwrap(),
                channel_id: uuid::Uuid::parse_str(&vs.channel_id).unwrap(),
                muted: vs.muted,
                deafened: vs.deafened,
                joined_at: vs.joined_at,
                username: Some(vs.username),
                avatar_url: vs.avatar_url,
            })
            .collect();

        if let Some(server_id) = state.db.get_channel_server_id(channel_id).ok().flatten() {
            let ws_msg = WsEnvelope {
                msg_type: "voice_state_update".to_string(),
                payload: serde_json::to_value(shared::ws_messages::WsVoiceStateUpdate {
                    channel_id: uuid::Uuid::parse_str(channel_id).unwrap(),
                    voice_states,
                })
                .unwrap(),
            };
            state
                .ws_state
                .broadcast_to_server(&server_id, &serde_json::to_string(&ws_msg).unwrap())
                .await;
        }
    }
}
