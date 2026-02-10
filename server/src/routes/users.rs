use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::{auth::AuthUser, AppState};
use shared::models::{UpdateUserRequest, User};

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();
    match state.db.get_user_by_id(&user.user_id) {
        Ok(Some(row)) => {
            let user = User {
                id: Uuid::parse_str(&row.id).unwrap(),
                username: row.username,
                avatar_url: row.avatar_url,
                theme: row.theme,
                language: row.language,
                notifications_enabled: row.notifications_enabled,
                created_at: row.created_at,
                updated_at: row.updated_at,
            };
            Json(user).into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

pub async fn update_me(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let user = req.extensions().get::<AuthUser>().unwrap().clone();

    let body: UpdateUserRequest = match axum::body::to_bytes(req.into_body(), 1_000_000).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        },
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state.db.update_user(
        &user.user_id,
        body.username.as_deref(),
        body.avatar_url.as_deref(),
        body.theme.as_deref(),
        body.language.as_deref(),
        body.notifications_enabled,
    ) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => {
            tracing::error!("Failed to update user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    while let Ok(Some(field)) = multipart.next_field().await {
        let file_name = field
            .file_name()
            .unwrap_or("unknown")
            .to_string();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };

        let ext = file_name
            .rsplit('.')
            .next()
            .unwrap_or("bin");
        let stored_name = format!("{}.{}", Uuid::new_v4(), ext);
        let path = format!("{}/{}", state.upload_dir, stored_name);

        if let Err(e) = tokio::fs::write(&path, &data).await {
            tracing::error!("Failed to write file: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }

        let url = format!("/uploads/{}", stored_name);
        return Json(serde_json::json!({
            "url": url,
            "file_name": file_name,
            "mime_type": content_type,
            "size_bytes": data.len(),
        }))
        .into_response();
    }

    StatusCode::BAD_REQUEST.into_response()
}
