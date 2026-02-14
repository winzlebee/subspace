use axum::{Json, extract::State};
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
    let password = std::env::var("TURN_PASSWORD").expect("TURN_PASSWORD must be set");
    Json(TurnConfig {
        username: format!("subspace:{}", password),
        credential: password,
    })
}
