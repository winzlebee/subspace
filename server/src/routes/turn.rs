use axum::{Json, extract::State};
use crate::AppState;
use std::sync::Arc;
use serde::Serialize;

#[derive(Serialize)]
pub struct TurnConfig {
    pub uris: Vec<String>,
    pub username: String,
    pub credential: String,
}

pub async fn get_turn_credentials(
    State(_state): State<Arc<AppState>>,
) -> Json<TurnConfig> {
    let password = std::env::var("TURN_PASSWORD").expect("TURN_PASSSWORD must be set");
    
    let uris = match std::env::var("TURN_URL") {
        Ok(url) => vec![url], 
        Err(_) => vec![],
    };

    Json(TurnConfig {
        uris,
        username: format!("subspace:{}", password),
        credential: password,
    })
}
