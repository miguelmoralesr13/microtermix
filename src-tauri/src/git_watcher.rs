use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config, Event};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use crate::state::AppState;
use tokio::process::Command as AsyncCommand;

pub fn start_watching_repo(
    app_handle: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let project_path_clone = project_path.clone();
    let app_handle_clone = app_handle.clone();

    let root_path = Path::new(&project_path);
    if !root_path.exists() {
        return Err("Project path does not exist".to_string());
    }

    // Use a channel to throttle/debounce events
    let (tx, mut rx) = tokio::sync::mpsc::channel(10);

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // Filter events: 
                // 1. Changes inside .git (HEAD, index, refs)
                // 2. Changes to source files (not in node_modules, target, etc.)
                let should_notify = event.paths.iter().any(|p| {
                    let s = p.to_string_lossy();
                    
                    // Always notify on .git structural changes
                    if s.contains(".git/HEAD") || s.contains(".git/index") || s.contains(".git/refs") {
                        return !s.ends_with(".lock");
                    }

                    // Ignore common heavy or temporary directories
                    if s.contains("node_modules") || s.contains("target") || s.contains(".next") || s.contains("dist") || s.contains(".git") {
                        return false;
                    }

                    // For other files, notify if they are not lock files
                    !s.ends_with(".lock") && !s.ends_with("~")
                });

                if should_notify {
                    let _ = tx.blocking_send(());
                }
            }
        },
        Config::default(),
    ).map_err(|e| e.to_string())?;

    // Watch the entire project root
    watcher.watch(root_path, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

    // Get state and store the watcher
    let app_handle_for_store = app_handle.clone();
    let project_path_for_store = project_path.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle_for_store.state::<AppState>();
        let mut watchers = state.git_watchers.lock().await;
        watchers.insert(project_path_for_store, Box::new(watcher));
    });

    // Spawn a task to handle the throttled notifications
    tauri::async_runtime::spawn(async move {
        while let Some(_) = rx.recv().await {
            // Wait for 1.5 seconds of silence (debounce)
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            while let Ok(_) = rx.try_recv() {}
            let _ = app_handle_clone.emit("git-changed", project_path_clone.clone());
        }
    });

    // --- AUTO-FETCHER LOOP ---
    let project_path_for_fetch = project_path.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            let mut fetch_cmd = AsyncCommand::new("git");
            fetch_cmd.args(["fetch", "--quiet", "--no-tags"])
                .current_dir(&project_path_for_fetch)
                .env("GIT_TERMINAL_PROMPT", "0")
                .env("GIT_ASKPASS", "echo")
                .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10 -o BatchMode=yes");

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                fetch_cmd.creation_flags(0x08000000);
            }

            let _ = fetch_cmd.output().await;
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_watching_repo(
    state: tauri::State<'_, AppState>,
    project_path: String,
) -> Result<(), String> {
    let mut watchers = state.git_watchers.lock().await;
    watchers.remove(&project_path);
    Ok(())
}

#[tauri::command]
pub async fn watch_repo(
    app_handle: AppHandle,
    project_path: String,
) -> Result<(), String> {
    start_watching_repo(app_handle, project_path)
}
