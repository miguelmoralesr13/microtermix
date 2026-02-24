use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command as StdCommand;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as AsyncCommand;
use tokio::sync::Mutex as AsyncMutex;

use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Router;
use imara_diff::{Algorithm, BasicLineDiffPrinter, Diff, InternedInput, UnifiedDiffConfig};
use reqwest::Client;

/// Hunk con rangos 1-based para enviar al frontend (coincide con formato unified diff).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkInfo {
    pub id: usize,
    /// Primera línea en original (1-based)
    pub old_start: u32,
    /// Número de líneas en original
    pub old_count: u32,
    /// Primera línea en modified (1-based)
    pub new_start: u32,
    /// Número de líneas en modified
    pub new_count: u32,
}

/// Resultado del diff: diff unificado + hunks estructurados para aceptar/rechazar.
#[derive(Serialize)]
pub struct DiffHunksResult {
    pub unified_diff: String,
    pub hunks: Vec<HunkInfo>,
}

struct AppState {
    processes: Arc<AsyncMutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    proxy_abort: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>,
    file_server_abort: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>,
    /// Path a abrir en la ventana recién creada (label -> path). La nueva ventana lo pide al cargar.
    pending_workspace_by_label: Arc<AsyncMutex<HashMap<String, String>>>,
}

// 1. Open new workspace (crea ventana y guarda path para que la nueva ventana lo pida al cargar)
#[tauri::command]
async fn open_new_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let window_label = format!("workspace-{}", timestamp);

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_workspace_by_label.lock().await;
        pending.insert(window_label.clone(), path.clone());
    }

    let title = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path.as_str());
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(format!("DevFlow Nexus — {}", title))
    .inner_size(800.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// La nueva ventana llama esto al cargar para obtener el path del workspace y aplicarlo.
#[tauri::command]
async fn get_initial_workspace_for_window(
    app: AppHandle,
    window_label: String,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let mut pending = state.pending_workspace_by_label.lock().await;
    Ok(pending.remove(&window_label))
}

// 2. Scan projects
#[derive(Serialize)]
struct Project {
    name: String,
    path: String,
    project_type: String, // "node" | "go" | "rust" | "unknown"
    scripts: Vec<String>,
}

#[tauri::command]
fn scan_projects(root_path: String) -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();
    let root = Path::new(&root_path);

    if !root.is_dir() {
        return Err("Root path is not a directory".to_string());
    }

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                let path_str = path.to_string_lossy().to_string();
                let mut p_type = "unknown".to_string();
                let mut scripts = Vec::new();

                if path.join("package.json").exists() {
                    p_type = "node".to_string();
                    if let Ok(content) = fs::read_to_string(path.join("package.json")) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(scripts_obj) =
                                json.get("scripts").and_then(|s| s.as_object())
                            {
                                for key in scripts_obj.keys() {
                                    scripts.push(format!("npm run {}", key));
                                }
                            }
                        }
                    }
                } else if path.join("go.mod").exists() {
                    p_type = "go".to_string();
                    scripts.push("go run .".to_string());
                } else if path.join("Cargo.toml").exists() {
                    p_type = "rust".to_string();
                    scripts.push("cargo run".to_string());
                }

                if p_type != "unknown" {
                    projects.push(Project {
                        name,
                        path: path_str,
                        project_type: p_type,
                        scripts,
                    });
                }
            }
        }
    }
    Ok(projects)
}

/// Reads all .env* files in a project directory.
/// Returns { "dev": { "KEY": "VALUE", ... }, "qa": { ... }, ... }
#[tauri::command]
fn read_project_envs(
    project_path: String,
) -> Result<std::collections::HashMap<String, std::collections::HashMap<String, String>>, String> {
    use std::collections::HashMap;

    // .env file name → env label
    let env_files: &[(&str, &str)] = &[
        (".env", "dev"),
        (".env.local", "local"),
        (".env.dev", "dev"),
        (".env.development", "dev"),
        (".env.qa", "qa"),
        (".env.uat", "uat"),
        (".env.staging", "staging"),
        (".env.production", "production"),
        (".env.prod", "production"),
        (".env.test", "test"),
    ];

    let mut result: HashMap<String, HashMap<String, String>> = HashMap::new();

    for (filename, label) in env_files {
        let file_path = Path::new(&project_path).join(filename);
        if !file_path.exists() {
            continue;
        }
        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let env_map = result.entry(label.to_string()).or_insert_with(HashMap::new);
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim().to_string();
                // Strip surrounding quotes from value
                let val = val.trim();
                let val = val.trim_matches('"').trim_matches('\'').to_string();
                if !key.is_empty() {
                    env_map.insert(key, val);
                }
            }
        }
    }

    // Always ensure at least a "dev" entry exists
    result.entry("dev".to_string()).or_insert_with(HashMap::new);

    Ok(result)
}

/// Devuelve los comandos reales de package.json (valores de "scripts") para poder parsear envs inline.
#[tauri::command]
fn get_project_script_bodies(project_path: String) -> Result<Vec<String>, String> {
    let pkg_path = Path::new(&project_path).join("package.json");
    if !pkg_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let scripts_obj = match json.get("scripts").and_then(|s| s.as_object()) {
        Some(o) => o,
        None => return Ok(Vec::new()),
    };
    let bodies: Vec<String> = scripts_obj
        .values()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    Ok(bodies)
}

/// Entrada de proceso en escucha (netstat).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListeningProcess {
    pub proto: String,
    pub local_address: String,
    pub foreign_address: String,
    pub state: String,
    pub pid: u32,
}

/// Obtiene procesos en estado LISTENING vía netstat (Windows) o netstat/lsof (Unix).
#[tauri::command]
fn get_listening_processes() -> Result<Vec<ListeningProcess>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = StdCommand::new("netstat");
        cmd.args(["-ano"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut rows = Vec::new();
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Active") || line.starts_with("Proto") {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let state = parts[3].to_uppercase();
                if state == "LISTENING" {
                    let pid: u32 = parts[4].parse().unwrap_or(0);
                    if pid > 0 {
                        rows.push(ListeningProcess {
                            proto: parts[0].to_string(),
                            local_address: parts[1].to_string(),
                            foreign_address: parts[2].to_string(),
                            state: parts[3].to_string(),
                            pid,
                        });
                    }
                }
            }
        }
        Ok(rows)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = StdCommand::new("netstat")
            .args(["-tulnp"])
            .output()
            .or_else(|_| StdCommand::new("ss").args(["-tulnp"]).output())
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut rows = Vec::new();
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with("Proto")
                || line.starts_with("State")
                || line.starts_with("Netid")
            {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let pid_str = parts.last().unwrap_or(&"0");
            let pid: u32 = pid_str
                .split('/')
                .next()
                .unwrap_or("0")
                .parse()
                .unwrap_or(0);
            if pid > 0 && parts.len() >= 5 {
                let (local, foreign) = if parts.len() >= 6 {
                    (parts[4].to_string(), parts[5].to_string())
                } else {
                    (parts[3].to_string(), parts[4].to_string())
                };
                rows.push(ListeningProcess {
                    proto: parts[0].to_string(),
                    local_address: local,
                    foreign_address: foreign,
                    state: "LISTEN".to_string(),
                    pid,
                });
            }
        }
        Ok(rows)
    }
}

/// Mata un proceso por PID (taskkill en Windows, kill -9 en Unix).
#[tauri::command]
fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = StdCommand::new("taskkill");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let status = cmd.status().map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill failed with code {:?}", status.code()))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = StdCommand::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("kill failed with code {:?}", status.code()))
        }
    }
}

// ─── Proxy reverso (Vite) ───────────────────────────────────────────────────

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

fn find_vite_config(project_path: &Path) -> Option<std::path::PathBuf> {
    VITE_CONFIG_NAMES
        .iter()
        .map(|n| project_path.join(n))
        .find(|p| p.exists())
}

#[tauri::command]
fn has_vite_config(project_path: String) -> Result<bool, String> {
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
fn parse_vite_federation(project_path: String) -> Result<ViteFederationInfo, String> {
    let path = Path::new(&project_path);
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    let config_path = find_vite_config(path).ok_or("No vite config found".to_string())?;
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    Ok(parse_vite_federation_from_content(&content))
}

#[tauri::command]
fn get_proxy_candidates(workspace_path: String) -> Result<Vec<ProxyCandidate>, String> {
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
fn generate_vite_wrapper(
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
async fn start_proxy(
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
    let handle = tokio::spawn(async move {
        let app_emit = app_clone.clone();
        let router = Router::new().fallback(move |req: Request| {
            let routes = routes_clone.clone();
            let intercept = intercept_prefix_clone.clone();
            let app = app_emit.clone();
            async move { proxy_handler(routes, intercept, req, app).await }
        });
        let server = axum::serve(listener, router);
        if let Err(e) = server.await {
            let _ = app_clone.emit("proxy-logs", format!("Proxy error: {}", e));
        }
    });
    *guard = Some(handle);
    Ok(())
}

#[tauri::command]
async fn stop_proxy(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.proxy_abort.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
    }
    Ok(())
}

// ─── Servidor de archivos (path URL → contenido en memoria) ─────────────────

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
async fn start_file_server(
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
async fn stop_file_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.file_server_abort.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
    }
    Ok(())
}

// 3. Persistence
fn sanitize_path(path: &str) -> String {
    path.replace('/', "_").replace('\\', "_").replace(':', "_")
}

#[tauri::command]
fn save_workspace_settings(
    app: AppHandle,
    workspace_path: String,
    settings: String,
) -> Result<(), String> {
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let safe_path = sanitize_path(&workspace_path);
    let settings_path = app_dir.join(format!("{}.json", safe_path));
    fs::write(settings_path, settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_workspace_settings(app: AppHandle, workspace_path: String) -> Result<String, String> {
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let safe_path = sanitize_path(&workspace_path);
    let settings_path = app_dir.join(format!("{}.json", safe_path));
    if settings_path.exists() {
        fs::read_to_string(settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

/// Nombre del archivo de config del workspace dentro de la carpeta del workspace.
const WORKSPACE_CONFIG_FILENAME: &str = "nexus-workspace.json";

/// Lee la config del workspace desde un archivo en la carpeta del workspace (nexus-workspace.json).
#[tauri::command]
fn read_workspace_config_in_folder(workspace_path: String) -> Result<String, String> {
    let path = Path::new(&workspace_path).join(WORKSPACE_CONFIG_FILENAME);
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

/// Escribe la config del workspace en un archivo en la carpeta del workspace (nexus-workspace.json).
#[tauri::command]
fn write_workspace_config_in_folder(workspace_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&workspace_path).join(WORKSPACE_CONFIG_FILENAME);
    fs::write(&path, content).map_err(|e| e.to_string())
}

// 4. Process execution
#[derive(Clone, Serialize)]
struct LogEvent {
    service_id: String,
    line: String,
    is_error: bool,
}

/// Escapa valor para cross-env (comillas si tiene espacios o caracteres especiales).
fn escape_cross_env_value(v: &str) -> String {
    if v.contains(' ') || v.contains('"') || v.contains('&') || v.contains('|') || v.is_empty() {
        format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        v.to_string()
    }
}

/// Orden: npx cross-env <variables> <comando> [--config ... ya va en script_to_run]
/// Así las vars van primero, después el comando (preview/dev/build) y después la config de Vite.
fn wrap_with_cross_env(script: &str, envs: &HashMap<String, String>) -> String {
    if envs.is_empty() {
        return script.to_string();
    }
    let env_part: String = envs
        .iter()
        .map(|(k, v)| format!("{}={}", k, escape_cross_env_value(v)))
        .collect::<Vec<_>>()
        .join(" ");
    format!("npx cross-env {} {}", env_part, script)
}

#[tauri::command]
async fn execute_service_script(
    app: AppHandle,
    state: State<'_, AppState>,
    service_id: String,
    project_path: String,
    script: String,
    env_vars_json: String,
    use_vite_wrapper: Option<bool>,
    vite_wrapper_remotes: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let path = Path::new(&project_path);
    let mut script_to_run = script.clone();
    if use_vite_wrapper == Some(true) {
        if let Some(ref remotes) = vite_wrapper_remotes {
            if !remotes.is_empty() && path.is_dir() && find_vite_config(path).is_some() {
                if let Ok(wrapper_name) = generate_vite_wrapper(path, remotes) {
                    let wrapper_arg = format!("--config {}", wrapper_name);
                    let mut new_parts = Vec::new();
                    for part in script.split("&&") {
                        let p = part.trim();
                        let mut replaced = p.to_string();
                        if p.contains("vite") {
                            replaced = format!("{} {}", p, wrapper_arg);
                        } else if p == "npm run dev" || p.starts_with("npm run dev ") {
                            replaced = format!("npx vite {}", wrapper_arg);
                        } else if p == "npm run preview" || p.starts_with("npm run preview ") {
                            replaced = format!("npx vite preview {}", wrapper_arg);
                        } else if p == "npm run build" || p.starts_with("npm run build ") {
                            replaced = format!("npx vite build {}", wrapper_arg);
                        }
                        new_parts.push(replaced);
                    }
                    script_to_run = new_parts.join(" && ");
                }
            }
        }
    }

    let envs: HashMap<String, String> = serde_json::from_str(&env_vars_json).unwrap_or_default();

    if !envs.is_empty() {
        script_to_run = wrap_with_cross_env(&script_to_run, &envs);
    }

    // Comando completo en orden: 1) variables de entorno, 2) comando (incl. env inline y config Vite si aplica)
    {
        if envs.is_empty() {
            let _ = app.emit(
                "service-logs",
                LogEvent {
                    service_id: service_id.clone(),
                    line: "[ENV] (sin variables de entorno)".to_string(),
                    is_error: false,
                },
            );
        } else {
            let env_line: String = envs
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join(" ");
            let _ = app.emit(
                "service-logs",
                LogEvent {
                    service_id: service_id.clone(),
                    line: format!("[ENV] {}", env_line),
                    is_error: false,
                },
            );
        }
        // Emitir solo el comando real (multiplataforma); la ejecución usa el shell del SO internamente
        let _ = app.emit(
            "service-logs",
            LogEvent {
                service_id: service_id.clone(),
                line: format!("[CMD] {}", script_to_run),
                is_error: false,
            },
        );
    }

    #[cfg(target_os = "windows")]
    let mut cmd = AsyncCommand::new("cmd");
    #[cfg(target_os = "windows")]
    {
        cmd.args(["/C", &script_to_run]).creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    let mut cmd = AsyncCommand::new("sh");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["-c", &script_to_run]);

    cmd.current_dir(&project_path)
        .envs(envs)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    // .envs(envs): el proceso hijo (cmd/sh) recibe las variables; npm/node las heredan y priman sobre .env

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let notify = Arc::new(tokio::sync::Notify::new());

    {
        let mut processes = state.processes.lock().await;
        processes.insert(service_id.clone(), notify.clone());
    }

    let app_clone = app.clone();
    let service_id_clone = service_id.clone();
    let notify_clone = notify.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        loop {
            tokio::select! {
                _ = notify_clone.notified() => break,
                line = reader.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            let _ = app_clone.emit("service-logs", LogEvent {
                                service_id: service_id_clone.clone(),
                                line: l,
                                is_error: false,
                            });
                        }
                        _ => break,
                    }
                }
            }
        }
    });

    let app_clone_err = app.clone();
    let service_id_clone_err = service_id.clone();
    let notify_clone_err = notify.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        loop {
            tokio::select! {
                _ = notify_clone_err.notified() => break,
                line = reader.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            let _ = app_clone_err.emit("service-logs", LogEvent {
                                service_id: service_id_clone_err.clone(),
                                line: l,
                                is_error: true,
                            });
                        }
                        _ => break,
                    }
                }
            }
        }
    });

    let notify_wait = notify.clone();
    tokio::spawn(async move {
        tokio::select! {
            _ = notify_wait.notified() => {
                #[cfg(target_os = "windows")]
                {
                    if let Some(pid) = child.id() {
                        let mut kill_cmd = std::process::Command::new("taskkill");
                        kill_cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            kill_cmd.creation_flags(0x08000000);
                        }
                        let _ = kill_cmd.output();
                    }
                }
                let _ = child.kill().await;
            }
            _ = child.wait() => {}
        }
    });

    Ok(())
}

#[tauri::command]
async fn kill_service(state: State<'_, AppState>, service_id: String) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    if let Some(notify) = processes.remove(&service_id) {
        notify.notify_waiters();
    }
    Ok(())
}

#[tauri::command]
async fn kill_all_services(state: State<'_, AppState>) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    for notify in processes.values() {
        notify.notify_waiters();
    }
    processes.clear();
    Ok(())
}

#[tauri::command]
fn read_file_content(base: String, file: String) -> Result<String, String> {
    let path = Path::new(&base).join(&file);
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Lee un archivo por ruta absoluta (p. ej. la devuelta por el diálogo de selección).
#[tauri::command]
fn read_file_at_path(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(base: String, file: String, content: String) -> Result<(), String> {
    let path = Path::new(&base).join(&file);
    fs::write(path, content).map_err(|e| e.to_string())
}

/// Computes unified diff from original and modified content using imara-diff (Rust).
/// Returns a string in git unified diff format (with ---/+++ header) so the frontend can parse hunks.
#[tauri::command]
fn compute_unified_diff(
    original: String,
    modified: String,
    file_path: String,
) -> Result<String, String> {
    let original_norm = original.replace("\r\n", "\n");
    let modified_norm = modified.replace("\r\n", "\n");
    let input = InternedInput::new(original_norm.as_str(), modified_norm.as_str());
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);
    let printer = BasicLineDiffPrinter(&input.interner);
    let body = diff
        .unified_diff(&printer, UnifiedDiffConfig::default(), &input)
        .to_string();
    let header = format!("--- a/{}\n+++ b/{}\n", file_path, file_path);
    Ok(header + &body)
}

/// Parsea los bloques @@ del cuerpo de un unified diff y devuelve los hunks (misma lista que ve el usuario).
fn parse_hunks_from_unified_body(body: &str) -> Vec<HunkInfo> {
    let mut hunks = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.starts_with("@@ ") && line.ends_with(" @@") {
            let inner = &line[3..line.len() - 3];
            let parts: Vec<&str> = inner.split_whitespace().collect();
            if parts.len() >= 2 {
                let old_part = parts[0];
                let new_part = parts[1];
                let parse_range = |s: &str| -> (u32, u32) {
                    let s = s.trim_start_matches('-').trim_start_matches('+');
                    let mut it = s.split(',');
                    let start: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(1);
                    let count: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(1);
                    (start, count)
                };
                let (old_start, old_count) = parse_range(old_part);
                let (new_start, new_count) = parse_range(new_part);
                hunks.push(HunkInfo {
                    id: hunks.len(),
                    old_start,
                    old_count,
                    new_start,
                    new_count,
                });
            }
        }
    }
    hunks
}

/// Calcula diff con imara-diff y devuelve unified_diff + hunks. Los hunks se extraen del propio texto
/// del diff (líneas @@). Sin postprocesado para no fusionar hunks y que cada bloque de cambios sea un hunk.
#[tauri::command]
fn compute_diff_hunks(
    original: String,
    modified: String,
    file_path: String,
) -> Result<DiffHunksResult, String> {
    let original_norm = original.replace("\r\n", "\n");
    let modified_norm = modified.replace("\r\n", "\n");
    let input = InternedInput::new(original_norm.as_str(), modified_norm.as_str());
    let diff = Diff::compute(Algorithm::Histogram, &input);
    let printer = BasicLineDiffPrinter(&input.interner);
    let body = diff
        .unified_diff(&printer, UnifiedDiffConfig::default(), &input)
        .to_string();
    let header = format!("--- a/{}\n+++ b/{}\n", file_path, file_path);
    let unified_diff = header + &body;

    let hunks = parse_hunks_from_unified_body(&body);

    Ok(DiffHunksResult {
        unified_diff,
        hunks,
    })
}

/// Aplica rechazos: devuelve el contenido "modified" con los hunks indicados revertidos (usando original).
/// reject_indices: índices de hunks a rechazar (deben coincidir con los hunks devueltos por compute_diff_hunks).
#[tauri::command]
fn apply_rejected_hunks(
    original: String,
    modified: String,
    hunks: Vec<HunkInfo>,
    reject_indices: Vec<usize>,
) -> Result<String, String> {
    if reject_indices.is_empty() {
        return Ok(modified);
    }
    let orig_lines: Vec<&str> = original.lines().collect();
    let mut mod_lines: Vec<String> = modified.lines().map(String::from).collect();

    let to_reject: Vec<&HunkInfo> = reject_indices
        .iter()
        .filter_map(|&i| hunks.get(i))
        .collect();
    if to_reject.is_empty() {
        return Ok(modified);
    }
    // Ordenar por new_start descendente para aplicar de atrás hacia adelante y no desalinear índices.
    let mut sorted: Vec<&HunkInfo> = to_reject.iter().copied().collect();
    sorted.sort_by(|a, b| b.new_start.cmp(&a.new_start));

    for h in sorted {
        let old_start_0 = (h.old_start as usize).saturating_sub(1);
        let old_end = (old_start_0 + h.old_count as usize).min(orig_lines.len());
        let new_start_0 = (h.new_start as usize).saturating_sub(1);
        let new_end = (new_start_0 + h.new_count as usize).min(mod_lines.len());
        if new_start_0 > mod_lines.len() || old_start_0 > orig_lines.len() {
            continue;
        }
        let replacement: Vec<String> = orig_lines[old_start_0..old_end]
            .iter()
            .map(|s| s.to_string())
            .collect();
        mod_lines.splice(new_start_0..new_end, replacement);
    }

    // Preserve Windows line endings if the original modified string used them
    let out_str = if modified.contains("\r\n") {
        mod_lines.join("\r\n")
    } else {
        mod_lines.join("\n")
    };

    Ok(out_str)
}

// 5. Git Integration
#[derive(Serialize)]
pub struct GitResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[derive(Serialize, Clone)]
struct GitLogPayload {
    project_path: String,
    command: String,
    stdout: String,
    stderr: String,
}

#[tauri::command]
async fn git_execute(
    app_handle: tauri::AppHandle,
    project_path: String,
    args: Vec<String>,
) -> Result<GitResult, String> {
    let mut cmd = AsyncCommand::new("git");
    cmd.args(&args);
    cmd.current_dir(&project_path);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().await.map_err(|e| e.to_string())?;

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
    let command_str = format!("git {}", args.join(" "));

    let _ = app_handle.emit(
        "git-log",
        GitLogPayload {
            project_path: project_path.clone(),
            command: command_str,
            stdout: stdout_str.clone(),
            stderr: stderr_str.clone(),
        },
    );

    Ok(GitResult {
        stdout: stdout_str,
        stderr: stderr_str,
        success: output.status.success(),
    })
}

/// Reword the message of any local commit (HEAD or older) non-interactively.
/// Strategy:
///   1. Write the new message to a temp file.
///   2. Run `git rebase -i HASH^` with:
///        GIT_SEQUENCE_EDITOR = cmd that replaces "pick SHORTHASH" with "reword SHORTHASH"
///        GIT_EDITOR          = cmd that overwrites the COMMIT_EDITMSG with the temp file
#[tauri::command]
async fn git_reword_commit(
    app_handle: tauri::AppHandle,
    project_path: String,
    commit_hash: String,
    new_message: String,
) -> Result<GitResult, String> {
    use std::fs;
    use std::path::Path;

    // 1. Write the new commit message to a temp file
    let msg_path = format!("{}/.nexus_msg.txt", project_path);
    fs::write(&msg_path, &new_message).map_err(|e| e.to_string())?;
    let msg_path_escaped = msg_path.replace('\\', "/");

    // 2. Get the short hash (first 7 chars)
    let short_hash = &commit_hash[..commit_hash.len().min(7)];

    // 3. Check if this is HEAD
    let mut head_cmd = AsyncCommand::new("git");
    head_cmd.args(&["rev-parse", "--short", "HEAD"]);
    head_cmd.current_dir(&project_path);
    let head_out = head_cmd.output().await.map_err(|e| e.to_string())?;
    let head_short = String::from_utf8_lossy(&head_out.stdout).trim().to_string();

    let result = if head_short.starts_with(short_hash) || short_hash.starts_with(&head_short) {
        // HEAD commit: use simple amend
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["commit", "--amend", "-m", &new_message]);
        cmd.current_dir(&project_path);
        cmd.output().await.map_err(|e| e.to_string())?
    } else {
        // Non-HEAD: use rebase -i with env var automation
        // GIT_SEQUENCE_EDITOR: a tiny script that replaces "pick HASH" with "reword HASH"
        // On Windows with Git, we can use git's bundled sh:
        // GIT_SEQUENCE_EDITOR="sed -i 's/^pick ...short.../reword ...short.../' %1"
        // We write a .cmd shim instead for cross-compatibility:
        let seq_editor_script = format!(
            "@echo off\r\npowershell -Command \"(Get-Content '%1') -replace 'pick {short}', 'reword {short}' | Set-Content '%1'\"\r\n",
            short = short_hash
        );
        let seq_editor_path = format!("{}/.nexus_seq_editor.cmd", project_path);
        fs::write(&seq_editor_path, &seq_editor_script).map_err(|e| e.to_string())?;

        // GIT_EDITOR: writes the new message to the COMMIT_EDITMSG file
        let editor_script = format!(
            "@echo off\r\npowershell -Command \"Set-Content -Path '%1' -Value (Get-Content -Raw '{}')\"\r\n",
            msg_path_escaped
        );
        let editor_path = format!("{}/.nexus_editor.cmd", project_path);
        fs::write(&editor_path, &editor_script).map_err(|e| e.to_string())?;

        let seq_abs = Path::new(&seq_editor_path)
            .canonicalize()
            .map(|p| p.display().to_string())
            .unwrap_or(seq_editor_path.clone());
        let editor_abs = Path::new(&editor_path)
            .canonicalize()
            .map(|p| p.display().to_string())
            .unwrap_or(editor_path.clone());

        let parent_ref = format!("{}^", commit_hash);
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["rebase", "-i", &parent_ref]);
        cmd.current_dir(&project_path);
        cmd.env("GIT_SEQUENCE_EDITOR", &seq_abs);
        cmd.env("GIT_EDITOR", &editor_abs);
        // Prevent git from opening a pager
        cmd.env("GIT_PAGER", "cat");
        cmd.env("TERM", "dumb");
        let out = cmd.output().await.map_err(|e| e.to_string())?;

        // Clean up temp scripts
        let _ = fs::remove_file(&seq_editor_path);
        let _ = fs::remove_file(&editor_path);

        out
    };

    // Clean up message file
    let _ = fs::remove_file(&msg_path);

    let stdout_str = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&result.stderr).to_string();

    let _ = app_handle.emit(
        "git-log",
        GitLogPayload {
            project_path: project_path.clone(),
            command: format!(
                "git reword {} \"{}...\"",
                &commit_hash[..7.min(commit_hash.len())],
                &new_message[..new_message.len().min(40)]
            ),
            stdout: stdout_str.clone(),
            stderr: stderr_str.clone(),
        },
    );

    Ok(GitResult {
        stdout: stdout_str,
        stderr: stderr_str,
        success: result.status.success(),
    })
}

#[tauri::command]
async fn git_apply_patch(
    app_handle: tauri::AppHandle,
    project_path: String,
    patch_content: String,
    reverse: bool,
    target: Option<String>,
) -> Result<GitResult, String> {
    // Write patch to a temporary file
    let patch_path = format!("{}/.nexus_temp.patch", project_path);
    fs::write(&patch_path, &patch_content).map_err(|e| e.to_string())?;

    let mut args = vec!["apply".to_string()];

    // Target can be "index" (--cached), "working" (no flag), or "both" (--index)
    match target.as_deref() {
        Some("working") => { /* Applies only to working tree */ }
        Some("both") => {
            args.push("--index".to_string());
        }
        _ => {
            args.push("--cached".to_string());
        } // Default to index for backwards compatibility
    }

    if reverse {
        args.push("--reverse".to_string());
    }
    args.push(".nexus_temp.patch".to_string());

    let result = git_execute(app_handle, project_path.clone(), args).await;

    // Clean up temp patch file
    let _ = fs::remove_file(&patch_path);

    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            processes: Arc::new(AsyncMutex::new(HashMap::new())),
            proxy_abort: Arc::new(AsyncMutex::new(None)),
            file_server_abort: Arc::new(AsyncMutex::new(None)),
            pending_workspace_by_label: Arc::new(AsyncMutex::new(HashMap::new())),
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.app_handle().state::<AppState>();
                let proxy_abort = state.proxy_abort.clone();
                let processes = state.processes.clone();

                tauri::async_runtime::spawn(async move {
                    {
                        let mut guard = proxy_abort.lock().await;
                        if let Some(handle) = guard.take() {
                            handle.abort();
                        }
                    }
                    {
                        let mut procs = processes.lock().await;
                        for notify in procs.values() {
                            notify.notify_waiters();
                        }
                        procs.clear();
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_new_workspace,
            get_initial_workspace_for_window,
            scan_projects,
            save_workspace_settings,
            load_workspace_settings,
            read_workspace_config_in_folder,
            write_workspace_config_in_folder,
            execute_service_script,
            kill_service,
            kill_all_services,
            read_file_content,
            read_file_at_path,
            write_file_content,
            compute_unified_diff,
            compute_diff_hunks,
            apply_rejected_hunks,
            git_execute,
            git_apply_patch,
            git_reword_commit,
            read_project_envs,
            get_project_script_bodies,
            get_listening_processes,
            kill_process_by_pid,
            has_vite_config,
            parse_vite_federation,
            get_proxy_candidates,
            start_proxy,
            stop_proxy,
            start_file_server,
            stop_file_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
