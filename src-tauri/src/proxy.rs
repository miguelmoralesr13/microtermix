use std::collections::HashMap;
use std::fs;
use std::path::Path;

use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Router;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::state::{AppState, ServerHandle};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyCandidate {
    pub project_path: String,
    pub display_name: String,
    pub port: u16,
    pub preview_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyRoute {
    pub path_prefix: String,
    pub target_url: String,
}

fn parse_vite_port(content: &str) -> (Option<u16>, Option<u16>) {
    let mut port = None;
    let mut preview_port = None;
    for cap in regex::Regex::new(r"port:\s*(\d+)")
        .unwrap()
        .captures_iter(content)
    {
        let p: u16 = cap[1].parse().unwrap_or(0);
        if p != 0 {
            port = Some(p);
        }
    }
    if let Some(cap) = regex::Regex::new(r"preview:\s*\{\s*port:\s*(\d+)")
        .unwrap()
        .captures(content)
    {
        preview_port = cap[1].parse().ok();
    }
    (port, preview_port)
}

const VITE_CONFIG_NAMES: [&str; 3] = ["vite.config.js", "vite.config.ts", "vite.config.mjs"];

pub fn find_vite_config(project_path: &Path) -> Option<std::path::PathBuf> {
    VITE_CONFIG_NAMES
        .iter()
        .map(|n| project_path.join(n))
        .find(|p| p.exists())
}

#[tauri::command]
pub fn has_vite_config(project_path: String) -> Result<bool, String> {
    let path = Path::new(&project_path);
    Ok(path.is_dir() && find_vite_config(path).is_some())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViteRemoteEntry {
    pub name: String,
    pub default_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViteFederationInfo {
    pub federation_name: String,
    pub remotes: Vec<ViteRemoteEntry>,
}

fn parse_vite_federation_from_content(content: &str) -> ViteFederationInfo {
    let mut federation_name = String::new();
    let mut remotes = Vec::new();

    if let Some(fed_start) = content.find("federation(") {
        let after_fed = &content[fed_start..];
        if let Some(name_cap) = regex::Regex::new(r#"name:\s*["']([^"']+)["']"#)
            .unwrap()
            .captures(after_fed)
        {
            federation_name = name_cap[1].to_string();
        }
    }

    let getpath_re =
        regex::Regex::new(r#"getPath\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)"#).unwrap();
    let getpathbo_re =
        regex::Regex::new(r#"getPathBO\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)"#).unwrap();

    for cap in getpath_re.captures_iter(content) {
        let name = cap[1].to_string();
        let port: u16 = cap[2].parse().unwrap_or(0);
        let default_url = format!("http://localhost:{}/{}/assets/remoteEntry.js", port, name);
        if !remotes.iter().any(|r: &ViteRemoteEntry| r.name == name) {
            remotes.push(ViteRemoteEntry {
                name: name.clone(),
                default_url,
            });
        }
    }
    for cap in getpathbo_re.captures_iter(content) {
        let name = cap[1].to_string();
        let port: u16 = cap[2].parse().unwrap_or(0);
        let default_url = format!("http://localhost:{}/{}/assets/remoteEntry.js", port, name);
        if !remotes.iter().any(|r: &ViteRemoteEntry| r.name == name) {
            remotes.push(ViteRemoteEntry {
                name: name.clone(),
                default_url,
            });
        }
    }

    ViteFederationInfo {
        federation_name,
        remotes,
    }
}

#[tauri::command]
pub fn parse_vite_federation(project_path: String) -> Result<ViteFederationInfo, String> {
    let path = Path::new(&project_path);
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    let config_path = find_vite_config(path).ok_or("No vite config found".to_string())?;
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    Ok(parse_vite_federation_from_content(&content))
}

#[tauri::command]
pub fn get_proxy_candidates(workspace_path: String) -> Result<Vec<ProxyCandidate>, String> {
    let root = Path::new(&workspace_path);
    if !root.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }
    let vite_names = ["vite.config.js", "vite.config.ts", "vite.config.mjs"];
    let mut candidates = Vec::new();
    let entries = fs::read_dir(root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let config_path = vite_names.iter().map(|n| path.join(n)).find(|p| p.exists());
        let config_path = match config_path {
            Some(p) => p,
            None => continue,
        };
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        let (port, preview_port) = parse_vite_port(&content);
        let port = port.unwrap_or(5173);
        let display_name = path
            .join("package.json")
            .exists()
            .then(|| {
                fs::read_to_string(path.join("package.json"))
                    .ok()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|j| j.get("name").and_then(|n| n.as_str()).map(String::from))
            })
            .flatten()
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        candidates.push(ProxyCandidate {
            project_path: path.to_string_lossy().to_string(),
            display_name,
            port,
            preview_port,
        });
    }
    Ok(candidates)
}

/// Genera un wrapper del vite.config que solo reemplaza las URLs de los remotes (getPath/getPathBO).
/// El resto del config es idéntico al original; por tanto build y comportamiento deberían ser los mismos,
/// solo cambia desde dónde se cargan los remotes (MFE) en runtime.
pub fn generate_vite_wrapper(
    project_path: &Path,
    remotes: &HashMap<String, String>,
) -> Result<String, String> {
    let config_path = find_vite_config(project_path).ok_or("No vite config found".to_string())?;
    let ext = config_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mjs");
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut out = content.clone();
    for (name, url) in remotes {
        let escaped_name = regex::escape(name);
        let getpath_pat = format!(r#"getPath\s*\(\s*["']{}["']\s*,\s*[^)]+\)"#, escaped_name);
        let getpathbo_pat = format!(
            r#"getPathBO\s*\(\s*["']{}["']\s*,\s*\d+\s*\)"#,
            escaped_name
        );
        let getpathbo_multiline = format!(
            r#"getPathBO\s*\(\s*["']{}["']\s*,\s*\d+\s*(?:,\s*)?\)"#,
            escaped_name
        );
        let url_escaped = url.replace('\\', "\\\\").replace('"', "\\\"");
        let replacement = format!("\"{}\"", url_escaped);
        if let Ok(re) = regex::Regex::new(&getpath_pat) {
            out = re.replace_all(&out, replacement.as_str()).to_string();
        }
        if let Ok(re) = regex::Regex::new(&getpathbo_pat) {
            out = re.replace_all(&out, replacement.as_str()).to_string();
        }
        if let Ok(re) = regex::Regex::new(&getpathbo_multiline) {
            out = re.replace_all(&out, replacement.as_str()).to_string();
        }
    }
    let wrapper_name = format!(".nexus-vite-wrapper.{}", ext);
    let wrapper_path = project_path.join(&wrapper_name);
    // Comentario al inicio para que se vea qué remotes se inyectaron
    let header = if ext == "ts" || ext == "js" || ext == "mjs" {
        format!(
            "// Nexus: wrapper generado desde {} — remotes reemplazados: {}\n",
            config_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy(),
            remotes.keys().cloned().collect::<Vec<_>>().join(", ")
        )
    } else {
        String::new()
    };
    let final_content = if header.is_empty() {
        out
    } else {
        format!("{}{}", header, out)
    };
    fs::write(&wrapper_path, &final_content).map_err(|e| e.to_string())?;
    Ok(wrapper_name)
}

async fn proxy_handler(
    mut routes: Vec<ProxyRoute>,
    intercept_prefix: Option<String>,
    req: Request,
    app: AppHandle,
) -> Response {
    let path = req.uri().path();
    let method = req.method().as_str();
    let query = req.uri().query().unwrap_or("");
    // If intercept_prefix is set, only paths under that prefix use our routes; rest go to default (/) transparently
    let intercept_prefix_norm = intercept_prefix.as_ref().and_then(|p| {
        let s = p.trim();
        if s.is_empty() {
            None
        } else {
            Some(s.trim_end_matches('/').to_string())
        }
    });
    let path_under_intercept = intercept_prefix_norm.as_ref().map_or(true, |pre| {
        path == pre || path.starts_with(&format!("{}/", pre))
    });
    if intercept_prefix_norm.is_some() && !path_under_intercept {
        // Passthrough: forward to route with path_prefix "/" if present
        if let Some(r) = routes.iter().find(|r| {
            let p = r.path_prefix.trim_end_matches('/');
            p.is_empty() || p == "/"
        }) {
            let base = r.target_url.trim_end_matches('/');
            let target = if query.is_empty() {
                format!("{}{}", base, path)
            } else {
                format!("{}{}?{}", base, path, query)
            };
            let _ = app.emit(
                "proxy-logs",
                format!("{} {} -> {} (passthrough)", method, path, target),
            );
            let client = Client::builder().build().unwrap_or_default();
            let (parts, body) = req.into_parts();
            let body_bytes = to_bytes(body, 10 * 1024 * 1024).await.unwrap_or_default();
            let target_host = base
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .split('/')
                .next()
                .unwrap_or("127.0.0.1");
            let mut proxy_req = client
                .request(parts.method.clone(), &target)
                .header("Host", target_host)
                .body(body_bytes);
            if let Some(h) = parts.headers.get("Accept") {
                proxy_req = proxy_req.header("Accept", h.clone());
            }
            if let Some(h) = parts.headers.get("Content-Type") {
                proxy_req = proxy_req.header("Content-Type", h.clone());
            }
            match proxy_req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let headers = resp.headers().clone();
                    let body = resp.bytes().await.unwrap_or_default();
                    let mut builder = Response::builder().status(status);
                    if let Some(v) = headers.get("Content-Type") {
                        if let Ok(s) = v.to_str() {
                            builder = builder.header("Content-Type", s);
                        }
                    }
                    if let Some(v) = headers.get("Cache-Control") {
                        if let Ok(s) = v.to_str() {
                            builder = builder.header("Cache-Control", s);
                        }
                    }
                    return builder.body(Body::from(body)).unwrap_or_else(|_| {
                        Response::builder().status(500).body(Body::empty()).unwrap()
                    });
                }
                Err(e) => {
                    let _ = app.emit("proxy-logs", format!("  -> passthrough error: {}", e));
                    return Response::builder()
                        .status(502)
                        .body(Body::from(e.to_string()))
                        .unwrap();
                }
            }
        }
    }
    // Match longest prefix first so e.g. /mfe-x wins over /
    routes.sort_by(|a, b| {
        let len_a = a.path_prefix.trim_end_matches('/').len();
        let len_b = b.path_prefix.trim_end_matches('/').len();
        len_b.cmp(&len_a)
    });
    for r in &routes {
        let prefix = r.path_prefix.trim_end_matches('/');
        let prefix_with_slash = format!("{}/", prefix);
        let path_match =
            path == prefix || path == prefix_with_slash || path.starts_with(&prefix_with_slash);
        if path_match {
            let base = r.target_url.trim_end_matches('/');
            // Strip path_prefix so the upstream (e.g. Vite) receives path from root: / or /foo
            let upstream_path = if path == prefix || path == prefix_with_slash {
                "/".to_string()
            } else if let Some(rest) = path.strip_prefix(&prefix_with_slash) {
                format!("/{}", rest.trim_start_matches('/'))
            } else {
                "/".to_string()
            };
            let upstream_path_and_query = if query.is_empty() {
                upstream_path
            } else {
                format!("{}?{}", upstream_path, query)
            };
            let target = format!("{}{}", base, upstream_path_and_query);
            let _ = app.emit("proxy-logs", format!("{} {} -> {}", method, path, target));
            let client = Client::builder().build().unwrap_or_default();
            let (parts, body) = req.into_parts();
            let body_bytes = to_bytes(body, 10 * 1024 * 1024).await.unwrap_or_default();
            // Host header so the upstream server (e.g. Vite) responds correctly
            let target_host = base
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .split('/')
                .next()
                .unwrap_or("127.0.0.1");
            let mut proxy_req = client
                .request(parts.method.clone(), &target)
                .header("Host", target_host)
                .body(body_bytes);
            // Forward common headers from original request
            if let Some(h) = parts.headers.get("Accept") {
                proxy_req = proxy_req.header("Accept", h.clone());
            }
            if let Some(h) = parts.headers.get("Accept-Language") {
                proxy_req = proxy_req.header("Accept-Language", h.clone());
            }
            if let Some(h) = parts.headers.get("Content-Type") {
                proxy_req = proxy_req.header("Content-Type", h.clone());
            }
            match proxy_req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let _ = app.emit("proxy-logs", format!("  -> {} {}", target, status));
                    let headers = resp.headers().clone();
                    let body = resp.bytes().await.unwrap_or_default();
                    let mut builder = Response::builder().status(status);
                    // Forward response headers (Content-Type, etc.) so the browser gets correct MIME types
                    if let Some(v) = headers.get("Content-Type") {
                        if let Ok(s) = v.to_str() {
                            builder = builder.header("Content-Type", s);
                        }
                    }
                    if let Some(v) = headers.get("Cache-Control") {
                        if let Ok(s) = v.to_str() {
                            builder = builder.header("Cache-Control", s);
                        }
                    }
                    return builder.body(Body::from(body)).unwrap_or_else(|_| {
                        Response::builder().status(500).body(Body::empty()).unwrap()
                    });
                }
                Err(e) => {
                    let _ = app.emit("proxy-logs", format!("  -> error: {}", e));
                    return Response::builder()
                        .status(502)
                        .body(Body::from(e.to_string()))
                        .unwrap();
                }
            }
        }
    }
    let _ = app.emit("proxy-logs", format!("{} {} -> 404 no route", method, path));
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(Body::from("No route for this path. Add a host route (/) with the app port to serve the main page."))
        .unwrap()
}

#[tauri::command]
pub async fn start_proxy(
    app: AppHandle,
    state: State<'_, AppState>,
    port: u16,
    routes: Vec<ProxyRoute>,
    bind_host: Option<String>,
    intercept_prefix: Option<String>,
) -> Result<(), String> {
    let mut guard = state.proxy_abort.lock().await;
    if guard.is_some() {
        return Err("Proxy already running".to_string());
    }
    let host = bind_host
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let app_clone = app.clone();
    let routes_clone = routes.clone();
    let intercept_prefix_clone = intercept_prefix.clone();
    let bind_addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "proxy-logs",
        format!("Proxy listening on http://{}", bind_addr),
    );
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let join = tokio::spawn(async move {
        let app_emit = app_clone.clone();
        let router = Router::new().fallback(move |req: Request| {
            let routes = routes_clone.clone();
            let intercept = intercept_prefix_clone.clone();
            let app = app_emit.clone();
            async move { proxy_handler(routes, intercept, req, app).await }
        });
        let shutdown = async { let _ = shutdown_rx.await; };
        if let Err(e) = axum::serve(listener, router).with_graceful_shutdown(shutdown).await {
            let _ = app_clone.emit("proxy-logs", format!("Proxy error: {}", e));
        }
    });
    *guard = Some(ServerHandle { shutdown_tx, join });
    Ok(())
}

#[tauri::command]
pub async fn stop_proxy(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.proxy_abort.lock().await;
    if let Some(h) = guard.take() {
        let _ = h.shutdown_tx.send(());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), h.join).await;
    }
    Ok(())
}

