use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::os_utils::silent_async_command;
use crate::proxy::{find_vite_config, generate_vite_wrapper};
use crate::state::{AppState, TrackedProcess};
use crate::services::logs::{get_service_log_path, BufferedLogWriter, LogEvent};
use crate::system::process_killer::kill_tree_unix;

/// Executes a project script as an async child process, streaming logs via Tauri events.
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

    // Vite wrapper injection
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

    // Build environment
    let mut envs: HashMap<String, String> = serde_json::from_str(&env_vars_json).unwrap_or_default();

    if let Some(java_home) = custom_java_home {
        envs.insert("JAVA_HOME".to_string(), java_home.clone());
        let java_bin = Path::new(&java_home).join("bin");
        let java_bin_str = java_bin.to_string_lossy().to_string();
        let current_path = std::env::var("PATH").unwrap_or_default();
        let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
        let new_path = format!("{}{}{}", java_bin_str, separator, current_path);
        envs.insert("PATH".to_string(), new_path);
    }

    // Clear log file before new execution
    let log_path = get_service_log_path(&service_id);
    let _ = fs::remove_file(&log_path);

    // Create buffered log writer
    let log_writer = Arc::new(BufferedLogWriter::new(service_id.clone()));

    // Log the command
    {
        let colored_cmd = format!("\x1b[1;36m[CMD]\x1b[0m \x1b[1;32m{}\x1b[0m", script_to_run);
        log_writer.send(colored_cmd.clone());
        let _ = app.emit(
            "service-logs",
            LogEvent {
                service_id: service_id.clone(),
                line: colored_cmd,
                is_error: false,
            },
        );
    }

    // Spawn the child process
    #[cfg(target_os = "windows")]
    let mut cmd = silent_async_command("cmd");
    #[cfg(target_os = "windows")]
    {
        cmd.args(["/C", &script_to_run]);
    }

    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if Path::new("/bin/zsh").exists() { "/bin/zsh".to_string() } else { "sh".to_string() }
    });
    #[cfg(not(target_os = "windows"))]
    let mut cmd = silent_async_command(&shell);
    #[cfg(not(target_os = "windows"))]
    {
        cmd.args(["-c", &script_to_run]);
        cmd.process_group(0);
    }

    cmd.current_dir(&project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    for (k, v) in envs {
        cmd.env(k, v);
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let child_pid = child.id().unwrap_or(0);

    crate::app_logs::log_info("Executor", &format!("Spawned service [{}] with PID: {}", service_id, child_pid));

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let notify = Arc::new(tokio::sync::Notify::new());

    // Atomic process tracking: single struct with notify + pid
    {
        let mut processes = state.processes.lock().await;
        processes.insert(service_id.clone(), TrackedProcess {
            notify: notify.clone(),
            pid: child_pid,
            started_at: std::time::Instant::now(),
        });
    }

    // Stdout reader task
    let app_clone = app.clone();
    let service_id_clone = service_id.clone();
    let notify_clone = notify.clone();
    let log_writer_stdout = log_writer.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut buf = Vec::new();
            tokio::select! {
                _ = notify_clone.notified() => break,
                result = reader.read_until(b'\n', &mut buf) => {
                    match result {
                        Ok(0) => break,
                        Ok(_) => {
                            while buf.last() == Some(&b'\n') || buf.last() == Some(&b'\r') { buf.pop(); }
                            let l = String::from_utf8_lossy(&buf).to_string();
                            log_writer_stdout.send(l.clone());
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

    // Stderr reader task
    let app_clone_err = app.clone();
    let service_id_clone_err = service_id.clone();
    let notify_clone_err = notify.clone();
    let log_writer_stderr = log_writer.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut buf = Vec::new();
            tokio::select! {
                _ = notify_clone_err.notified() => break,
                result = reader.read_until(b'\n', &mut buf) => {
                    match result {
                        Ok(0) => break,
                        Ok(_) => {
                            while buf.last() == Some(&b'\n') || buf.last() == Some(&b'\r') { buf.pop(); }
                            let l = String::from_utf8_lossy(&buf).to_string();
                            log_writer_stderr.send(l.clone());
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

    // Wait for process exit or kill signal
    let app_wait = app.clone();
    let service_id_wait = service_id.clone();
    let notify_wait = notify.clone();

    tokio::spawn(async move {
        tokio::select! {
            _ = notify_wait.notified() => {
                #[cfg(target_os = "windows")]
                {
                    if let Some(pid) = child.id() {
                        let mut kill_cmd = silent_async_command("taskkill");
                        kill_cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
                        let _ = kill_cmd.status();
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    if let Some(pid) = child.id() {
                        use nix::sys::signal::Signal;
                        kill_tree_unix(pid, Signal::SIGTERM);
                        tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
                        kill_tree_unix(pid, Signal::SIGKILL);
                        use nix::sys::signal::kill;
                        use nix::unistd::Pid;
                        let _ = kill(Pid::from_raw(pid as i32), Signal::SIGKILL);
                    }
                }
                let _ = child.kill().await;
            }
            _ = child.wait() => {
                // Process completed naturally
                let app_state = app_wait.state::<AppState>();
                let mut procs = app_state.processes.lock().await;
                procs.remove(&service_id_wait);
                let _ = app_wait.emit("service-stopped", service_id_wait);
            }
        }
    });

    Ok(())
}

/// Signals a running service to terminate.
#[tauri::command]
pub async fn kill_service(state: State<'_, AppState>, service_id: String) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    if let Some(tracked) = processes.remove(&service_id) {
        tracked.notify.notify_waiters();
    }
    Ok(())
}

/// Signals all running services to terminate.
#[tauri::command]
pub async fn kill_all_services(state: State<'_, AppState>) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    for tracked in processes.values() {
        tracked.notify.notify_waiters();
    }
    processes.clear();
    Ok(())
}

/// Runs a one-off command, streams output via `task-log:{id}` events, returns exit code.
#[tauri::command]
pub async fn execute_ephemeral_task(
    app: AppHandle,
    project_path: String,
    command: String,
    task_id: String,
) -> Result<i32, String> {
    use std::path::Path;
    let log_event = format!("task-log:{}", task_id);
    let finish_event = format!("task-finished:{}", task_id);

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = silent_async_command("cmd");
        c.args(["/c", &command]);
        c
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if Path::new("/bin/zsh").exists() { "/bin/zsh".to_string() } else { "sh".to_string() }
        });
        let mut c = silent_async_command(&shell);
        c.args(["-c", &command]);
        #[cfg(not(target_os = "windows"))]
        c.process_group(0);
        c
    };

    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("Fallo al iniciar tarea: {}", e))?;
    let child_pid = child.id().unwrap_or(0);
    crate::app_logs::log_info("Executor", &format!("Spawned ephemeral task with PID: {}", child_pid));

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_stdout = app.clone();
    let log_ev_stdout = log_event.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 { break; }
            let _ = app_stdout.emit(&log_ev_stdout, format!("{}\r", line));
            line.clear();
        }
    });

    let app_stderr = app.clone();
    let log_ev_stderr = log_event.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 { break; }
            let _ = app_stderr.emit(&log_ev_stderr, format!("\x1b[33m{}\x1b[0m\r", line));
            line.clear();
        }
    });

    let status = child.wait().await.map_err(|e: std::io::Error| e.to_string())?;
    let exit_code = status.code().unwrap_or(0);
    let _ = app.emit(&finish_event, exit_code);
    Ok(exit_code)
}

/// Checks if semgrep is installed.
#[tauri::command]
pub async fn check_semgrep_installed() -> Result<bool, String> {
    let mut cmd = silent_async_command(if cfg!(target_os = "windows") { "cmd" } else { "sh" });

    if cfg!(target_os = "windows") {
        cmd.args(["/c", "semgrep --version"]);
    } else {
        if let Ok(home) = std::env::var("HOME") {
            let local_bin = format!("{}/.local/bin", home);
            if let Ok(current_path) = std::env::var("PATH") {
                cmd.env("PATH", format!("{}:{}", local_bin, current_path));
            } else {
                cmd.env("PATH", local_bin);
            }
        }
        cmd.args(["-c", "semgrep --version"]);
    }

    match cmd.output().await {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

/// Runs a semgrep security scan.
#[tauri::command]
pub async fn run_semgrep_scan(
    app: AppHandle,
    project_path: String,
    config_path: Option<String>
) -> Result<String, String> {
    let mut args = vec!["scan".to_string(), "--json".to_string(), "--quiet".to_string()];

    if let Some(cfg) = config_path {
        if !cfg.is_empty() {
            args.push("--config".to_string());
            args.push(cfg);
        }
    }

    let mut cmd = silent_async_command("semgrep");

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let local_bin = format!("{}/.local/bin", home);
            if let Ok(current_path) = std::env::var("PATH") {
                cmd.env("PATH", format!("{}:{}", local_bin, current_path));
            } else {
                cmd.env("PATH", local_bin);
            }
        }
    }

    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Fallo al iniciar Semgrep: {}", e))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_handle = app.clone();
    let mut json_output = String::new();

    let mut reader = BufReader::new(stdout).lines();
    let mut err_reader = BufReader::new(stderr).lines();

    loop {
        tokio::select! {
            result = reader.next_line() => {
                match result {
                    Ok(Some(line)) => {
                        json_output.push_str(&line);
                        let _ = app_handle.emit("semgrep-log", line);
                    }
                    _ => { break; }
                }
            }
            result = err_reader.next_line() => {
                if let Ok(Some(line)) = result {
                    let _ = app_handle.emit("semgrep-log", format!("PROG: {}", line));
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() || !json_output.is_empty() {
        Ok(json_output)
    } else {
        Err("Semgrep terminó con error y sin salida JSON.".into())
    }
}
