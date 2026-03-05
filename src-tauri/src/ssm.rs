/// AWS Systems Manager Session Manager — requires the `session-manager-plugin`
/// binary to be installed on the system or its path configured by the user.
///
/// Default system paths searched (after the user-configured path):
///   Windows : C:\Program Files\Amazon\SessionManagerPlugin\bin\session-manager-plugin.exe
///   Linux   : /usr/local/sessionmanagerplugin/bin/session-manager-plugin
///   macOS   : /usr/local/sessionmanagerplugin/bin/session-manager-plugin
///
/// Install from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
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

/// Strips the Windows extended-path prefix `\\?\` that cmd.exe cannot handle.
fn clean_path_str(p: &std::path::Path) -> String {
    let s = p.display().to_string();
    if s.starts_with(r"\\?\") { s[4..].to_string() } else { s }
}

/// Locates the `session-manager-plugin` executable.
///
/// Search order:
///   1. User-configured path (required if not installed system-wide)
///   2. Default AWS installation paths per OS
///   3. PATH (via `which`/`where`)
fn plugin_path_finder(_app: &tauri::AppHandle, custom_path: Option<&str>) -> Result<std::path::PathBuf, String> {
    // 1. User-configured path takes priority
    if let Some(p) = custom_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let path = std::path::PathBuf::from(trimmed);
            if path.exists() {
                return Ok(path);
            } else {
                return Err(format!(
                    "La ruta configurada no existe:\n  {}\n\nRevisa la configuración en CloudWatch → Settings.",
                    trimmed
                ));
            }
        }
    }

    // 2. Default AWS installation paths per OS
    #[cfg(target_os = "windows")]
    let system_candidates: Vec<std::path::PathBuf> = vec![
        r"C:\Program Files\Amazon\SessionManagerPlugin\bin\session-manager-plugin.exe".into(),
        r"C:\Program Files (x86)\Amazon\SessionManagerPlugin\bin\session-manager-plugin.exe".into(),
    ];

    #[cfg(not(target_os = "windows"))]
    let system_candidates: Vec<std::path::PathBuf> = vec![
        "/usr/local/sessionmanagerplugin/bin/session-manager-plugin".into(),
        "/usr/bin/session-manager-plugin".into(),
        "/usr/local/bin/session-manager-plugin".into(),
    ];

    for p in &system_candidates {
        if p.exists() {
            return Ok(p.clone());
        }
    }

    // 3. Search PATH
    #[cfg(target_os = "windows")]
    let which_result = std::process::Command::new("where")
        .arg("session-manager-plugin")
        .output();
    #[cfg(not(target_os = "windows"))]
    let which_result = std::process::Command::new("which")
        .arg("session-manager-plugin")
        .output();

    if let Ok(out) = which_result {
        if out.status.success() {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().lines().next().unwrap_or("").to_string();
            if !path_str.is_empty() {
                return Ok(std::path::PathBuf::from(path_str));
            }
        }
    }

    Err(
        "session-manager-plugin no encontrado.\n\n\
        Instálalo desde:\n  https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html\n\n\
        O configura la ruta manualmente en CloudWatch → Settings → Ruta Session Manager Plugin."
            .to_string(),
    )
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
