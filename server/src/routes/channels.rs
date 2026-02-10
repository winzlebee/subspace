use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::{auth::AuthUser, AppState};
use shared::models::{Channel, CreateChannelRequest};

pub async fn list_channels(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_channels_for_server(&server_id) {
        Ok(rows) => {
            let channels: Vec<Channel> = rows
                .into_iter()
                .map(|r| Channel {
                    id: Uuid::parse_str(&r.id).unwrap(),
                    server_id: Uuid::parse_str(&r.server_id).unwrap(),
                    name: r.name,
                    channel_type: r.channel_type,
                    position: r.position,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
                .collect();
            Json(channels).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to list channels: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create_channel(
    State(state): State<Arc<AppState>>,
    Path(server_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let _user = req.extensions().get::<AuthUser>().unwrap().clone();

    let body: CreateChannelRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let id = Uuid::new_v4();
    match state
        .db
        .create_channel(&id, &server_id, &body.name, &body.channel_type)
    {
        Ok(()) => {
            let channel = Channel {
                id,
                server_id: Uuid::parse_str(&server_id).unwrap(),
                name: body.name,
                channel_type: body.channel_type,
                position: 0,
                created_at: String::new(),
                updated_at: String::new(),
            };
            (StatusCode::CREATED, Json(channel)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create channel: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_channel(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> impl IntoResponse {
    match state.db.delete_channel(&channel_id) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!("Failed to delete channel: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
