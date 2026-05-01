use serde::{Deserialize, Serialize};
use reqwest;

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct Ec2Credentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

pub async fn aws_config(c: &Ec2Credentials) -> aws_config::SdkConfig {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        token,
        None,
        "microtermix",
    );
    aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await
}

async fn ec2_client(c: &Ec2Credentials) -> aws_sdk_ec2::Client {
    let cfg = aws_config(c).await;
    aws_sdk_ec2::Client::new(&cfg)
}

// ── Response types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct Ec2Tag {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Ec2Instance {
    pub instance_id: String,
    pub name: Option<String>,
    pub state: String,          // pending | running | stopping | stopped | terminated | shutting-down
    pub state_code: i32,
    pub instance_type: String,
    pub public_ip: Option<String>,
    pub private_ip: Option<String>,
    pub key_name: Option<String>,
    pub launch_time: Option<String>,
    pub availability_zone: Option<String>,
    pub image_id: Option<String>,
    pub platform: Option<String>,   // "windows" or None (Linux/Other)
    pub vpc_id: Option<String>,
    pub subnet_id: Option<String>,
    pub tags: Vec<Ec2Tag>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn opt_str(s: Option<&str>) -> Option<String> {
    s.map(|v| v.to_string())
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ec2_list_instances(
    credentials: Ec2Credentials,
) -> Result<Vec<Ec2Instance>, String> {
    let client = ec2_client(&credentials).await;

    let resp = client
        .describe_instances()
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut instances: Vec<Ec2Instance> = Vec::new();

    for reservation in resp.reservations() {
        for inst in reservation.instances() {
            let instance_id = inst.instance_id().unwrap_or_default().to_string();

            let tags: Vec<Ec2Tag> = inst
                .tags()
                .iter()
                .map(|t| Ec2Tag {
                    key: t.key().unwrap_or_default().to_string(),
                    value: t.value().unwrap_or_default().to_string(),
                })
                .collect();

            let name = tags
                .iter()
                .find(|t| t.key == "Name")
                .map(|t| t.value.clone());

            let state = inst
                .state()
                .and_then(|s| s.name())
                .map(|n| n.as_str().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let state_code = inst
                .state()
                .and_then(|s| s.code())
                .unwrap_or(0);

            let instance_type = inst
                .instance_type()
                .map(|t| t.as_str().to_string())
                .unwrap_or_default();

            let launch_time = inst
                .launch_time()
                .map(|t| t.to_string());

            let availability_zone = inst
                .placement()
                .and_then(|p| p.availability_zone())
                .map(|z| z.to_string());

            let platform = inst
                .platform()
                .map(|p| p.as_str().to_string());

            instances.push(Ec2Instance {
                instance_id,
                name,
                state,
                state_code,
                instance_type,
                public_ip: opt_str(inst.public_ip_address()),
                private_ip: opt_str(inst.private_ip_address()),
                key_name: opt_str(inst.key_name()),
                launch_time,
                availability_zone,
                image_id: opt_str(inst.image_id()),
                platform,
                vpc_id: opt_str(inst.vpc_id()),
                subnet_id: opt_str(inst.subnet_id()),
                tags,
            });
        }
    }

    // Sort: running first, then by name
    instances.sort_by(|a, b| {
        let running_a = if a.state == "running" { 0 } else { 1 };
        let running_b = if b.state == "running" { 0 } else { 1 };
        running_a.cmp(&running_b).then_with(|| {
            let na = a.name.as_deref().unwrap_or(&a.instance_id);
            let nb = b.name.as_deref().unwrap_or(&b.instance_id);
            na.cmp(nb)
        })
    });

    Ok(instances)
}

#[tauri::command]
pub async fn ec2_start_instance(
    credentials: Ec2Credentials,
    instance_id: String,
) -> Result<String, String> {
    let client = ec2_client(&credentials).await;
    client
        .start_instances()
        .instance_ids(&instance_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Starting {}", instance_id))
}

#[tauri::command]
pub async fn ec2_stop_instance(
    credentials: Ec2Credentials,
    instance_id: String,
) -> Result<String, String> {
    let client = ec2_client(&credentials).await;
    client
        .stop_instances()
        .instance_ids(&instance_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Stopping {}", instance_id))
}

#[tauri::command]
pub async fn ec2_reboot_instance(
    credentials: Ec2Credentials,
    instance_id: String,
) -> Result<String, String> {
    let client = ec2_client(&credentials).await;
    client
        .reboot_instances()
        .instance_ids(&instance_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Rebooting {}", instance_id))
}

/// Spawns an interactive process (e.g. SSH / aws ssm) with stdin/stdout/stderr piped.
/// Output is streamed as `service-logs` events. Stdin can be sent via `write_stdin_line`.
/// Uses the same `service-logs` / `service-stopped` event protocol as `execute_service_script`.
#[tauri::command]
pub async fn spawn_interactive(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    command: String,
    envs: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::process::Command as AsyncCommand;
    use tokio::sync::mpsc;
    use std::process::Stdio;
    use std::sync::Arc;

    // Clone Arcs before any await so they can be moved into tasks
    let procs_arc = state.processes.clone();
    let stdins_arc = state.stdin_senders.clone();

    // Kill any existing session with the same id
    {
        let mut procs = procs_arc.lock().await;
        if let Some(tracked) = procs.remove(&service_id) {
            tracked.notify.notify_waiters();
        }
    }
    {
        let mut senders = stdins_arc.lock().await;
        senders.remove(&service_id);
    }

    // Emit the command line so the terminal shows what was run
    let _ = app.emit("service-logs", crate::LogEvent {
        service_id: service_id.clone(),
        line: format!("[SSH] {}", command),
        is_error: false,
    });

    #[cfg(target_os = "windows")]
    let mut cmd = {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        let mut c = AsyncCommand::new("cmd");
        c.arg("/C").raw_arg(&command).creation_flags(0x08000000);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = AsyncCommand::new("sh");
        c.args(["-c", &command]);
        c.process_group(0);
        c
    };

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(env_map) = envs {
        cmd.envs(env_map);
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdin_handle = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // Channel: frontend sends lines → we write to child stdin
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    {
        let mut senders = stdins_arc.lock().await;
        senders.insert(service_id.clone(), tx);
    }

    // Stdin writer task
    tokio::spawn(async move {
        let mut stdin_handle = stdin_handle;
        while let Some(line) = rx.recv().await {
            let with_newline = format!("{}\n", line);
            if stdin_handle.write_all(with_newline.as_bytes()).await.is_err() {
                break;
            }
        }
    });

    let notify = Arc::new(tokio::sync::Notify::new());
    let child_pid = child.id().unwrap_or(0);
    {
        let mut procs = procs_arc.lock().await;
        procs.insert(service_id.clone(), crate::state::TrackedProcess {
            notify: notify.clone(),
            pid: child_pid,
            started_at: std::time::Instant::now(),
        });
    }

    // Stdout reader task
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    line = reader.next_line() => match line {
                        Ok(Some(l)) => { let _ = app2.emit("service-logs", crate::LogEvent { service_id: sid.clone(), line: l, is_error: false }); }
                        _ => break,
                    }
                }
            }
        });
    }

    // Stderr reader task
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    line = reader.next_line() => match line {
                        Ok(Some(l)) => { let _ = app2.emit("service-logs", crate::LogEvent { service_id: sid.clone(), line: l, is_error: true }); }
                        _ => break,
                    }
                }
            }
        });
    }

    // Wait / cleanup task
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            tokio::select! {
                _ = n.notified() => {
                    #[cfg(not(target_os = "windows"))]
                    if let Some(pid) = child.id() {
                        use nix::sys::signal::Signal;
                        crate::system::process_killer::kill_tree_unix(pid, Signal::SIGTERM);
                        tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
                        crate::system::process_killer::kill_tree_unix(pid, Signal::SIGKILL);
                    }
                    let _ = child.kill().await;
                }
                _ = child.wait() => {
                    procs_arc.lock().await.remove(&sid);
                    stdins_arc.lock().await.remove(&sid);
                    let _ = app2.emit("service-stopped", sid);
                }
            }
        });
    }

    Ok(())
}

/// Spawns a process directly bypasses shell completely (no cmd /C or sh -c).
/// This is perfect for programs that take complex arguments like JSON (e.g. session-manager-plugin)
/// which would otherwise be mangled by cmd.exe's quoting rules on Windows.
#[allow(dead_code)]
pub async fn spawn_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    program: String,
    args: Vec<String>,
    envs: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::process::Command as AsyncCommand;
    use tokio::sync::mpsc;
    use std::process::Stdio;

    let procs_arc = state.processes.clone();
    let stdins_arc = state.stdin_senders.clone();

    // Kill any existing session with the same id
    {
        let mut procs = procs_arc.lock().await;
        if let Some(tracked) = procs.remove(&service_id) {
            tracked.notify.notify_waiters();
        }
    }
    {
        let mut senders = stdins_arc.lock().await;
        senders.remove(&service_id);
    }

    let _ = app.emit("service-logs", crate::LogEvent {
        service_id: service_id.clone(),
        line: format!("[Process] {} {}", program, args.join(" ")),
        is_error: false,
    });

    let mut cmd = AsyncCommand::new(&program);
    cmd.args(&args);

    #[cfg(not(target_os = "windows"))]
    {
        cmd.process_group(0);
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(env_map) = envs {
        cmd.envs(env_map);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn {}: {}", program, e))?;

    let stdin_handle = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    {
        let mut senders = stdins_arc.lock().await;
        senders.insert(service_id.clone(), tx);
    }

    let notify = std::sync::Arc::new(tokio::sync::Notify::new());
    let child_pid = child.id().unwrap_or(0);
    procs_arc.lock().await.insert(service_id.clone(), crate::state::TrackedProcess {
        notify: notify.clone(),
        pid: child_pid,
        started_at: std::time::Instant::now(),
    });

    // Stdin writer task — xterm.js sends \r for Enter, so we pass raw bytes as-is
    {
        let n = notify.clone();
        let mut handle = stdin_handle;
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    data_opt = rx.recv() => match data_opt {
                        Some(data) => {
                            if handle.write_all(data.as_bytes()).await.is_err() { break; }
                            if handle.flush().await.is_err() { break; }
                        }
                        None => break,
                    }
                }
            }
        });
    }

    // Stdout reader — read raw byte chunks and emit as pty-output
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut buf = vec![0u8; 4096];
            let mut stdout = stdout;
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    result = stdout.read(&mut buf) => match result {
                        Ok(0) | Err(_) => break,
                        Ok(n_bytes) => {
                            let chunk = String::from_utf8_lossy(&buf[..n_bytes]).to_string();
                            let _ = app2.emit("pty-output", serde_json::json!({
                                "serviceId": sid,
                                "data": chunk,
                            }));
                        }
                    }
                }
            }
        });
    }

    // Stderr reader — merge into same pty-output stream
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut buf = vec![0u8; 4096];
            let mut stderr = stderr;
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    result = stderr.read(&mut buf) => match result {
                        Ok(0) | Err(_) => break,
                        Ok(n_bytes) => {
                            let chunk = String::from_utf8_lossy(&buf[..n_bytes]).to_string();
                            let _ = app2.emit("pty-output", serde_json::json!({
                                "serviceId": sid,
                                "data": chunk,
                            }));
                        }
                    }
                }
            }
        });
    }

    // Wait / cleanup task
    {
        let app2 = app.clone();
        let sid = service_id.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            tokio::select! {
                _ = n.notified() => {
                    #[cfg(not(target_os = "windows"))]
                    if let Some(pid) = child.id() {
                        use nix::sys::signal::Signal;
                        crate::system::process_killer::kill_tree_unix(pid, Signal::SIGTERM);
                        tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
                        crate::system::process_killer::kill_tree_unix(pid, Signal::SIGKILL);
                    }
                    let _ = child.kill().await;
                }
                _ = child.wait() => {
                    procs_arc.lock().await.remove(&sid);
                    stdins_arc.lock().await.remove(&sid);
                    let _ = app2.emit("service-stopped", sid);
                }
            }
        });
    }

    Ok(())
}


/// Spawns a process inside a PTY (pseudo-terminal) so the child sees a real
/// terminal — critical for programs like `session-manager-plugin` that check
/// whether stdin is a console before enabling raw-mode input.
///
/// Output is emitted as `pty-output` events (same as `spawn_process`).
/// Input is sent via `write_stdin_line` (same channel key = service_id).
pub async fn spawn_pty_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    envs: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use tauri::Emitter;
    use tokio::sync::mpsc;

    let procs_arc    = state.processes.clone();
    let stdins_arc   = state.stdin_senders.clone();
    let resizers_arc = state.pty_resizers.clone();

    // Kill any existing session with the same id
    {
        let mut procs = procs_arc.lock().await;
        if let Some(tracked) = procs.remove(&service_id) { tracked.notify.notify_waiters(); }
    }
    stdins_arc.lock().await.remove(&service_id);
    resizers_arc.lock().await.remove(&service_id);

    // Open PTY with a sane default — will be resized immediately by the frontend
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("PTY open failed: {e}"))?;

    // Build the command (portable-pty uses its own CommandBuilder)
    let mut cmd = CommandBuilder::new(&program);
    if let Some(ref d) = cwd {
        cmd.cwd(d);
    }
    for arg in &args {
        cmd.arg(arg);
    }
    if let Some(ref env_map) = envs {
        for (k, v) in env_map {
            cmd.env(k, v);
        }
    }

    // Spawn child inside the PTY slave
    let mut child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn {program}: {e}"))?;

    // IMPORTANT: Do NOT drop pair.slave yet.
    // On Windows (ConPTY), dropping the slave calls ClosePseudoConsole which
    // sends CTRL_CLOSE_EVENT to the child and makes it exit immediately.
    // We keep the slave alive and drop it only after the child exits.
    let slave = pair.slave;

    // ── stdin forwarding ──────────────────────────────────────────────────────
    // tokio channel → std sync channel → dedicated OS thread writes to PTY master
    let (async_tx, mut async_rx) = mpsc::unbounded_channel::<String>();
    stdins_arc.lock().await.insert(service_id.clone(), async_tx);

    let (sync_tx, sync_rx) = std::sync::mpsc::channel::<String>();

    // Bridge: async tokio receiver → sync std sender
    tokio::spawn(async move {
        while let Some(data) = async_rx.recv().await {
            if sync_tx.send(data).is_err() { break; }
        }
    });

    // Blocking OS thread: std receiver → PTY master write
    let pty_writer = pair.master.take_writer()
        .map_err(|e| format!("PTY writer error: {e}"))?;
    std::thread::spawn(move || {
        use std::io::Write;
        let mut w = pty_writer;
        for data in sync_rx {
            if w.write_all(data.as_bytes()).is_err() || w.flush().is_err() { break; }
        }
    });

    // ── PTY resize handler ────────────────────────────────────────────────────
    // Frontend sends (rows, cols) via resize_pty; we forward to the master.
    let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<(u16, u16)>();
    resizers_arc.lock().await.insert(service_id.clone(), resize_tx);

    let pty_reader = pair.master.try_clone_reader()
        .map_err(|e| format!("PTY reader error: {e}"))?;

    // Move master into a blocking thread that handles resize commands
    let master = pair.master;
    let (resize_sync_tx, resize_sync_rx) = std::sync::mpsc::channel::<(u16, u16)>();
    tokio::spawn(async move {
        while let Some(size) = resize_rx.recv().await {
            if resize_sync_tx.send(size).is_err() { break; }
        }
    });
    std::thread::spawn(move || {
        for (rows, cols) in resize_sync_rx {
            let _ = master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
        }
    });

    // ── stdout reader (PTY master → pty-output events) ────────────────────────
    let notify = std::sync::Arc::new(tokio::sync::Notify::new());
    procs_arc.lock().await.insert(service_id.clone(), crate::state::TrackedProcess {
        notify: notify.clone(),
        pid: 0, // PTY process — no direct PID
        started_at: std::time::Instant::now(),
    });

    {
        let app2  = app.clone();
        let sid   = service_id.clone();
        let stop  = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stop2 = stop.clone();
        let n     = notify.clone();

        // PTY read is blocking — run in a dedicated OS thread
        std::thread::spawn(move || {
            use std::io::Read;
            let mut r = pty_reader;
            let mut buf = vec![0u8; 4096];
            loop {
                if stop2.load(std::sync::atomic::Ordering::Relaxed) { break; }
                match r.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n_bytes) => {
                        let chunk = String::from_utf8_lossy(&buf[..n_bytes]).to_string();
                        let _ = app2.emit("pty-output", serde_json::json!({
                            "serviceId": sid,
                            "data": chunk,
                        }));
                    }
                }
            }
        });

        // Signal the reader thread to stop on kill
        tokio::spawn(async move {
            n.notified().await;
            stop.store(true, std::sync::atomic::Ordering::Relaxed);
        });
    }

    // ── wait / cleanup ────────────────────────────────────────────────────────
    // portable_pty::Child::kill() and wait() both take &mut self, so we can't
    // call them concurrently.  Poll try_wait() in a blocking thread and check
    // an AtomicBool set by the kill-notify watcher.
    // The slave is moved here and dropped AFTER the child exits — this ensures
    // ClosePseudoConsole is called only after the process has terminated.
    {
        let app2    = app.clone();
        let sid     = service_id.clone();
        let killed  = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let killed2 = killed.clone();

        // Async watcher: when notify fires, set the flag
        let n = notify.clone();
        tokio::spawn(async move {
            n.notified().await;
            killed2.store(true, std::sync::atomic::Ordering::Relaxed);
        });

        // Blocking poller: checks flag + try_wait, drops slave, then cleans up
        tokio::task::spawn_blocking(move || {
            let rt       = tokio::runtime::Handle::current();
            let _slave   = slave; // dropped at end of this block (after child exits)
            loop {
                if killed.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = child.kill();
                    break;
                }
                match child.try_wait() {
                    Ok(Some(_)) | Err(_) => break,
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
                }
            }
            drop(_slave); // ClosePseudoConsole now safe — child has exited
            rt.block_on(async {
                procs_arc.lock().await.remove(&sid);
                stdins_arc.lock().await.remove(&sid);
                resizers_arc.lock().await.remove(&sid);
                let _ = app2.emit("service-stopped", sid);
            });
        });
    }

    Ok(())
}

/// Spawns a shell command inside a real PTY so the child sees an interactive
/// terminal. Identical interface to `spawn_interactive` but with PTY support,
/// enabling arrow-key history, Ctrl+C, and proper interactive programs.
#[tauri::command]
pub async fn spawn_pty_shell(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    command: String,
    envs: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use tauri::Emitter;
    use tokio::sync::mpsc;

    let procs_arc    = state.processes.clone();
    let stdins_arc   = state.stdin_senders.clone();
    let resizers_arc = state.pty_resizers.clone();

    {
        let mut procs = procs_arc.lock().await;
        if let Some(tracked) = procs.remove(&service_id) { tracked.notify.notify_waiters(); }
    }
    stdins_arc.lock().await.remove(&service_id);
    resizers_arc.lock().await.remove(&service_id);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("PTY open failed: {e}"))?;

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = CommandBuilder::new("cmd");
        c.arg("/C");
        c.arg(&command);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if std::path::Path::new("/bin/zsh").exists() { "/bin/zsh".to_string() } else { "sh".to_string() }
        });
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l"); // Adding login shell flag
        c.arg("-c");
        c.arg(&command);
        c
    };

    if let Some(ref env_map) = envs {
        for (k, v) in env_map { cmd.env(k, v); }
    }

    let mut child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn: {e}"))?;
    let slave = pair.slave;

    let (async_tx, mut async_rx) = mpsc::unbounded_channel::<String>();
    stdins_arc.lock().await.insert(service_id.clone(), async_tx);

    let (sync_tx, sync_rx) = std::sync::mpsc::channel::<String>();
    tokio::spawn(async move {
        while let Some(data) = async_rx.recv().await {
            if sync_tx.send(data).is_err() { break; }
        }
    });

    let pty_writer = pair.master.take_writer()
        .map_err(|e| format!("PTY writer error: {e}"))?;
    std::thread::spawn(move || {
        use std::io::Write;
        let mut w = pty_writer;
        for data in sync_rx {
            if w.write_all(data.as_bytes()).is_err() || w.flush().is_err() { break; }
        }
    });

    // ── PTY resize handler ────────────────────────────────────────────────────
    let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<(u16, u16)>();
    resizers_arc.lock().await.insert(service_id.clone(), resize_tx);

    let pty_reader = pair.master.try_clone_reader()
        .map_err(|e| format!("PTY reader error: {e}"))?;

    let master = pair.master;
    let (resize_sync_tx, resize_sync_rx) = std::sync::mpsc::channel::<(u16, u16)>();
    tokio::spawn(async move {
        while let Some(size) = resize_rx.recv().await {
            if resize_sync_tx.send(size).is_err() { break; }
        }
    });
    std::thread::spawn(move || {
        for (rows, cols) in resize_sync_rx {
            let _ = master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
        }
    });

    let notify = std::sync::Arc::new(tokio::sync::Notify::new());
    procs_arc.lock().await.insert(service_id.clone(), crate::state::TrackedProcess {
        notify: notify.clone(),
        pid: 0, // PTY shell — no direct PID
        started_at: std::time::Instant::now(),
    });

    {
        let app2  = app.clone();
        let sid   = service_id.clone();
        let stop  = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stop2 = stop.clone();
        let n     = notify.clone();

        std::thread::spawn(move || {
            use std::io::Read;
            let mut r = pty_reader;
            let mut buf = vec![0u8; 4096];
            loop {
                if stop2.load(std::sync::atomic::Ordering::Relaxed) { break; }
                match r.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n_bytes) => {
                        let chunk = String::from_utf8_lossy(&buf[..n_bytes]).to_string();
                        let _ = app2.emit("pty-output", serde_json::json!({
                            "serviceId": sid,
                            "data": chunk,
                        }));
                    }
                }
            }
        });

        tokio::spawn(async move {
            n.notified().await;
            stop.store(true, std::sync::atomic::Ordering::Relaxed);
        });
    }

    {
        let app2    = app.clone();
        let sid     = service_id.clone();
        let killed  = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let killed2 = killed.clone();
        let n = notify.clone();
        tokio::spawn(async move {
            n.notified().await;
            killed2.store(true, std::sync::atomic::Ordering::Relaxed);
        });
        tokio::task::spawn_blocking(move || {
            let rt     = tokio::runtime::Handle::current();
            let _slave = slave;
            loop {
                if killed.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = child.kill();
                    break;
                }
                match child.try_wait() {
                    Ok(Some(_)) | Err(_) => break,
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
                }
            }
            drop(_slave);
            rt.block_on(async {
                procs_arc.lock().await.remove(&sid);
                stdins_arc.lock().await.remove(&sid);
                resizers_arc.lock().await.remove(&sid);
                let _ = app2.emit("service-stopped", sid);
            });
        });
    }

    Ok(())
}

/// Resizes the PTY associated with a running session to match the xterm.js display size.
/// Must be called after fit() and on every terminal resize to avoid cursor corruption.
#[tauri::command]
pub async fn resize_pty(
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let resizers = state.pty_resizers.lock().await;
    if let Some(tx) = resizers.get(&service_id) {
        tx.send((rows, cols)).map_err(|e| e.to_string())
    } else {
        Ok(()) // no PTY running, silently ignore
    }
}

/// Sends a line of text to the stdin of a running interactive process.
#[tauri::command]
pub async fn write_stdin_line(
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    line: String,
) -> Result<(), String> {
    let senders = state.stdin_senders.lock().await;
    if let Some(tx) = senders.get(&service_id) {
        tx.send(line).map_err(|e| e.to_string())
    } else {
        Err("No active session with that id".to_string())
    }
}

/// Opens the system's default terminal emulator with the given SSH command.
/// This gives the user a real interactive SSH session outside the app.
#[tauri::command]
pub fn ec2_open_terminal(ssh_command: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", &ssh_command])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW for the launcher
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"tell application "Terminal" to do script "{}""#,
            ssh_command.replace('"', r#"\""#)
        );
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators in order of preference
        let terminals: &[(&str, Vec<&str>)] = &[
            ("gnome-terminal", vec!["--", "bash", "-c"]),
            ("konsole",        vec!["-e"]),
            ("xfce4-terminal", vec!["-e"]),
            ("xterm",          vec!["-e"]),
            ("x-terminal-emulator", vec!["-e"]),
        ];
        for (term, args) in terminals {
            let mut cmd = std::process::Command::new(term);
            for arg in args {
                cmd.arg(arg);
            }
            cmd.arg(&ssh_command);
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("No supported terminal emulator found. Install gnome-terminal, konsole, or xterm.".to_string());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

#[tauri::command]
pub async fn ec2_download_aws_ca(target_path: String) -> Result<String, String> {
    let url = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem";
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Failed to download certificate: HTTP {}", resp.status()));
    }
    let content = resp.text().await.map_err(|e| e.to_string())?;
    std::fs::write(&target_path, content).map_err(|e| e.to_string())?;
    Ok(target_path)
}
