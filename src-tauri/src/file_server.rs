use std::collections::HashMap;
use std::path::PathBuf;

use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Router;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileServerRoute {
    /// Ruta en la URL (ej. "/config.json", "/api/datos")
    pub path: String,
    /// Contenido a servir (texto: JSON, etc.)
    pub content: String,
    /// Content-Type (ej. "application/json")
    pub content_type: String,
}

/// Normaliza path de la URL: siempre con / al inicio, sin fragment/query.
fn normalize_url_path(path: &str) -> String {
    let path = path.split('?').next().unwrap_or(path);
    let path = path.split('#').next().unwrap_or(path);
    let path = path.trim();
    if path.is_empty() || !path.starts_with('/') {
        format!("/{}", path.trim_start_matches('/'))
    } else {
        path.to_string()
    }
}

#[derive(Clone)]
struct RouteResponse {
    content: String,
    content_type: String,
}

async fn file_server_handler(
    routes: std::sync::Arc<HashMap<String, RouteResponse>>,
    req: Request,
) -> Response {
    let path = normalize_url_path(req.uri().path());
    let resp = match routes.get(&path) {
        Some(r) => r.clone(),
        None => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not found"))
                .unwrap();
        }
    };
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", resp.content_type)
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(resp.content))
        .unwrap()
}

#[tauri::command]
pub async fn start_file_server(
    app: AppHandle,
    state: State<'_, AppState>,
    port: u16,
    routes: Vec<FileServerRoute>,
    bind_host: Option<String>,
) -> Result<(), String> {
    let mut guard = state.file_server_abort.lock().await;
    if guard.is_some() {
        return Err("File server already running".to_string());
    }
    if routes.is_empty() {
        return Err("Add at least one route (path + content)".to_string());
    }
    let mut map: HashMap<String, RouteResponse> = HashMap::new();
    for r in &routes {
        let path = normalize_url_path(&r.path);
        let ct = if r.content_type.is_empty() {
            content_type_from_path(&r.path)
        } else {
            r.content_type.clone()
        };
        map.insert(
            path,
            RouteResponse {
                content: r.content.clone(),
                content_type: ct,
            },
        );
    }
    let host = bind_host
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let bind_addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| e.to_string())?;
    let routes_arc = std::sync::Arc::new(map);
    let _ = app.emit(
        "file-server-logs",
        format!("File server listening on http://{}", bind_addr),
    );
    let handle = tokio::spawn(async move {
        let r = routes_arc.clone();
        let router = Router::new().fallback(move |req: Request| {
            let routes = r.clone();
            async move { file_server_handler(routes, req).await }
        });
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("File server error: {}", e);
        }
    });
    *guard = Some(handle);
    Ok(())
}

fn content_type_from_path(path: &str) -> String {
    let ext = path
        .rfind('.')
        .map(|i| path[i + 1..].to_lowercase())
        .unwrap_or_default();
    let ct = match ext.as_str() {
        "json" => "application/json",
        "txt" => "text/plain; charset=utf-8",
        "html" | "htm" => "text/html; charset=utf-8",
        "xml" => "application/xml",
        "csv" => "text/csv; charset=utf-8",
        "yaml" | "yml" => "application/x-yaml",
        "js" | "mjs" => "application/javascript",
        "css" => "text/css",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };
    ct.to_string()
}

#[tauri::command]
pub async fn stop_file_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.file_server_abort.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
    }
    Ok(())
}

/// Returns true if the file server task is currently running.
#[tauri::command]
pub async fn is_file_server_running(state: State<'_, AppState>) -> Result<bool, String> {
    let guard = state.file_server_abort.lock().await;
    Ok(guard.is_some())
}

// ─── Coverage HTML server ─────────────────────────────────────────────────────

async fn coverage_file_handler(base_dir: PathBuf, req: Request) -> Response {
    let url_path = req.uri().path();
    let rel = url_path.trim_start_matches('/');
    let file_path = if rel.is_empty() {
        base_dir.join("index.html")
    } else {
        base_dir.join(rel)
    };
    match tokio::fs::read(&file_path).await {
        Ok(bytes) => {
            let ct = content_type_from_path(&file_path.to_string_lossy());
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", ct)
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(bytes))
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Content-Type", "text/plain")
            .body(Body::from("Not found"))
            .unwrap(),
    }
}

/// Starts a temporary HTTP server serving `html_dir` on an OS-assigned port.
/// Returns the assigned port number.
#[tauri::command]
pub async fn start_coverage_server(
    state: State<'_, AppState>,
    html_dir: String,
) -> Result<u16, String> {
    let mut guard = state.coverage_server_abort.lock().await;
    if let Some(old) = guard.take() {
        old.abort();
    }
    let base_dir = PathBuf::from(&html_dir);
    if !base_dir.is_dir() {
        return Err(format!("Directory not found: {}", html_dir));
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let handle = tokio::spawn(async move {
        let router = Router::new().fallback(move |req: Request| {
            let dir = base_dir.clone();
            async move { coverage_file_handler(dir, req).await }
        });
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("Coverage server error: {}", e);
        }
    });
    *guard = Some(handle);
    Ok(port)
}

#[tauri::command]
pub async fn stop_coverage_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.coverage_server_abort.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
    }
    Ok(())
}

