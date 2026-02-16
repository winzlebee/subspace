use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::{auth::AuthUser, AppState};
use shared::models::{CreateServerRequest, Server, ServerMember};

pub async fn list_servers(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    match state.db.get_servers_for_user(&user.user_id) {
        Ok(rows) => {
            let servers: Vec<Server> = rows
                .into_iter()
                .map(|r| Server {
                    id: Uuid::parse_str(&r.id).unwrap(),
                    name: r.name,
                    icon_url: r.icon_url,
                    owner_id: Uuid::parse_str(&r.owner_id).unwrap(),
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
                .collect();
            Json(servers).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to list servers: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create_server(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    let body: CreateServerRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let id = Uuid::new_v4();
    match state
        .db
        .create_server(&id, &body.name, body.icon_url.as_deref(), &user.user_id)
    {
        Ok(()) => {
            let server = Server {
                id,
                name: body.name,
                icon_url: body.icon_url,
                owner_id: Uuid::parse_str(&user.user_id).unwrap(),
                created_at: String::new(),
                updated_at: String::new(),
            };
            (StatusCode::CREATED, Json(server)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create server: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_server(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_server_by_id(&server_id) {
        Ok(Some(r)) => {
            let server = Server {
                id: Uuid::parse_str(&r.id).unwrap(),
                name: r.name,
                icon_url: r.icon_url,
                owner_id: Uuid::parse_str(&r.owner_id).unwrap(),
                created_at: r.created_at,
                updated_at: r.updated_at,
            };
            Json(server).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to get server: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn join_server(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    match state.db.join_server(&user.user_id, &server_id) {
        Ok(()) => {

            let joined_at_secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                .to_string();

            let user_row = match state.db.get_user_by_id(&user.user_id) {
                Ok(Some(row)) => row,
                _ => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };

            let status = state.db.get_user_status(&user.user_id).ok().flatten().map(|s| shared::models::UserStatus {
                user_id: Uuid::parse_str(&s.user_id).unwrap(),
                status: s.status,
                custom_text: s.custom_text,
                activity_type: s.activity_type,
                activity_name: s.activity_name,
                last_seen: s.last_seen,
                updated_at: s.updated_at,
            });

            let member = shared::models::ServerMember {
                user_id: Uuid::parse_str(&user.user_id).unwrap(),
                server_id: Uuid::parse_str(&server_id).unwrap(),
                role: "member".to_string(),
                joined_at: joined_at_secs,
                username: user_row.username.clone(),
                avatar_url: user_row.avatar_url.clone(),
                status,
            };

            let ws_msg = shared::ws_messages::WsEnvelope {
                msg_type: "member_joined".to_string(),
                payload: serde_json::to_value(shared::ws_messages::WsMemberJoined {
                    server_id: Uuid::parse_str(&server_id).unwrap(),
                    member,
                })
                .unwrap(),
            };
            state
                .ws_state
                .broadcast_to_server(&server_id, &serde_json::to_string(&ws_msg).unwrap())
                .await;

            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => {
            tracing::error!("Failed to join server: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn leave_server(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    match state.db.leave_server(&user.user_id, &server_id) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => {
            tracing::error!("Failed to leave server: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_members(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_server_members(&server_id) {
        Ok(rows) => {
            // Get user IDs for status lookup
            let user_ids: Vec<String> = rows.iter().map(|r| r.user_id.clone()).collect();
            let statuses = state.db.get_user_statuses(&user_ids).unwrap_or_default();
            let status_map: std::collections::HashMap<String, _> = statuses
                .into_iter()
                .map(|s| (s.user_id.clone(), s))
                .collect();

            let members: Vec<ServerMember> = rows
                .into_iter()
                .map(|r| {
                    let status = status_map.get(&r.user_id).map(|s| shared::models::UserStatus {
                        user_id: Uuid::parse_str(&s.user_id).unwrap(),
                        status: s.status.clone(),
                        custom_text: s.custom_text.clone(),
                        activity_type: s.activity_type.clone(),
                        activity_name: s.activity_name.clone(),
                        last_seen: s.last_seen.clone(),
                        updated_at: s.updated_at.clone(),
                    });

                    ServerMember {
                        user_id: Uuid::parse_str(&r.user_id).unwrap(),
                        server_id: Uuid::parse_str(&r.server_id).unwrap(),
                        role: r.role,
                        joined_at: r.joined_at,
                        username: r.username,
                        avatar_url: r.avatar_url,
                        status,
                    }
                })
                .collect();
            Json(members).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get members: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
