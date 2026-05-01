use std::collections::HashMap;

use tauri::{AppHandle, State};

use crate::AppState;

/// Spawns an interactive PTY shell in the project directory for git operations.
#[tauri::command]
pub async fn spawn_local_git_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
) -> Result<String, String> {
    let service_id = "global::git-terminal ".to_string();

    // If already exists, return the ID without creating another
    {
        let procs = state.processes.lock().await;
        if procs.contains_key(&service_id) {
            return Ok(service_id);
        }
    }

    let (program, args) = if cfg!(target_os = "windows") {
        ("powershell.exe".to_string(), vec!["-NoLogo".to_string()])
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "sh".to_string());
        (shell, vec![])
    };

    crate::ec2::spawn_pty_process(
        app,
        state,
        service_id.clone(),
        program,
        args,
        Some(project_path),
        Some(HashMap::new()),
    ).await?;

    Ok(service_id)
}
