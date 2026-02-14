mod auth;
mod db;
mod routes;
mod ws;

use std::sync::Arc;
use axum::Router;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

pub struct AppState {
    pub db: db::Database,
    pub jwt_secret: String,
    pub ws_state: ws::WsState,
    pub upload_dir: String,
}

#[tokio::main]
async fn main() {
    // Initialise tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    // Initialise database
    let db = db::Database::new("subspace.db").expect("Failed to initialise database");
    db.run_migrations().expect("Failed to run migrations");

    // Ensure uploads directory exists
    let upload_dir = "uploads".to_string();
    std::fs::create_dir_all(&upload_dir).expect("Failed to create uploads directory");

    let state = Arc::new(AppState {
        db,
        jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into()),
        ws_state: ws::WsState::new(),
        upload_dir,
    });

    let app = Router::new()
        .nest("/api", routes::api_routes(state.clone()))
        .route("/ws", axum::routing::get(ws::ws_handler))
        .nest_service("/uploads", tower_http::services::ServeDir::new(&state.upload_dir))
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers([
                    axum::http::header::AUTHORIZATION,
                    axum::http::header::CONTENT_TYPE,
                ]),
        )
        .with_state(state);

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".into());
    tracing::info!("Subspace server listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
