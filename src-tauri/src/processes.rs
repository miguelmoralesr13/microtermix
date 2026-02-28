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
    script_display: Option<String>,
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
    cmd.args(["-c", &script_to_run]);

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

