use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command as StdCommand;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as AsyncCommand;

use crate::proxy::{find_vite_config, generate_vite_wrapper};
use crate::AppState;

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
pub struct ListeningProcess {
    pub proto: String,
    pub local_address: String,
    pub foreign_address: String,
    pub state: String,
    pub pid: u32,
}

#[tauri::command]
pub fn get_listening_processes() -> Result<Vec<ListeningProcess>, String> {
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

            rows.push(ListeningProcess {
                proto,
                local_address: local,
                foreign_address: foreign,
                state: "LISTEN".to_string(),
                pid,
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

    // Log the final command (after vite wrapper substitution, if any)
    {
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
            }
            _ = child.wait() => {
                // Process completed naturally — notify frontend so it can update status
                let app_state = app_wait.state::<crate::AppState>();
                {
                    let mut procs = app_state.processes.lock().await;
                    procs.remove(&service_id_wait);
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
pub fn write_file_content(base: String, file: String, content: String) -> Result<(), String> {
    let path = Path::new(&base).join(&file);
    fs::write(path, content).map_err(|e| e.to_string())
}

