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
        Ok(()) => StatusCode::OK.into_response(),
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
            let members: Vec<ServerMember> = rows
                .into_iter()
                .map(|r| ServerMember {
                    user_id: Uuid::parse_str(&r.user_id).unwrap(),
                    server_id: Uuid::parse_str(&r.server_id).unwrap(),
                    role: r.role,
                    joined_at: r.joined_at,
                    username: r.username,
                    avatar_url: r.avatar_url,
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
