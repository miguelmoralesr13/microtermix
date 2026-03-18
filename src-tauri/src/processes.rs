use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::Arc;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader, AsyncWriteExt};
use tokio::fs::OpenOptions as TokioOpenOptions;
use tokio::process::Command as AsyncCommand;

use crate::os_utils::{silent_command, silent_async_command};
use crate::proxy::{find_vite_config, generate_vite_wrapper};
use crate::state::{AppState, PipelineState, PipelineStatus, PipelineStep, PipelineStepCondition};

/// Helper to wait for a port to be open.
async fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let addr = format!("127.0.0.1:{}", port);
    while start.elapsed().as_secs() < timeout_secs {
        if tokio::net::TcpStream::connect(&addr).await.is_ok() {
            return true;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
    }
    false
}

/// Helper to wait for a log pattern in a service.
async fn wait_for_log(service_id: String, pattern: String, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let log_path = get_service_log_path(&service_id);
    let regex = match regex::Regex::new(&pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };

    while start.elapsed().as_secs() < timeout_secs {
        if log_path.exists() {
            if let Ok(content) = fs::read_to_string(&log_path) {
                if regex.is_match(&content) {
                    return true;
                }
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    false
}

#[tauri::command]
pub async fn execute_pipeline(
    app: AppHandle,
    state: State<'_, AppState>,
    pipeline_id: String,
    steps: Vec<PipelineStep>,
) -> Result<(), String> {
    let total_steps = steps.len();
    {
        let mut p = state.pipelines.lock().await;
        p.insert(
            pipeline_id.clone(),
            PipelineState {
                status: PipelineStatus::Running,
                current_step: 0,
                total_steps,
            },
        );
    }

    let app_clone = app.clone();
    let pipeline_id_clone = pipeline_id.clone();

    tokio::spawn(async move {
        let state_in_task = app_clone.state::<AppState>();
        for (i, step) in steps.into_iter().enumerate() {
            // Update current step
            {
                let mut p = state_in_task.pipelines.lock().await;
                if let Some(ps) = p.get_mut(&pipeline_id_clone) {
                    ps.current_step = i + 1;
                }
            }

            // We assume the service is already running or being started by some other means,
            // or we might need to "start" it here if it's not.
            // For now, let's assume the pipeline just waits for conditions on services.
            
            if let Some(condition) = step.condition {
                let success = match condition {
                    PipelineStepCondition::WaitPort(port) => wait_for_port(port, 60).await,
                    PipelineStepCondition::WaitLog(pattern) => {
                        wait_for_log(step.service_id, pattern, 60).await
                    }
                };

                if !success {
                    let mut p = state_in_task.pipelines.lock().await;
                    p.insert(
                        pipeline_id_clone.clone(),
                        PipelineState {
                            status: PipelineStatus::Failed("Timeout waiting for condition".to_string()),
                            current_step: i + 1,
                            total_steps,
                        },
                    );
                    let _ = app_clone.emit("pipeline-status", (pipeline_id_clone, "failed"));
                    return;
                }
            }
        }

        let mut p = state_in_task.pipelines.lock().await;
        p.insert(
            pipeline_id_clone.clone(),
            PipelineState {
                status: PipelineStatus::Completed,
                current_step: total_steps,
                total_steps,
            },
        );
        let _ = app_clone.emit("pipeline-status", (pipeline_id_clone, "completed"));
    });

    Ok(())
}

#[tauri::command]
pub async fn get_pipeline_state(
    state: State<'_, AppState>,
    pipeline_id: String,
) -> Result<Option<PipelineState>, String> {
    let p = state.pipelines.lock().await;
    Ok(p.get(&pipeline_id).cloned())
}

/// Gets the temporary directory for service logs.
fn get_logs_dir() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("microtermix");
    path.push("logs");
    let _ = fs::create_dir_all(&path);
    path
}

/// Sanitizes service_id to be used as a filename.
fn sanitize_filename(name: &str) -> String {
    if name.len() > 100 {
        let mut hasher = DefaultHasher::new();
        name.hash(&mut hasher);
        return format!("h_{:x}", hasher.finish());
    }
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}

/// Returns the full path to the log file for a given service.
fn get_service_log_path(service_id: &str) -> PathBuf {
    let mut path = get_logs_dir();
    path.push(format!("{}.log", sanitize_filename(service_id)));
    path
}

/// Appends a line to the service log file asynchronously.
async fn append_to_service_log_async(service_id: String, line: String) {
    let path = get_service_log_path(&service_id);
    if let Ok(mut file) = TokioOpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
    {
        let _ = file.write_all(format!("{}\n", line).as_bytes()).await;
    }
}

#[tauri::command]
pub fn get_service_logs(service_id: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let path = get_service_log_path(&service_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    if let Some(l) = limit {
        if lines.len() > l {
            return Ok(lines[lines.len() - l..].to_vec());
        }
    }
    Ok(lines)
}

#[tauri::command]
pub fn open_in_editor(path: String, line: Option<u32>, column: Option<u32>) -> Result<(), String> {
    // Try to open with VS Code if available (supports line/column)
    let mut cmd = if cfg!(target_os = "windows") {
        StdCommand::new("cmd")
    } else {
        StdCommand::new("sh")
    };

    let goto_arg = match (line, column) {
        (Some(l), Some(c)) => format!("{}:{}:{}", path, l, c),
        (Some(l), None) => format!("{}:{}", path, l),
        _ => path.clone(),
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.args(["/C", "code", "--goto", &goto_arg]).creation_flags(0x08000000);
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.args(["-c", &format!("code --goto {}", goto_arg)]);
    }

    if let Ok(status) = cmd.status() {
        if status.success() {
            return Ok(());
        }
    }

    // Fallback to system default opener (no line/column support usually)
    tauri_plugin_opener::open_path(path, None::<String>).map_err(|e| e.to_string())
}

/// Public wrapper called from state.rs on app exit.
#[cfg(not(target_os = "windows"))]
pub fn kill_tree_unix_pub(pid: u32) {
    kill_tree_unix(pid, nix::sys::signal::Signal::SIGKILL);
}
#[cfg(target_os = "windows")]
pub fn kill_tree_unix_pub(_pid: u32) {}

/// Recursively kill a process tree on Linux by reading /proc PPid entries.
/// Kills children first (depth-first), then the process itself.
#[cfg(not(target_os = "windows"))]
fn kill_tree_unix(pid: u32, sig: nix::sys::signal::Signal) {
    use nix::sys::signal::kill;
    use nix::unistd::Pid;
    // Find direct children via /proc/<n>/status PPid field
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let child_pid: u32 = match name_str.parse() {
                Ok(n) if n != pid => n,
                _ => continue,
            };
            let status_path = format!("/proc/{}/status", child_pid);
            if let Ok(status) = std::fs::read_to_string(&status_path) {
                for line in status.lines() {
                    if let Some(rest) = line.strip_prefix("PPid:") {
                        if let Ok(ppid) = rest.trim().parse::<u32>() {
                            if ppid == pid {
                                kill_tree_unix(child_pid, sig);
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    let _ = kill(Pid::from_raw(pid as i32), sig);
}

/// Entrada de proceso en escucha (netstat).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningProcess {
    pub proto: String,
    pub local_address: String,
    pub foreign_address: String,
    pub state: String,
    pub pid: u32,
    pub name: String,
    pub path: String,
    pub service_id: Option<String>,
}

/// Helper to get process name and executable path from a PID.
fn resolve_process_info(pid: u32) -> (String, String) {
    if pid == 0 { return ("System".to_string(), "kernel".to_string()); }

    #[cfg(not(target_os = "windows"))]
    {
        // Try to get name from comm first
        let mut name = fs::read_to_string(format!("/proc/{}/comm", pid))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        
        // If name is unknown or generic, try cmdline
        if name == "unknown" || name == "node" || name == "java" || name == "python" || name == "sh" || name == "bash" {
            if let Ok(cmdline) = fs::read_to_string(format!("/proc/{}/cmdline", pid)) {
                let parts: Vec<&str> = cmdline.split('\0').filter(|s| !s.is_empty()).collect();
                if let Some(first) = parts.first() {
                    // Extract basename of the executable
                    let p = Path::new(first);
                    if let Some(fname) = p.file_name() {
                        name = fname.to_string_lossy().to_string();
                    }
                }
            }
        }

        let exe = fs::read_link(format!("/proc/{}/exe", pid))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
            
        (name, exe)
    }

    #[cfg(target_os = "windows")]
    {
        // Use tasklist to get the name
        let output = silent_command("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
            .output();
            
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Some(line) = stdout.lines().next() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim_matches('"')).collect();
                if parts.len() > 0 && !parts[0].is_empty() && !parts[0].starts_with("INFO:") {
                    return (parts[0].to_string(), "unknown".to_string());
                }
            }
        }
        ("unknown".to_string(), "unknown".to_string())
    }
}

#[tauri::command]
pub fn get_listening_processes(state: State<'_, AppState>) -> Result<Vec<ListeningProcess>, String> {
    let service_pids = if let Ok(pids) = state.process_pids.lock() {
        pids.clone()
    } else {
        HashMap::new()
    };

    // Create a reverse map for faster lookup: pid -> service_id
    let mut pid_to_service = HashMap::new();
    for (sid, pid) in service_pids {
        pid_to_service.insert(pid, sid);
    }

    #[cfg(target_os = "windows")]
    {
        // OPTIMIZACIÓN CRÍTICA: Obtener todos los procesos de una vez para evitar N ejecuciones de tasklist
        let mut process_names = HashMap::new();
        let tasklist_out = silent_command("tasklist")
            .args(["/NH", "/FO", "CSV"])
            .output();
        
        if let Ok(out) = tasklist_out {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim_matches('"')).collect();
                if parts.len() >= 2 {
                    if let Ok(pid) = parts[1].parse::<u32>() {
                        process_names.insert(pid, parts[0].to_string());
                    }
                }
            }
        }

        let mut cmd = silent_command("netstat");
        cmd.args(["-ano"]);
        
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
                let state_str = parts[3].to_uppercase();
                if state_str == "LISTENING" {
                    let pid: u32 = parts[4].parse().unwrap_or(0);
                    if pid > 0 {
                        // Usar el mapa precargado en lugar de llamar a resolve_process_info(pid)
                        let name = process_names.get(&pid).cloned().unwrap_or_else(|| "unknown".to_string());
                        let service_id = pid_to_service.get(&pid).cloned();
                        
                        rows.push(ListeningProcess {
                            proto: parts[0].to_string(),
                            local_address: parts[1].to_string(),
                            foreign_address: parts[2].to_string(),
                            state: parts[3].to_string(),
                            pid,
                            name,
                            path: "unknown".to_string(),
                            service_id,
                        });
                    }
                }
            }
        }
        Ok(rows)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Try ss first (works without root for current-user processes), then netstat
        let (output, use_ss) = StdCommand::new("ss")
            .args(["-tlnp"])
            .output()
            .map(|o| (o, true))
            .or_else(|_| StdCommand::new("netstat").args(["-tlnp"]).output().map(|o| (o, false)))
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Detect ss format: modern ss has Netid column → data rows start with "tcp"/"udp".
        // Older ss omits Netid → data rows start with "LISTEN".
        let ss_has_netid = use_ss && stdout.lines().any(|l| {
            let f = l.trim().split_whitespace().next().unwrap_or("");
            matches!(f, "tcp" | "tcp6" | "udp" | "udp6")
        });

        let mut rows = Vec::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with("Proto")
                || line.starts_with("State")
                || line.starts_with("Netid")
                || line.starts_with("Local")
                || line.starts_with("Active")
            {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();

            let (proto, local, foreign, pid) = if use_ss && ss_has_netid {
                // Modern ss: tcp LISTEN Recv-Q Send-Q Local:Port Peer:Port [Process]
                // indices:   [0] [1]    [2]    [3]    [4]        [5]       [6..]
                if parts.len() < 6 { continue; }
                let pid = parts.get(6..).map(|p| p.join(" ")).and_then(|s| {
                    let idx = s.find("pid=")?;
                    let rest = &s[idx + 4..];
                    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
                    rest[..end].parse::<u32>().ok()
                }).unwrap_or(0);
                (parts[0].to_string(), parts[4].to_string(), parts[5].to_string(), pid)
            } else if use_ss {
                // Older ss (no Netid): LISTEN Recv-Q Send-Q Local:Port Peer:Port [Process]
                // indices:             [0]    [1]    [2]    [3]        [4]       [5..]
                if parts.len() < 5 { continue; }
                let pid = parts.get(5..).map(|p| p.join(" ")).and_then(|s| {
                    let idx = s.find("pid=")?;
                    let rest = &s[idx + 4..];
                    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
                    rest[..end].parse::<u32>().ok()
                }).unwrap_or(0);
                ("tcp".to_string(), parts[3].to_string(), parts[4].to_string(), pid)
            } else {
                // netstat -tlnp: Proto Recv-Q Send-Q Local Foreign State [PID/Prog]
                // indices:       [0]   [1]    [2]    [3]   [4]     [5]   [6]
                if parts.len() < 4 { continue; }
                let pid = parts.get(6)
                    .and_then(|s| s.split('/').next())
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(0);
                let foreign = parts.get(4).map(|s| s.to_string()).unwrap_or_default();
                (parts[0].to_string(), parts[3].to_string(), foreign, pid)
            };

            let (name, path) = if pid > 0 {
                resolve_process_info(pid)
            } else {
                ("unknown".to_string(), "unknown".to_string())
            };

            let service_id = if pid > 0 { pid_to_service.get(&pid).cloned() } else { None };

            rows.push(ListeningProcess {
                proto,
                local_address: local,
                foreign_address: foreign,
                state: "LISTEN".to_string(),
                pid,
                name,
                path,
                service_id,
            });
        }
        Ok(rows)
    }
}

/// Mata un proceso por PID (taskkill en Windows, kill -9 en Unix).
#[tauri::command]
pub fn kill_process_by_pid(pid: u32) -> Result<(), String> {
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

// ─── Ejecución de servicios ───────────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub service_id: String,
    pub line: String,
    pub is_error: bool,
}

#[tauri::command]
pub async fn execute_service_script(
    app: AppHandle,
    state: State<'_, AppState>,
    service_id: String,
    project_path: String,
    script: String,
    env_vars_json: String,
    _script_display: Option<String>,
    use_vite_wrapper: Option<bool>,
    vite_wrapper_remotes: Option<HashMap<String, String>>,
    vite_wrapper_base: Option<String>,
    vite_wrapper_sourcemap: Option<bool>,
    vite_wrapper_host: Option<String>,
    custom_java_home: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&project_path);
    let mut script_to_run = script.clone();
    if use_vite_wrapper == Some(true) {
        if let Some(ref remotes) = vite_wrapper_remotes {
            if !remotes.is_empty() && path.is_dir() && find_vite_config(path).is_some() {
                if let Ok(wrapper_name) = generate_vite_wrapper(path, remotes, vite_wrapper_base.as_deref(), vite_wrapper_sourcemap, vite_wrapper_host.as_deref()) {
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

    let mut envs: HashMap<String, String> = serde_json::from_str(&env_vars_json).unwrap_or_default();

    // Inyectar JAVA_HOME si se proporciona
    if let Some(java_home) = custom_java_home {
        envs.insert("JAVA_HOME".to_string(), java_home.clone());
        
        let java_bin = Path::new(&java_home).join("bin");
        let java_bin_str = java_bin.to_string_lossy().to_string();

        let current_path = std::env::var("PATH").unwrap_or_default();
        let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
        let new_path = format!("{}{}{}", java_bin_str, separator, current_path);
        envs.insert("PATH".to_string(), new_path);
    }

    // Limpiar el archivo de logs antes de empezar una nueva ejecución
    let log_path = get_service_log_path(&service_id);
    let _ = fs::remove_file(&log_path);

    // Log the final command (after vite wrapper substitution, if any)
    {
        let colored_cmd = format!("\x1b[1;36m[CMD]\x1b[0m \x1b[1;32m{}\x1b[0m", script_to_run);
        append_to_service_log_async(service_id.clone(), colored_cmd.clone()).await;
        let _ = app.emit(
            "service-logs",
            LogEvent {
                service_id: service_id.clone(),
                line: colored_cmd,
                is_error: false,
            },
        );
    }

    #[cfg(target_os = "windows")]
    let mut cmd = AsyncCommand::new("cmd");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.args(["/C", &script_to_run]).creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    let mut cmd = AsyncCommand::new("sh");
    #[cfg(not(target_os = "windows"))]
    {
        cmd.args(["-c", &script_to_run]);
        // Put the child in its own process group so we can kill the whole tree later
        cmd.process_group(0);
    }

    cmd.current_dir(&project_path)
        .envs(envs)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let notify = Arc::new(tokio::sync::Notify::new());
    let child_pid = child.id().unwrap_or(0);

    {
        let mut processes = state.processes.lock().await;
        processes.insert(service_id.clone(), notify.clone());
    }
    if child_pid > 0 {
        if let Ok(mut pids) = state.process_pids.lock() {
            pids.insert(service_id.clone(), child_pid);
        }
    }

    let app_clone = app.clone();
    let service_id_clone = service_id.clone();
    let notify_clone = notify.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut buf = Vec::new();
            tokio::select! {
                _ = notify_clone.notified() => break,
                result = reader.read_until(b'\n', &mut buf) => {
                    match result {
                        Ok(0) => break, // EOF
                        Ok(_) => {
                            while buf.last() == Some(&b'\n') || buf.last() == Some(&b'\r') { buf.pop(); }
                            let l = String::from_utf8_lossy(&buf).to_string();
                            append_to_service_log_async(service_id_clone.clone(), l.clone()).await;
                            let _ = app_clone.emit("service-logs", LogEvent {
                                service_id: service_id_clone.clone(),
                                line: l,
                                is_error: false,
                            });
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    let app_clone_err = app.clone();
    let service_id_clone_err = service_id.clone();
    let notify_clone_err = notify.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut buf = Vec::new();
            tokio::select! {
                _ = notify_clone_err.notified() => break,
                result = reader.read_until(b'\n', &mut buf) => {
                    match result {
                        Ok(0) => break, // EOF
                        Ok(_) => {
                            while buf.last() == Some(&b'\n') || buf.last() == Some(&b'\r') { buf.pop(); }
                            let l = String::from_utf8_lossy(&buf).to_string();
                            append_to_service_log_async(service_id_clone_err.clone(), l.clone()).await;
                            let _ = app_clone_err.emit("service-logs", LogEvent {
                                service_id: service_id_clone_err.clone(),
                                line: l,
                                is_error: true,
                            });
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    let app_wait = app.clone();
    let service_id_wait = service_id.clone();
    let notify_wait = notify.clone();
    tokio::spawn(async move {
        tokio::select! {
            _ = notify_wait.notified() => {
                #[cfg(target_os = "windows")]
                {
                    if let Some(pid) = child.id() {
                        let mut kill_cmd = std::process::Command::new("taskkill");
                        kill_cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
                        {
                            use std::os::windows::process::CommandExt;
                            kill_cmd.creation_flags(0x08000000);
                        }
                        let _ = kill_cmd.output();
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    if let Some(pid) = child.id() {
                        use nix::sys::signal::{kill, Signal};
                        use nix::unistd::Pid;
                        // SIGTERM first (graceful), then wait, then SIGKILL the whole tree
                        kill_tree_unix(pid, Signal::SIGTERM);
                        tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
                        kill_tree_unix(pid, Signal::SIGKILL);
                        // Also SIGKILL the direct shell in case it escaped
                        let _ = kill(Pid::from_raw(pid as i32), Signal::SIGKILL);
                    }
                }
                let _ = child.kill().await;
                let app_state = app_wait.state::<crate::AppState>();
                if let Ok(mut pids) = app_state.process_pids.lock() {
                    pids.remove(&service_id_wait);
                };
            }
            _ = child.wait() => {
                // Process completed naturally — notify frontend so it can update status
                let app_state = app_wait.state::<crate::AppState>();
                {
                    let mut procs = app_state.processes.lock().await;
                    procs.remove(&service_id_wait);
                }
                if let Ok(mut pids) = app_state.process_pids.lock() {
                    pids.remove(&service_id_wait);
                }
                let _ = app_wait.emit("service-stopped", service_id_wait);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn kill_service(state: State<'_, AppState>, service_id: String) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    if let Some(notify) = processes.remove(&service_id) {
        notify.notify_waiters();
    }
    Ok(())
}

#[tauri::command]
pub async fn kill_all_services(state: State<'_, AppState>) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    for notify in processes.values() {
        notify.notify_waiters();
    }
    processes.clear();
    Ok(())
}

// Helpers de lectura/escritura de archivos que usa el frontend.

#[tauri::command]
pub fn list_diagram_files(path: String) -> Result<Vec<String>, String> {
    let diag_dir = Path::new(&path);
    if !diag_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(diag_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".mmd") || name.ends_with(".mermaid") {
                files.push(name);
            }
        }
    }
    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn read_file_content(base: String, file: String) -> Result<String, String> {
    let path = Path::new(&base).join(&file);
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Lee un archivo por ruta absoluta (p. ej. la devuelta por el diálogo de selección).
#[tauri::command]
pub fn read_file_at_path(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ensure_directory(base: String, path: String) -> Result<(), String> {
    let full_path = Path::new(&base).join(&path);
    println!("[ensure_directory] Creating: {:?}", full_path);
    fs::create_dir_all(full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_content(base: String, file: String, content: String) -> Result<(), String> {
    let path = Path::new(&base).join(&file);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

