use axum::{routing::get, Json, extract::State};
use crate::AppState;
use std::sync::Arc;
use serde::Serialize;

#[derive(Serialize)]
pub struct TurnConfig {
    pub username: String,
    pub credential: String,
}

pub async fn get_turn_credentials(
    State(_state): State<Arc<AppState>>,
) -> Json<TurnConfig> {
    let password = std::env::var("TURN_PASSWORD").unwrap_or_else(|_| "password".to_string());
    Json(TurnConfig {
        username: format!("subspace:{}", password),
        credential: password,
    })
}
