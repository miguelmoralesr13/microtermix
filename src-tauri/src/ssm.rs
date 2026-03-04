/// AWS Systems Manager Session Manager — uses the bundled session-manager-plugin
/// sidecar binary. No need for the user to install anything; the plugin binary is
/// shipped alongside the app in src-tauri/binaries/.
///
/// Cross-platform binary naming (Tauri target-triple convention):
///   Windows : binaries/session-manager-plugin-x86_64-pc-windows-msvc.exe
///   Linux   : binaries/session-manager-plugin-x86_64-unknown-linux-gnu
///   macOS   : binaries/session-manager-plugin-x86_64-apple-darwin   (Intel)
///             binaries/session-manager-plugin-aarch64-apple-darwin   (Apple Silicon)
use crate::ec2::Ec2Credentials;
use tauri::Manager;

// ── SSM SDK client (StartSession API only) ────────────────────────────────────

async fn ssm_client(c: &Ec2Credentials) -> aws_sdk_ssm::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_ssm::Client::new(&cfg)
}

// ── Helper: locate the bundled plugin ─────────────────────────────────────────

fn plugin_exe_name_triple() -> String {
    // Tauri names sidecar binaries with the target triple, e.g.
    //   session-manager-plugin-x86_64-pc-windows-msvc.exe
    let os   = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let triple = match (os, arch) {
        ("windows", "x86_64")  => "x86_64-pc-windows-msvc",
        ("linux",   "x86_64")  => "x86_64-unknown-linux-gnu",
        ("linux",   "aarch64") => "aarch64-unknown-linux-gnu",
        ("macos",   "x86_64")  => "x86_64-apple-darwin",
        ("macos",   "aarch64") => "aarch64-apple-darwin",
        _                      => "x86_64-pc-windows-msvc",
    };
    if cfg!(target_os = "windows") {
        format!("session-manager-plugin-{triple}.exe")
    } else {
        format!("session-manager-plugin-{triple}")
    }
}

fn plugin_exe_name() -> &'static str {
    if cfg!(target_os = "windows") { "session-manager-plugin.exe" } else { "session-manager-plugin" }
}

/// Strips the Windows extended-path prefix `\\?\` that cmd.exe cannot handle.
fn clean_path_str(p: &std::path::Path) -> String {
    let s = p.display().to_string();
    if s.starts_with(r"\\?\") { s[4..].to_string() } else { s }
}

/// Returns the path to the `session-manager-plugin` executable.
/// If `custom_path` is provided and exists, it takes precedence.
fn plugin_path_finder(app: &tauri::AppHandle, custom_path: Option<&str>) -> Result<std::path::PathBuf, String> {
    if let Some(p) = custom_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let path = std::path::PathBuf::from(trimmed);
            if path.exists() {
                return Ok(path);
            } else {
                return Err(format!("El plugin custom no existe en la ruta especificada:\n{}", trimmed));
            }
        }
    }

    let triple_name = plugin_exe_name_triple();
    let plain_name  = plugin_exe_name();

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    // 1. CWD-based binaries/ dir — works perfectly during `tauri dev`
    //    (CWD is the workspace root when running `npm run tauri dev`)
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("src-tauri").join("binaries").join(&triple_name));
    candidates.push(cwd.join("src-tauri").join("binaries").join(plain_name));

    // 1. Tauri resource dir (production — after bundling)
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("binaries").join(&triple_name));
        candidates.push(res_dir.join("binaries").join(plain_name));
        candidates.push(res_dir.join(&triple_name));
        candidates.push(res_dir.join(plain_name));
    }

    // 2. Next to the current exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&triple_name));
            candidates.push(dir.join(plain_name));
        }
    }

    for p in &candidates {
        if p.exists() {
            return Ok(p.clone());
        }
    }

    Err(format!(
        "session-manager-plugin no encontrado. Rutas buscadas:\n{}\n\nDescárgalo desde: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html",
        candidates.iter().map(|p| format!("  • {}", p.display())).collect::<Vec<_>>().join("\n")
    ))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Check that the session-manager-plugin is accessible and working.
/// Returns the version string on success.
#[tauri::command]
pub fn ssm_check_plugin(app: tauri::AppHandle, plugin_path: Option<String>) -> Result<String, String> {
    let path = plugin_path_finder(&app, plugin_path.as_deref())?;
    let out = std::process::Command::new(&path)
        .arg("--version")
        .output()
        .map_err(|e| format!("No se pudo ejecutar el plugin: {e}"))?;
    let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if version.is_empty() {
        Ok(format!("OK ({})", path.display()))
    } else {
        Ok(version)
    }
}

/// Start an SSM Session Manager session using the bundled plugin binary.
///
/// Flow:
/// 1. Call `StartSession` API → get `streamUrl`, `sessionId`, `tokenValue`
/// 2. Run `session-manager-plugin <responseJson> <region> StartSession {} <requestJson> <endpoint>`
///    via `spawn_interactive` so stdin/stdout are wired to the terminal UI.
#[tauri::command]
pub async fn ssm_start_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    credentials: Ec2Credentials,
    instance_id: String,
    service_id: String,
    plugin_path: Option<String>,
) -> Result<(), String> {
    use tauri::Emitter;

    let procs_arc  = state.processes.clone();
    let stdins_arc = state.stdin_senders.clone();

    // Kill any existing session with the same id
    {
        let mut p = procs_arc.lock().await;
        if let Some(n) = p.remove(&service_id) { n.notify_waiters(); }
    }
    stdins_arc.lock().await.remove(&service_id);

    // Find the plugin
    let plugin_exe = plugin_path_finder(&app, plugin_path.as_deref())?;

    // Call StartSession API
    let ssm  = ssm_client(&credentials).await;
    let resp = ssm
        .start_session()
        .target(&instance_id)
        .send()
        .await
        .map_err(|e| format!("StartSession: {e}"))?;

    let session_id  = resp.session_id().unwrap_or_default().to_string();
    let stream_url  = resp.stream_url().unwrap_or_default().to_string();
    let token_value = resp.token_value().unwrap_or_default().to_string();

    // Build JSON args the plugin expects
    let response_json = serde_json::json!({
        "SessionId":  session_id,
        "StreamUrl":  stream_url,
        "TokenValue": token_value,
    })
    .to_string();

    let request_json = serde_json::json!({ "Target": instance_id }).to_string();
    let region   = credentials.region.clone();
    let endpoint = format!("https://ssm.{region}.amazonaws.com");
    let plugin_str = clean_path_str(&plugin_exe);

    // Emit a status line to the terminal
    let _ = app.emit("service-logs", crate::LogEvent {
        service_id: service_id.clone(),
        line: format!("[SSM] Iniciando sesión en {}…", instance_id),
        is_error: false,
    });

    // AWS credentials as env vars for the plugin process
    let mut envs = std::collections::HashMap::new();
    envs.insert("AWS_ACCESS_KEY_ID".to_string(),     credentials.access_key_id.clone());
    envs.insert("AWS_SECRET_ACCESS_KEY".to_string(), credentials.secret_access_key.clone());
    envs.insert("AWS_DEFAULT_REGION".to_string(),    credentials.region.clone());
    if let Some(tok) = &credentials.session_token {
        envs.insert("AWS_SESSION_TOKEN".to_string(), tok.clone());
    }

    let args = vec![
        response_json,
        region,
        "StartSession".to_string(),
        "{}".to_string(), // profile is unused
        request_json,
        endpoint,
    ];

    // Delegate to spawn_pty_process: gives the plugin a real PTY so it can
    // enable raw-mode stdin (required for interactive input to work on Windows).
    crate::ec2::spawn_pty_process(app, state, service_id, plugin_str, args, Some(envs)).await
}
