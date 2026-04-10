use std::collections::HashMap;
use std::path::PathBuf;

use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Router;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::state::{AppState, ServerHandle};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileServerRoute {
    pub path: String,
    pub content: String,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileServerConfig {
    pub port: u16,
    pub routes: Vec<FileServerRoute>,
    pub bind_host: Option<String>,
    pub base_directory: Option<String>,
}

#[derive(Clone)]
struct RouteResponse {
    content: String,
    content_type: String,
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

async fn directory_listing_handler(dir_path: PathBuf, url_path: String) -> Response {
    let mut html = format!("<html><head><title>Index of {}</title>", url_path);
    html.push_str("<style>body{background:#020617;color:#94a3b8;font-family:sans-serif;padding:2rem;}a{color:#38bdf8;text-decoration:none;}a:hover{text-decoration:underline;}ul{list-style:none;padding:0;}li{padding:0.5rem 0;border-bottom:1px solid #1e293b; display:flex; gap: 1rem;}</style></head><body>");
    html.push_str(&format!("<h1>Index of {}</h1><hr><ul>", url_path));
    html.push_str("<li><a href=\"..\">.. (Parent Directory)</a></li>");

    if let Ok(entries) = std::fs::read_dir(&dir_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.path().is_dir();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let size_str = if is_dir { "-".to_string() } else { format!("{} B", size) };
            let icon = if is_dir { "📁" } else { "📄" };
            html.push_str(&format!("<li><span>{}</span> <a href=\"{}{}\">{}{}</a> <span style=\"margin-left:auto; opacity:0.5; font-family:monospace;\">{}</span></li>", 
                icon, if url_path.ends_with('/') { "" } else { "/" }, name, name, if is_dir { "/" } else { "" }, size_str));
        }
    }

    html.push_str("</ul><hr><p style=\"opacity:0.3; font-size:0.8rem;\">Served by Microtermix File Server</p></body></html>");

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(html))
        .unwrap()
}

async fn file_server_handler(
    routes: std::sync::Arc<HashMap<String, RouteResponse>>,
    base_dir: Option<PathBuf>,
    req: Request,
) -> Response {
    // 0. Handle CORS Preflight (OPTIONS)
    if req.method() == axum::http::Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
            .header("Access-Control-Allow-Headers", "*")
            .header("Access-Control-Max-Age", "86400")
            .body(Body::empty())
            .unwrap();
    }

    let url_path = normalize_url_path(req.uri().path());
    
    // 1. Try virtual routes first
    if let Some(resp) = routes.get(&url_path) {
        return Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", &resp.content_type)
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from(resp.content.clone()))
            .unwrap();
    }

    // 2. Try physical directory if configured
    if let Some(dir) = base_dir {
        let rel = url_path.trim_start_matches('/');
        let mut full_path = dir.join(rel);

        // If it's a directory, look for index.html
        if full_path.is_dir() {
            let index_path = full_path.join("index.html");
            if index_path.exists() {
                full_path = index_path;
            } else {
                return directory_listing_handler(full_path, url_path).await;
            }
        }

        if full_path.exists() && full_path.is_file() {
            if let Ok(bytes) = tokio::fs::read(&full_path).await {
                let ct = content_type_from_path(&full_path.to_string_lossy());
                return Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", ct)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Body::from(bytes))
                    .unwrap();
            }
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(format!("404 Not Found: {}", url_path)))
        .unwrap()
}

#[tauri::command]
pub async fn start_file_server(
    app: AppHandle,
    state: State<'_, AppState>,
    config: FileServerConfig,
) -> Result<(), String> {
    let mut guard = state.file_server_abort.lock().await;
    if guard.is_some() {
        return Err("File server already running".to_string());
    }

    let mut map: HashMap<String, RouteResponse> = HashMap::new();
    for r in &config.routes {
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

    let host = config.bind_host
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let bind_addr = format!("{}:{}", host, config.port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| e.to_string())?;

    let routes_arc = std::sync::Arc::new(map);
    let base_dir = config.base_directory.map(PathBuf::from);
    let app_log = app.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let join = tokio::spawn(async move {
        let r = routes_arc.clone();
        let d = base_dir.clone();
        let app_for_router = app_log.clone();
        
        let router = Router::new().fallback(move |req: Request| {
            let routes = r.clone();
            let dir = d.clone();
            let app_inner = app_for_router.clone();
            async move { 
                let path = req.uri().path().to_string();
                let method = req.method().to_string();
                let res = file_server_handler(routes, dir, req).await;
                let _ = app_inner.emit("file-server-logs", format!("[{}] {} -> {}", method, path, res.status()));
                res
            }
        });

        let _ = app_log.emit("file-server-logs", format!("▶ Servidor iniciado en http://{}", bind_addr));
        
        let shutdown = async { let _ = shutdown_rx.await; };
        if let Err(e) = axum::serve(listener, router).with_graceful_shutdown(shutdown).await {
            eprintln!("File server error: {}", e);
        }
    });

    *guard = Some(ServerHandle { shutdown_tx, join });
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
    if let Some(h) = guard.take() {
        let _ = h.shutdown_tx.send(());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), h.join).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_file_server_running(state: State<'_, AppState>) -> Result<bool, String> {
    let mut guard = state.file_server_abort.lock().await;
    if let Some(h) = guard.as_ref() {
        if h.join.is_finished() {
            *guard = None;
        }
    }
    Ok(guard.is_some())
}

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

#[tauri::command]
pub async fn start_coverage_server(
    state: State<'_, AppState>,
    html_dir: String,
) -> Result<u16, String> {
    let mut guard = state.coverage_server_abort.lock().await;
    if let Some(old) = guard.take() {
        let _ = old.shutdown_tx.send(());
        old.join.abort();
    }
    let base_dir = PathBuf::from(&html_dir);
    if !base_dir.is_dir() {
        return Err(format!("Directory not found: {}", html_dir));
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let join = tokio::spawn(async move {
        let router = Router::new().fallback(move |req: Request| {
            let dir = base_dir.clone();
            async move { coverage_file_handler(dir, req).await }
        });
        let shutdown = async { let _ = shutdown_rx.await; };
        if let Err(e) = axum::serve(listener, router).with_graceful_shutdown(shutdown).await {
            eprintln!("Coverage server error: {}", e);
        }
    });
    *guard = Some(ServerHandle { shutdown_tx, join });
    Ok(port)
}

#[tauri::command]
pub async fn stop_coverage_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.coverage_server_abort.lock().await;
    if let Some(h) = guard.take() {
        let _ = h.shutdown_tx.send(());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), h.join).await;
    }
    Ok(())
}
