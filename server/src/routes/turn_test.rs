use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
    routing::get,
    Router,
};
use std::sync::Arc;
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/api/turn-test", get(turn_test_handler))
}

async fn turn_test_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_turn_test_socket)
}

async fn handle_turn_test_socket(mut socket: WebSocket) {
    println!("[TURN Test] Client connected");

    // Simple echo server for WebRTC signaling
    // This acts as a remote peer for testing TURN connectivity
    while let Some(Ok(msg)) = socket.recv().await {
        if let Message::Text(text) = msg {
            println!("[TURN Test] Received message: {}", text);
            
            // Parse the message to handle WebRTC signaling
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                let msg_type = data.get("type").and_then(|v| v.as_str());
                
                match msg_type {
                    Some("offer") => {
                        // Received an offer, send back an answer
                        // In a real implementation, we'd create a peer connection
                        // For testing purposes, we'll just echo back a simple response
                        println!("[TURN Test] Received offer, sending answer");
                        
                        // Echo the offer back as an answer for now
                        // This is a simplified test - in production you'd want actual WebRTC handling
                        let response = serde_json::json!({
                            "type": "answer",
                            "sdp": data.get("sdp")
                        });
                        
                        if let Ok(response_text) = serde_json::to_string(&response) {
                            if socket.send(Message::Text(response_text.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Some("ice") => {
                        // Received an ICE candidate, echo it back
                        println!("[TURN Test] Received ICE candidate");
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    _ => {
                        // Unknown message type, just echo it
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }

    println!("[TURN Test] Client disconnected");
}
