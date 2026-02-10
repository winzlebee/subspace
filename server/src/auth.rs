use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use shared::models::{AuthRequest, AuthResponse, User};

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user_id
    pub exp: usize,
}

pub fn create_token(user_id: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = chrono_like_exp(); // 7 days from now
    let claims = Claims {
        sub: user_id.to_string(),
        exp: expiration,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn validate_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}

fn chrono_like_exp() -> usize {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;
    now + 7 * 24 * 60 * 60 // 7 days
}

// ── Handlers ─────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AuthRequest>,
) -> impl IntoResponse {
    // Check if user already exists
    if let Ok(Some(_)) = state.db.get_user_by_username(&body.username) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error": "Username already taken"}))).into_response();
    }

    let id = Uuid::new_v4();
    let password_hash = hash_password(&body.password);

    if let Err(e) = state.db.create_user(&id, &body.username, &password_hash, body.avatar_url.as_deref()) {
        tracing::error!("Failed to create user: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Internal error"}))).into_response();
    }

    let token = create_token(&id.to_string(), &state.jwt_secret).unwrap();
    let user = User {
        id,
        username: body.username,
        avatar_url: body.avatar_url,
        theme: "dark".to_string(),
        language: "en".to_string(),
        notifications_enabled: true,
        created_at: String::new(),
        updated_at: String::new(),
    };

    Json(AuthResponse { token, user }).into_response()
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AuthRequest>,
) -> impl IntoResponse {
    let user_row = match state.db.get_user_by_username(&body.username) {
        Ok(Some(u)) => u,
        _ => {
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Invalid credentials"}))).into_response();
        }
    };

    if !verify_password(&body.password, &user_row.password_hash) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Invalid credentials"}))).into_response();
    }

    let token = create_token(&user_row.id, &state.jwt_secret).unwrap();
    let user = User {
        id: Uuid::parse_str(&user_row.id).unwrap(),
        username: user_row.username,
        avatar_url: user_row.avatar_url,
        theme: user_row.theme,
        language: user_row.language,
        notifications_enabled: user_row.notifications_enabled,
        created_at: user_row.created_at,
        updated_at: user_row.updated_at,
    };

    Json(AuthResponse { token, user }).into_response()
}

// ── Password hashing (argon2) ────────────────────────────────────────────

fn hash_password(password: &str) -> String {
    use argon2::{
        password_hash::SaltString,
        Argon2, PasswordHasher,
    };
    let salt = SaltString::generate(&mut password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string()
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    let parsed = PasswordHash::new(hash).unwrap();
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

// ── Auth middleware ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AuthUser {
    pub user_id: String,
}

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = if let Some(t) = auth_header.strip_prefix("Bearer ") {
        t
    } else {
        return (StatusCode::UNAUTHORIZED, "Missing auth token").into_response();
    };

    match validate_token(token, &state.jwt_secret) {
        Ok(claims) => {
            req.extensions_mut().insert(AuthUser {
                user_id: claims.sub,
            });
            next.run(req).await
        }
        Err(_) => (StatusCode::UNAUTHORIZED, "Invalid token").into_response(),
    }
}
