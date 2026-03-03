use serde::{Deserialize, Serialize};

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct Ec2Credentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

async fn ec2_client(c: &Ec2Credentials) -> aws_sdk_ec2::Client {
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
        if let Some(notify) = procs.remove(&service_id) {
            notify.notify_waiters();
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
    {
        let mut procs = procs_arc.lock().await;
        procs.insert(service_id.clone(), notify.clone());
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
                _ = n.notified() => { let _ = child.kill().await; }
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
pub async fn spawn_process(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    service_id: String,
    program: String,
    args: Vec<String>,
    envs: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as AsyncCommand;
    use tokio::sync::mpsc;
    use std::process::Stdio;

    let procs_arc = state.processes.clone();
    let stdins_arc = state.stdin_senders.clone();

    // Kill any existing session with the same id
    {
        let mut procs = procs_arc.lock().await;
        if let Some(notify) = procs.remove(&service_id) {
            notify.notify_waiters();
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

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
    procs_arc.lock().await.insert(service_id.clone(), notify.clone());

    // Stdin writer task
    {
        let n = notify.clone();
        let mut handle = stdin_handle;
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            loop {
                tokio::select! {
                    _ = n.notified() => break,
                    line_opt = rx.recv() => match line_opt {
                        Some(line) => {
                            if handle.write_all(line.as_bytes()).await.is_err() { break; }
                            if handle.write_all(b"\n").await.is_err() { break; }
                        }
                        None => break,
                    }
                }
            }
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
                _ = n.notified() => { let _ = child.kill().await; }
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
