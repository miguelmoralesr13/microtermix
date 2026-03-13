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

    // The path to watch is the .git directory
    let git_path = Path::new(&project_path).join(".git");
    if !git_path.exists() {
        return Err("Not a git repository (no .git folder found)".to_string());
    }

    // Use a channel to throttle/debounce events
    let (tx, mut rx) = tokio::sync::mpsc::channel(10);

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // Filter events: HEAD, index, and refs. Ignore lock files.
                let should_notify = event.paths.iter().any(|p| {
                    let s = p.to_string_lossy();
                    (s.contains("HEAD") || s.contains("index") || s.contains("refs")) 
                    && !s.ends_with(".lock")
                });

                if should_notify {
                    let _ = tx.blocking_send(());
                }
            }
        },
        Config::default(),
    ).map_err(|e| e.to_string())?;

    watcher.watch(&git_path, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

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
        // Debounce: wait for silence
        while let (Some(_)) = rx.recv().await {
            // Wait for 2 seconds of silence before notifying to avoid spam
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            
            // Drain all intermediate events
            while let Ok(_) = rx.try_recv() {}
            
            // Emit event to frontend
            let _ = app_handle_clone.emit("git-changed", project_path_clone.clone());
        }
    });

    // --- AUTO-FETCHER LOOP ---
    // This part runs in the background for this specific repo
    let project_path_for_fetch = project_path.clone();
    tauri::async_runtime::spawn(async move {
        // Initial delay to not saturate startup
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        
        loop {
            // Run git fetch silently
            let mut fetch_cmd = AsyncCommand::new("git");
            fetch_cmd.args(["fetch", "--quiet", "--no-tags"])
                .current_dir(&project_path_for_fetch)
                .env("GIT_TERMINAL_PROMPT", "0")
                .env("GIT_ASKPASS", "echo")
                .env("GIT_HTTP_LOW_SPEED_LIMIT", "100")
                .env("GIT_HTTP_LOW_SPEED_TIME", "10")
                .env("GIT_CONFIG_COUNT", "1")
                .env("GIT_CONFIG_KEY_0", "http.connectTimeout")
                .env("GIT_CONFIG_VALUE_0", "10")
                .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10 -o BatchMode=yes");

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                fetch_cmd.creation_flags(0x08000000);
            }

            // Execute fetch - we don't care about the result, 
            // if it fails (no internet, no remote), we just try again later.
            let _ = fetch_cmd.output().await;

            // Wait 5 minutes before next fetch
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
