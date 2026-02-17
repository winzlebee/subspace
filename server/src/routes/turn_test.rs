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
                        println!("[TURN Test] Received offer, sending answer");
                        
                        // For a simple test, we just need to acknowledge receipt
                        // The client will timeout if it doesn't get candidates back
                        // Since we're just testing TURN candidate generation, not actual connection,
                        // we can send back a minimal response
                        
                        // Extract the SDP from the offer
                        if let Some(sdp_obj) = data.get("sdp") {
                            // Send back the same SDP as an answer
                            // This won't establish a real connection but allows ICE gathering
                            let response = serde_json::json!({
                                "type": "answer",
                                "sdp": sdp_obj
                            });
                            
                            if let Ok(response_text) = serde_json::to_string(&response) {
                                if socket.send(Message::Text(response_text.into())).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Some("ice") => {
                        // Received an ICE candidate
                        // For testing purposes, we don't need to do anything with these
                        // The client is just verifying it can generate relay candidates
                        println!("[TURN Test] Received ICE candidate: {}", 
                            data.get("candidate")
                                .and_then(|c| c.get("candidate"))
                                .and_then(|c| c.as_str())
                                .unwrap_or("unknown"));
                        
                        // Don't echo ICE candidates back - this prevents confusion
                        // The test is about generating candidates, not establishing connection
                    }
                    _ => {
                        println!("[TURN Test] Unknown message type: {:?}", msg_type);
                    }
                }
            }
        }
    }

    println!("[TURN Test] Client disconnected");
}
