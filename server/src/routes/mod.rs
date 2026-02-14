pub mod channels;
pub mod messages;
pub mod servers;
pub mod users;
pub mod turn;

use std::sync::Arc;
use axum::{
    Router,
    extract::State,
    http::Request,
    middleware::{self, Next},
    response::Response,
};
use crate::{auth, AppState};

async fn require_auth(
    State(state): State<Arc<AppState>>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    auth::auth_middleware(State(state), req, next).await
}

pub fn api_routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new()
        .route("/register", axum::routing::post(auth::register))
        .route("/login", axum::routing::post(auth::login));

    let protected = Router::new()
        .route("/me", axum::routing::get(users::get_me))
        .route("/me", axum::routing::patch(users::update_me))
        .route("/servers", axum::routing::get(servers::list_servers))
        .route("/servers", axum::routing::post(servers::create_server))
        .route("/servers/{server_id}", axum::routing::get(servers::get_server))
        .route("/servers/{server_id}/join", axum::routing::post(servers::join_server))
        .route("/servers/{server_id}/leave", axum::routing::post(servers::leave_server))
        .route("/servers/{server_id}/members", axum::routing::get(servers::get_members))
        .route("/servers/{server_id}/channels", axum::routing::get(channels::list_channels))
        .route("/servers/{server_id}/channels", axum::routing::post(channels::create_channel))
        .route("/channels/{channel_id}", axum::routing::delete(channels::delete_channel))
        .route("/channels/{channel_id}/messages", axum::routing::get(messages::get_messages))
        .route("/channels/{channel_id}/pins", axum::routing::get(messages::get_pinned_messages))
        .route("/channels/{channel_id}/messages", axum::routing::post(messages::create_message))
        .route("/messages/{message_id}", axum::routing::patch(messages::edit_message))
        .route("/messages/{message_id}", axum::routing::delete(messages::delete_message))
        .route("/messages/{message_id}/pin", axum::routing::post(messages::pin_message))
        .route("/messages/{message_id}/pin", axum::routing::delete(messages::unpin_message))
        .route("/messages/{message_id}/reactions", axum::routing::post(messages::add_reaction))
        .route("/messages/{message_id}/reactions", axum::routing::delete(messages::remove_reaction))
        .route("/upload", axum::routing::post(users::upload_file))
        .route("/turn", axum::routing::get(turn::get_turn_credentials))
        .layer(middleware::from_fn_with_state(state, require_auth));

    public.merge(protected)
}
