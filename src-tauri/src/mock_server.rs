use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, broadcast};
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockEndpoint {
    pub method: String,
    pub route: String,
    pub status_code: u16,
    pub response_body: String,
    pub delay_ms: u64,
    pub headers: HashMap<String, String>,
}

pub struct MockServerState {
    pub endpoints: Arc<Mutex<Vec<MockEndpoint>>>,
    pub shutdown_tx: Option<broadcast::Sender<()>>,
}

impl MockServerState {
    pub fn new() -> Self {
        Self {
            endpoints: Arc::new(Mutex::new(Vec::new())),
            shutdown_tx: None,
        }
    }
}

// Interceptor handler
async fn handle_mock_request(
    state: Arc<Mutex<Vec<MockEndpoint>>>,
    req: Request,
) -> Response {
    let method = req.method().as_str().to_uppercase();
    let path = req.uri().path().to_string();

    let endpoints = state.lock().await;

    // Find the first matching endpoint
    let mut matched_endpoint: Option<MockEndpoint> = None;

    for endpoint in endpoints.iter() {
        if endpoint.method.to_uppercase() != method && endpoint.method.to_uppercase() != "ALL" {
            continue;
        }

        // Extremely simple dynamic route matching supporting /:id
        if route_matches(&endpoint.route, &path) {
            matched_endpoint = Some(endpoint.clone());
            break;
        }
    }

    if let Some(endpoint) = matched_endpoint {
        if endpoint.delay_ms > 0 {
            sleep(Duration::from_millis(endpoint.delay_ms)).await;
        }

        let mut headers = HeaderMap::new();
        for (k, v) in endpoint.headers {
            if let Ok(header_name) = k.parse::<axum::http::header::HeaderName>() {
                if let Ok(header_value) = v.parse::<axum::http::header::HeaderValue>() {
                    headers.insert(header_name, header_value);
                }
            }
        }

        // Ensure JSON content type by default if not specified
        if !headers.contains_key("content-type") {
            headers.insert("content-type", "application/json".parse().unwrap());
        }

        let status = StatusCode::from_u16(endpoint.status_code).unwrap_or(StatusCode::OK);
        
        let body = match serde_json::from_str::<Value>(&endpoint.response_body) {
            Ok(json) => json.to_string(), // valid json
            Err(_) => endpoint.response_body.clone() // fallback to raw string
        };

        (status, headers, body).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            format!("Mock Node Not Found for {} {}", method, path),
        )
            .into_response()
    }
}

// Simple dynamic route matching logic
// e.g. defined route: "/api/users/:id"
// request path:  "/api/users/123"
// returns true
fn route_matches(defined_route: &str, request_path: &str) -> bool {
    let def_parts: Vec<&str> = defined_route.trim_matches('/').split('/').collect();
    let req_parts: Vec<&str> = request_path.trim_matches('/').split('/').collect();

    if def_parts.len() != req_parts.len() {
        return false;
    }

    for (def, req) in def_parts.iter().zip(req_parts.iter()) {
        if def.starts_with(':') {
            continue; // matches any dynamic param
        }
        if def != req {
            return false;
        }
    }

    true
}

#[tauri::command]
pub async fn start_mock_server(
    state: tauri::State<'_, Arc<Mutex<MockServerState>>>,
    port: u16,
    endpoints: Vec<MockEndpoint>,
) -> Result<String, String> {
    let mut server_state = state.lock().await;

    // If a server is already running, kill it first
    if let Some(tx) = &server_state.shutdown_tx {
        let _ = tx.send(());
        server_state.shutdown_tx = None;
    }

    // Update endpoints in state
    *server_state.endpoints.lock().await = endpoints;
    let endpoints_arc = server_state.endpoints.clone();

    // Create a new shutdown channel
    let (tx, mut rx) = broadcast::channel(1);
    server_state.shutdown_tx = Some(tx);

    let app = Router::new().route("/*path", any({
        let state = endpoints_arc.clone();
        move |req: Request| handle_mock_request(state.clone(), req)
    }));
    
    // Add handler for strictly root /
    let app = app.route("/", any({
         let state = endpoints_arc.clone();
         move |req: Request| handle_mock_request(state.clone(), req)
    }));

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => return Err(format!("Failed to bind to port {}: {}", port, e)),
    };

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = rx.recv().await;
            })
            .await
            .unwrap();
    });

    Ok(format!("Mock Server started on port {}", port))
}

#[tauri::command]
pub async fn stop_mock_server(
    state: tauri::State<'_, Arc<Mutex<MockServerState>>>,
) -> Result<String, String> {
    let mut server_state = state.lock().await;
    
    if let Some(tx) = &server_state.shutdown_tx {
        let _ = tx.send(());
        server_state.shutdown_tx = None;
        Ok("Mock Server stopped".to_string())
    } else {
        Ok("Server was not running".to_string())
    }
}
